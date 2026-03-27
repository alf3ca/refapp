require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const multer = require('multer');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 5000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'default-dev-secret-change-me';
const ACCOUNTS_FILE = path.join(__dirname, 'accounts.json');
const GAMES_FILE = path.join(__dirname, 'games.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const AGE_GROUPS = Array.from({ length: 15 }, (_, index) => `U${index + 7}`);
const MATCH_ROLES = ['Referee', 'Assistant Referee', 'Fourth Official'];
const MATCH_STATUSES = ['upcoming', 'completed', 'cancelled'];

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, UPLOADS_DIR);
  },
  filename: (_req, file, callback) => {
    const timestamp = Date.now();
    const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    callback(null, `${timestamp}_${safeOriginal}`);
  }
});

const upload = multer({ storage });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/static', express.static(path.join(__dirname, 'static')));
app.use('/uploads', express.static(UPLOADS_DIR));

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 2 * 60 * 60 * 1000,
      httpOnly: false,
      secure: false,
      sameSite: 'lax'
    }
  })
);

function loadAccounts() {
  try {
    if (!fs.existsSync(ACCOUNTS_FILE)) {
      return [];
    }
    const raw = fs.readFileSync(ACCOUNTS_FILE, 'utf-8');
    return JSON.parse(raw).referees || [];
  } catch (err) {
    console.error('Error loading accounts:', err);
    return [];
  }
}

function saveAccounts(accounts) {
  try {
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify({ referees: accounts }, null, 2));
  } catch (err) {
    console.error('Error saving accounts:', err);
  }
}

// User-specific game data loading
function loadUserGameData(userId) {
  const defaults = {
    games: [],
    teams: [],
    venues: [],
    leagues: [],
    reports: [],
    discipline: [],
    reflections: [],
    fitness: [],
    contacts: [],
    expenses: [],
    extras: {
      preMatchChecklist: [],
      packingChecklist: [],
      kitInventory: []
    },
    performanceTargets: []
  };

  try {
    if (!fs.existsSync(GAMES_FILE)) {
      return defaults;
    }

    const raw = fs.readFileSync(GAMES_FILE, 'utf-8');
    const parsed = JSON.parse(raw);

    // User data is stored under userId key
    return {
      ...defaults,
      ...(parsed[userId] || {})
    };
  } catch (err) {
    console.error('Error loading game data for user', userId, ':', err);
    return defaults;
  }
}

// User-specific game data saving
function saveUserGameData(userId, data) {
  try {
    let allData = {};
    if (fs.existsSync(GAMES_FILE)) {
      const raw = fs.readFileSync(GAMES_FILE, 'utf-8');
      allData = JSON.parse(raw) ||  {};
    }
    allData[userId] = data;
    fs.writeFileSync(GAMES_FILE, JSON.stringify(allData, null, 2));
  } catch (err) {
    console.error('Error saving game data for user', userId, ':', err);
  }
}

// Consolidated ID generation function
function getNextId(items = []) {
  if (!items || items.length === 0) return 1;
  const ids = items.map((item) => Number(item.id) || 0);
  return ids.length > 0 ? Math.max(...ids) + 1 : 1;
}

function parseMatchDateTime(match) {
  if (!match.matchDate) return null;
  const time = match.kickoffTime || '00:00';
  const value = new Date(`${match.matchDate}T${time}:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}

function getStartOfWeek(dateValue) {
  const date = new Date(dateValue);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getEndOfWeek(startOfWeek) {
  const end = new Date(startOfWeek);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function getSeasonLabel(dateText) {
  if (!dateText) return 'Unknown';
  const dateValue = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(dateValue.getTime())) return 'Unknown';

  const year = dateValue.getFullYear();
  const month = dateValue.getMonth();
  if (month >= 6) {
    return `${year}/${String(year + 1).slice(2)}`;
  }
  return `${year - 1}/${String(year).slice(2)}`;
}

function escapeCsvCell(value) {
  const raw = String(value ?? '');
  if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function findByUsername(accounts, username) {
  return accounts.find(
    (account) => account.username.toLowerCase() === username.toLowerCase()
  );
}

function findByEmail(accounts, email) {
  return accounts.find(
    (account) => account.email.toLowerCase() === email.toLowerCase()
  );
}

function requireLogin(req, res, next) {
  console.log('🔍 requireLogin check:', {
    hasSessionId: !!req.session.userId,
    sessionId: req.session.userId,
    headers: req.headers.cookie ? 'Cookies present' : 'NO COOKIES'
  });

  if (!req.session.userId) {
    console.log('❌ No session - redirecting to /');
    return res.redirect('/');
  }
  
  // Load user data to ensure it's current
  try {
    const accounts = loadAccounts();
    const user = accounts.find((acc) => acc.id === req.session.userId);
    
    if (!user) {
      console.log('❌ User not found in accounts - destroying session and redirecting to /');
      req.session.destroy();
      return res.redirect('/');
    }
    
    req.session.user = user;
    console.log('✅ Session valid for user:', user.username);
  } catch (err) {
    console.error('Error in requireLogin:', err);
    return res.status(500).send('An error occurred');
  }
  
  return next();
}

app.get('/', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/dashboard');
  }
  return res.render('home');
});

app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  try {
    const username = (req.body.username || '').trim();
    const password = (req.body.password || '').trim();

    if (!username || !password) {
      return res.status(400).render('login', { error: 'Username and password required' });
    }

    const accounts = loadAccounts();
    const user = accounts.find(
      (account) => account.username.toLowerCase() === username.toLowerCase()
    );

    if (!user) {
      return res.status(401).render('login', { error: 'Invalid credentials' });
    }

    // Compare plain text password
    if (password !== user.password) {
      return res.status(401).render('login', { error: 'Invalid credentials' });
    }

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.name = user.name;

    console.log('✅ Login successful for user:', user.username);
    console.log('📍 Redirecting to /dashboard');
    return res.redirect('/dashboard');
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).render('login', { error: 'An error occurred during login' });
  }
});

app.get('/register', (req, res) => {
  res.render('register', { error: null });
});

app.post('/register', (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    const username = (req.body.username || '').trim();
    const email = (req.body.email || '').trim();
    const experience = (req.body.experience || '').trim() || 'Not specified';
    const password = (req.body.password || '').trim();

    // Input validation
    if (!name || !username || !email || !password) {
      return res.status(400).render('register', { error: 'All required fields must be filled' });
    }

    if (username.length < 3) {
      return res.status(400).render('register', { error: 'Username must be at least 3 characters' });
    }

    if (password.length < 6) {
      return res.status(400).render('register', { error: 'Password must be at least 6 characters' });
    }

    // Email validation (basic)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).render('register', { error: 'Invalid email format' });
    }

    const accounts = loadAccounts();

    if (findByUsername(accounts, username)) {
      return res.status(409).render('register', { error: 'Username already exists' });
    }

    if (findByEmail(accounts, email)) {
      return res.status(409).render('register', { error: 'Email already already registered' });
    }

    const newUser = {
      id: getNextId(accounts),
      username,
      email,
      name,
      experience,
      password,
      createdAt: new Date().toISOString()
    };

    accounts.push(newUser);
    saveAccounts(accounts);

    return res.redirect('/login?registered=1');
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).render('register', { error: 'An error occurred during registration' });
  }
});

app.get('/dashboard', requireLogin, (req, res) => {
  const accounts = loadAccounts();
  const user = accounts.find((account) => account.id === req.session.userId);
  const gameData = loadUserGameData(req.session.userId);

  if (!user) {
    req.session.destroy(() => {});
    return res.redirect('/');
  }

  const now = new Date();
  const startOfWeek = getStartOfWeek(now);
  const endOfWeek = getEndOfWeek(startOfWeek);

  const myMatches = gameData.games
    .filter((match) => match.createdBy === req.session.userId)
    .map((match) => ({
      ...match,
      parsedDateTime: parseMatchDateTime(match)
    }));

  const nextMatch = myMatches
    .filter((match) => match.status === 'upcoming' && match.parsedDateTime && match.parsedDateTime >= now)
    .sort((left, right) => left.parsedDateTime - right.parsedDateTime)[0] || null;

  const weekFixtures = myMatches
    .filter((match) => {
      if (!match.parsedDateTime) return false;
      return match.parsedDateTime >= startOfWeek && match.parsedDateTime <= endOfWeek;
    })
    .sort((left, right) => left.parsedDateTime - right.parsedDateTime);

  const unpaidMatches = myMatches.filter(
    (match) => Number(match.matchFee || 0) > 0 && !match.feePaid
  );

  const unpaidFeesTotal = unpaidMatches.reduce(
    (sum, match) => sum + Number(match.matchFee || 0),
    0
  );

  const reportsDue = myMatches.filter(
    (match) => match.status === 'completed' && !match.reportSubmitted
  );

  const recentNotes = myMatches
    .filter((match) => (match.personalNotes && match.personalNotes.trim()) || (match.incidentNotes && match.incidentNotes.trim()))
    .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0))
    .slice(0, 5);

  return res.render('dashboard', {
    user,
    allUsers: accounts,
    summary: {
      nextMatch,
      weekFixtures,
      unpaidCount: unpaidMatches.length,
      unpaidFeesTotal,
      reportsDueCount: reportsDue.length,
      recentNotes
    }
  });
});

app.get('/my-games', requireLogin, (req, res) => {
  const accounts = loadAccounts();
  const user = accounts.find((account) => account.id === req.session.userId);
  const gameData = loadUserGameData(req.session.userId);

  if (!user) {
    req.session.destroy(() => {});
    return res.redirect('/');
  }

  const myGames = gameData.games
    .filter((game) => game.createdBy === req.session.userId)
    .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));

  return res.render('my-games', {
    user,
    teams: gameData.teams,
    venues: gameData.venues,
    leagues: gameData.leagues,
    ageGroups: AGE_GROUPS,
    matchRoles: MATCH_ROLES,
    matchStatuses: MATCH_STATUSES,
    myGames
  });
});

app.get('/games/new', requireLogin, (req, res) => {
  const gameData = loadUserGameData(req.session.userId);
  return res.render('add-game', {
    teams: gameData.teams,
    venues: gameData.venues,
    leagues: gameData.leagues,
    ageGroups: AGE_GROUPS,
    matchRoles: MATCH_ROLES,
    matchStatuses: MATCH_STATUSES
  });
});

app.get('/profile', requireLogin, (req, res) => {
  const accounts = loadAccounts();
  const user = accounts.find((account) => account.id === req.session.userId);

  if (!user) {
    req.session.destroy(() => {});
    return res.redirect('/');
  }

  return res.render('profile', { user });
});



app.post('/api/update-profile', requireLogin, (req, res) => {
  const { name, email, experience } = req.body;
  const accounts = loadAccounts();

  const account = accounts.find((item) => item.id === req.session.userId);

  if (!account) {
    return res.status(404).json({ error: 'Referee not found' });
  }

  if (name) account.name = String(name).trim();
  if (email) account.email = String(email).trim();
  if (experience !== undefined) account.experience = String(experience).trim();

  saveAccounts(accounts);
  return res.json({ success: true, message: 'Profile updated successfully' });
});

function createMatchHandler(req, res) {
  const homeTeam = (req.body.homeTeam || '').trim();
  const awayTeam = (req.body.awayTeam || '').trim();
  const venue = (req.body.venue || '').trim();
  const league = (req.body.league || '').trim();
  const ageGroup = (req.body.ageGroup || '').trim();
  const role = (req.body.role || '').trim();
  const status = (req.body.status || '').trim();
  const matchDate = (req.body.matchDate || '').trim();
  const kickoffTime = (req.body.kickoffTime || '').trim();
  const travelTimeMinutes = Number(req.body.travelTimeMinutes || 0);
  const travelDistanceMiles = Number(req.body.travelDistanceMiles || 0);
  const matchFee = Number(req.body.matchFee || 0);
  const feePaid = req.body.feePaid === 'true' || req.body.feePaid === true || req.body.feePaid === 'on';
  const reportSubmitted = req.body.reportSubmitted === 'true' || req.body.reportSubmitted === true || req.body.reportSubmitted === 'on';
  const personalNotes = (req.body.personalNotes || '').trim();
  const incidentNotes = (req.body.incidentNotes || '').trim();

  if (!homeTeam || !awayTeam || !venue || !league || !ageGroup || !role || !status || !matchDate || !kickoffTime) {
    return res.status(400).json({ error: 'All required match fields are required' });
  }

  if (!AGE_GROUPS.includes(ageGroup)) {
    return res.status(400).json({ error: 'Invalid age group' });
  }

  if (!MATCH_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Invalid match role' });
  }

  if (!MATCH_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid match status' });
  }

  const parsedDate = parseMatchDateTime({ matchDate, kickoffTime });
  if (!parsedDate) {
    return res.status(400).json({ error: 'Invalid date or kickoff time' });
  }

  const gameData = loadUserGameData(req.session.userId);

  if (!gameData.teams.some((team) => team.toLowerCase() === homeTeam.toLowerCase())) {
    gameData.teams.push(homeTeam);
  }

  if (!gameData.teams.some((team) => team.toLowerCase() === awayTeam.toLowerCase())) {
    gameData.teams.push(awayTeam);
  }

  if (!gameData.venues.some((existingVenue) => existingVenue.toLowerCase() === venue.toLowerCase())) {
    gameData.venues.push(venue);
  }

  if (!gameData.leagues.some((existingLeague) => existingLeague.toLowerCase() === league.toLowerCase())) {
    gameData.leagues.push(league);
  }

  const attachments = (req.files || []).map((file) => ({
    originalName: file.originalname,
    fileName: file.filename,
    path: `/uploads/${file.filename}`,
    mimeType: file.mimetype,
    size: file.size,
    uploadedAt: new Date().toISOString()
  }));

  const newGame = {
    id: getNextId(gameData.games),
    matchDate,
    kickoffTime,
    league,
    homeTeam,
    awayTeam,
    venue,
    ageGroup,
    role,
    status,
    travelTimeMinutes,
    travelDistanceMiles,
    matchFee,
    feePaid,
    reportSubmitted,
    personalNotes,
    incidentNotes,
    attachments,
    createdBy: req.session.userId,
    createdAt: new Date().toISOString()
  };

  gameData.games.push(newGame);
  saveUserGameData(req.session.userId, gameData);

  return res.status(201).json({ success: true, game: newGame });
}

app.post('/api/matches', requireLogin, upload.array('attachments', 10), createMatchHandler);
app.post('/api/games', requireLogin, createMatchHandler);

app.get('/reports/new', requireLogin, (req, res) => {
  const gameData = loadUserGameData(req.session.userId);
  const myMatches = gameData.games
    .filter((match) => match.createdBy === req.session.userId)
    .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));

  return res.render('report-new', { myMatches });
});

app.post('/api/reports', requireLogin, (req, res) => {
  const matchId = Number(req.body.matchId);
  const reportType = (req.body.reportType || '').trim();
  const content = (req.body.content || '').trim();
  const isDraft = req.body.isDraft === 'true' || req.body.isDraft === true || req.body.isDraft === 'on';

  if (!matchId || !reportType || !content) {
    return res.status(400).json({ error: 'Match, report type, and content are required' });
  }

  const gameData = loadUserGameData(req.session.userId);
  const match = gameData.games.find((item) => item.id === matchId && item.createdBy === req.session.userId);

  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  const report = {
    id: getNextId(gameData.reports),
    matchId,
    reportType,
    content,
    isDraft,
    createdBy: req.session.userId,
    createdAt: new Date().toISOString()
  };

  gameData.reports.push(report);
  if (!isDraft) {
    match.reportSubmitted = true;
  }
  saveUserGameData(req.session.userId, gameData);

  return res.status(201).json({ success: true, report });
});

app.get('/reports', requireLogin, (req, res) => {
  const gameData = loadUserGameData(req.session.userId);
  const myReports = gameData.reports
    .filter((report) => report.createdBy === req.session.userId)
    .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));

  const matchesById = new Map(
    gameData.games
      .filter((match) => match.createdBy === req.session.userId)
      .map((match) => [match.id, match])
  );

  return res.render('reports', { myReports, matchesById });
});

app.get('/api/reports/previous', requireLogin, (req, res) => {
  const reportType = String(req.query.reportType || '').trim();
  if (!reportType) {
    return res.status(400).json({ error: 'Report type is required' });
  }

  const gameData = loadUserGameData(req.session.userId);
  const previous = gameData.reports
    .filter((report) => report.createdBy === req.session.userId && report.reportType === reportType)
    .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0))[0];

  return res.json({ content: previous ? previous.content : '' });
});

app.get('/reports/:id/text', requireLogin, (req, res) => {
  const reportId = Number(req.params.id);
  const gameData = loadUserGameData(req.session.userId);
  const report = gameData.reports.find((item) => item.id === reportId && item.createdBy === req.session.userId);

  if (!report) {
    return res.status(404).send('Report not found');
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=report-${report.id}.txt`);
  return res.send(
    `Report ID: ${report.id}\nType: ${report.reportType}\nDraft: ${report.isDraft ? 'Yes' : 'No'}\nCreated: ${report.createdAt}\n\n${report.content}\n`
  );
});

app.get('/reports/:id/pdf', requireLogin, (req, res) => {
  const reportId = Number(req.params.id);
  const gameData = loadUserGameData(req.session.userId);
  const report = gameData.reports.find((item) => item.id === reportId && item.createdBy === req.session.userId);

  if (!report) {
    return res.status(404).send('Report not found');
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=report-${report.id}.pdf`);

  const pdf = new PDFDocument({ margin: 50 });
  pdf.pipe(res);
  pdf.fontSize(18).text('Match Report', { underline: true });
  pdf.moveDown();
  pdf.fontSize(12).text(`Report ID: ${report.id}`);
  pdf.text(`Type: ${report.reportType}`);
  pdf.text(`Draft: ${report.isDraft ? 'Yes' : 'No'}`);
  pdf.text(`Created: ${new Date(report.createdAt).toLocaleString()}`);
  pdf.moveDown();
  pdf.fontSize(12).text(report.content || '');
  pdf.end();
});

app.get('/discipline', requireLogin, (req, res) => {
  const query = String(req.query.q || '').trim().toLowerCase();
  const gameData = loadUserGameData(req.session.userId);
  let entries = (gameData.discipline || [])
    .filter((entry) => entry.createdBy === req.session.userId)
    .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));

  if (query) {
    entries = entries.filter((entry) =>
      [entry.cardType, entry.playerName, entry.teamName, entry.offence, entry.competition]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }

  return res.render('discipline', { entries, query });
});

app.post('/api/discipline', requireLogin, (req, res) => {
  const cardType = (req.body.cardType || '').trim();
  const playerName = (req.body.playerName || '').trim();
  const teamName = (req.body.teamName || '').trim();
  const minute = Number(req.body.minute || 0);
  const offence = (req.body.offence || '').trim();
  const competition = (req.body.competition || '').trim();

  if (!cardType || !playerName || !teamName || !offence || !competition || minute < 0) {
    return res.status(400).json({ error: 'All discipline fields are required' });
  }

  const gameData = loadUserGameData(req.session.userId);
  const entry = {
    id: getNextId(gameData.discipline),
    cardType,
    playerName,
    teamName,
    minute,
    offence,
    competition,
    createdBy: req.session.userId,
    createdAt: new Date().toISOString()
  };

  gameData.discipline.push(entry);
  saveUserGameData(req.session.userId, gameData);
  return res.status(201).json({ success: true, entry });
});

app.get('/payments', requireLogin, (req, res) => {
  const gameData = loadUserGameData(req.session.userId);
  const matches = gameData.games.filter((match) => match.createdBy === req.session.userId);
  const expenses = gameData.expenses.filter((expense) => expense.createdBy === req.session.userId);

  const feeEntries = matches.map((match) => ({
    id: match.id,
    date: match.matchDate || (match.createdAt || '').slice(0, 10),
    type: 'Match Fee',
    amount: Number(match.matchFee || 0),
    paid: Boolean(match.feePaid),
    season: getSeasonLabel(match.matchDate || (match.createdAt || '').slice(0, 10)),
    notes: `${match.homeTeam || ''} vs ${match.awayTeam || ''}`
  }));

  const expenseEntries = expenses.map((expense) => ({
    id: expense.id,
    date: (expense.createdAt || '').slice(0, 10),
    type: 'Travel Expense',
    amount: Number(expense.amount || 0),
    paid: true,
    season: getSeasonLabel((expense.createdAt || '').slice(0, 10)),
    notes: expense.title
  }));

  const allEntries = [...feeEntries, ...expenseEntries].sort((left, right) => String(right.date).localeCompare(String(left.date)));
  const monthTotals = {};
  const seasonTotals = {};

  allEntries.forEach((entry) => {
    const month = (entry.date || '').slice(0, 7) || 'Unknown';
    monthTotals[month] = (monthTotals[month] || 0) + Number(entry.amount || 0);
    seasonTotals[entry.season] = (seasonTotals[entry.season] || 0) + Number(entry.amount || 0);
  });

  return res.render('payments', { matches, expenses, allEntries, monthTotals, seasonTotals });
});

app.post('/api/matches/:id/payment-status', requireLogin, (req, res) => {
  const matchId = Number(req.params.id);
  const feePaid = req.body.feePaid === true || req.body.feePaid === 'true' || req.body.feePaid === 'on';

  const gameData = loadUserGameData(req.session.userId);
  const match = gameData.games.find((item) => item.id === matchId && item.createdBy === req.session.userId);
  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  match.feePaid = feePaid;
  saveUserGameData(req.session.userId, gameData);
  return res.json({ success: true, match });
});

app.get('/payments/export.csv', requireLogin, (req, res) => {
  const gameData = loadUserGameData(req.session.userId);
  const matches = gameData.games.filter((match) => match.createdBy === req.session.userId);
  const expenses = gameData.expenses.filter((expense) => expense.createdBy === req.session.userId);

  const lines = ['Date,Type,Amount,Paid,Season,Notes'];
  matches.forEach((match) => {
    lines.push([
      escapeCsvCell(match.matchDate || (match.createdAt || '').slice(0, 10)),
      escapeCsvCell('Match Fee'),
      escapeCsvCell(Number(match.matchFee || 0).toFixed(2)),
      escapeCsvCell(match.feePaid ? 'Yes' : 'No'),
      escapeCsvCell(getSeasonLabel(match.matchDate || (match.createdAt || '').slice(0, 10))),
      escapeCsvCell(`${match.homeTeam || ''} vs ${match.awayTeam || ''}`)
    ].join(','));
  });

  expenses.forEach((expense) => {
    lines.push([
      escapeCsvCell((expense.createdAt || '').slice(0, 10)),
      escapeCsvCell('Travel Expense'),
      escapeCsvCell(Number(expense.amount || 0).toFixed(2)),
      escapeCsvCell('Yes'),
      escapeCsvCell(getSeasonLabel((expense.createdAt || '').slice(0, 10))),
      escapeCsvCell(expense.title || '')
    ].join(','));
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=payments-export.csv');
  return res.send(`${lines.join('\n')}\n`);
});

app.get('/performance', requireLogin, (req, res) => {
  const gameData = loadUserGameData(req.session.userId);
  const matches = gameData.games.filter((match) => match.createdBy === req.session.userId);
  const discipline = gameData.discipline.filter((entry) => entry.createdBy === req.session.userId);
  const targets = gameData.performanceTargets.filter((target) => target.createdBy === req.session.userId);

  const byRole = {};
  const byAge = {};
  const byCompetition = {};
  let cancellations = 0;

  matches.forEach((match) => {
    byRole[match.role || 'Unknown'] = (byRole[match.role || 'Unknown'] || 0) + 1;
    byAge[match.ageGroup || 'Unknown'] = (byAge[match.ageGroup || 'Unknown'] || 0) + 1;
    byCompetition[match.league || 'Unknown'] = (byCompetition[match.league || 'Unknown'] || 0) + 1;
    if (match.status === 'cancelled') cancellations += 1;
  });

  const cautions = discipline.filter((entry) => /yellow/i.test(entry.cardType)).length;
  const dismissals = discipline.filter((entry) => /red/i.test(entry.cardType)).length;
  const matchCount = matches.length || 1;

  return res.render('performance', {
    matches,
    targets,
    metrics: {
      byRole,
      byAge,
      byCompetition,
      cancellations,
      cautionsPerGame: cautions / matchCount,
      dismissalsPerGame: dismissals / matchCount
    }
  });
});

app.post('/api/performance/assessment', requireLogin, (req, res) => {
  const matchId = Number(req.body.matchId);
  const observerMark = Number(req.body.observerMark || 0);
  const selfRating = Number(req.body.selfRating || 0);

  if (!matchId) {
    return res.status(400).json({ error: 'Match is required' });
  }

  const gameData = loadUserGameData(req.session.userId);
  const match = gameData.games.find((item) => item.id === matchId && item.createdBy === req.session.userId);
  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  match.observerMark = observerMark;
  match.selfRating = selfRating;
  saveUserGameData(req.session.userId, gameData);
  return res.json({ success: true, match });
});

app.post('/api/performance/targets', requireLogin, (req, res) => {
  const title = (req.body.title || '').trim();
  const details = (req.body.details || '').trim();
  if (!title) {
    return res.status(400).json({ error: 'Target title is required' });
  }

  const gameData = loadUserGameData(req.session.userId);
  const target = {
    id: getNextId(gameData.performanceTargets),
    title,
    details,
    createdBy: req.session.userId,
    createdAt: new Date().toISOString()
  };
  gameData.performanceTargets.push(target);
  saveUserGameData(req.session.userId, gameData);
  return res.status(201).json({ success: true, target });
});

app.get('/reflections', requireLogin, (req, res) => {
  const gameData = loadUserGameData(req.session.userId);
  const entries = gameData.reflections
    .filter((entry) => entry.createdBy === req.session.userId)
    .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));
  return res.render('reflections', { entries });
});

app.post('/api/reflections', requireLogin, (req, res) => {
  const payload = {
    wentWell: (req.body.wentWell || '').trim(),
    wentBadly: (req.body.wentBadly || '').trim(),
    difficultIncidents: (req.body.difficultIncidents || '').trim(),
    positioningIssues: (req.body.positioningIssues || '').trim(),
    playerManagementLessons: (req.body.playerManagementLessons || '').trim(),
    improvementsNextTime: (req.body.improvementsNextTime || '').trim()
  };

  const hasData = Object.values(payload).some((value) => Boolean(value));
  if (!hasData) {
    return res.status(400).json({ error: 'At least one reflection field is required' });
  }

  const gameData = loadUserGameData(req.session.userId);
  const entry = {
    id: getNextId(gameData.reflections),
    ...payload,
    createdBy: req.session.userId,
    createdAt: new Date().toISOString()
  };

  gameData.reflections.push(entry);
  saveUserGameData(req.session.userId, gameData);
  return res.status(201).json({ success: true, entry });
});

app.get('/fitness', requireLogin, (req, res) => {
  const gameData = loadUserGameData(req.session.userId);
  const entries = gameData.fitness
    .filter((entry) => entry.createdBy === req.session.userId)
    .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));
  return res.render('fitness', { entries });
});

app.post('/api/fitness', requireLogin, (req, res) => {
  const entryType = (req.body.entryType || '').trim();
  const title = (req.body.title || '').trim();
  const details = (req.body.details || '').trim();
  const entryDate = (req.body.entryDate || '').trim();

  if (!entryType || !title || !entryDate) {
    return res.status(400).json({ error: 'Type, title, and date are required' });
  }

  const gameData = loadUserGameData(req.session.userId);
  const entry = {
    id: getNextId(gameData.fitness),
    entryType,
    title,
    details,
    entryDate,
    createdBy: req.session.userId,
    createdAt: new Date().toISOString()
  };

  gameData.fitness.push(entry);
  saveUserGameData(req.session.userId, gameData);
  return res.status(201).json({ success: true, entry });
});

app.get('/contacts', requireLogin, (req, res) => {
  const gameData = loadUserGameData(req.session.userId);
  const entries = gameData.contacts
    .filter((entry) => entry.createdBy === req.session.userId)
    .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));
  return res.render('contacts', { entries });
});

app.post('/api/contacts', requireLogin, (req, res) => {
  const category = (req.body.category || '').trim();
  const name = (req.body.name || '').trim();
  const phone = (req.body.phone || '').trim();
  const email = (req.body.email || '').trim();
  const notes = (req.body.notes || '').trim();

  if (!category || !name) {
    return res.status(400).json({ error: 'Contact category and name are required' });
  }

  const gameData = loadUserGameData(req.session.userId);
  const entry = {
    id: getNextId(gameData.contacts),
    category,
    name,
    phone,
    email,
    notes,
    createdBy: req.session.userId,
    createdAt: new Date().toISOString()
  };

  gameData.contacts.push(entry);
  saveUserGameData(req.session.userId, gameData);
  return res.status(201).json({ success: true, entry });
});

app.get('/extras', requireLogin, (req, res) => {
  const gameData = loadUserGameData(req.session.userId);
  return res.render('extras', {
    preMatchChecklist: gameData.extras.preMatchChecklist,
    packingChecklist: gameData.extras.packingChecklist,
    kitInventory: gameData.extras.kitInventory
  });
});

app.post('/api/extras/checklist', requireLogin, (req, res) => {
  const listType = (req.body.listType || '').trim();
  const item = (req.body.item || '').trim();
  const allowed = ['preMatchChecklist', 'packingChecklist'];

  if (!allowed.includes(listType) || !item) {
    return res.status(400).json({ error: 'Checklist type and item are required' });
  }

  const gameData = loadUserGameData(req.session.userId);
  gameData.extras[listType].push({
    id: getNextId(gameData.extras[listType]),
    item,
    checked: false,
    createdAt: new Date().toISOString()
  });
  saveUserGameData(req.session.userId, gameData);
  return res.status(201).json({ success: true });
});

app.post('/api/extras/kit', requireLogin, (req, res) => {
  const item = (req.body.item || '').trim();
  const quantity = Number(req.body.quantity || 1);
  const notes = (req.body.notes || '').trim();

  if (!item) {
    return res.status(400).json({ error: 'Kit item is required' });
  }

  const gameData = loadUserGameData(req.session.userId);
  gameData.extras.kitInventory.push({
    id: getNextId(gameData.extras.kitInventory),
    item,
    quantity,
    notes,
    createdAt: new Date().toISOString()
  });
  saveUserGameData(req.session.userId, gameData);
  return res.status(201).json({ success: true });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on ${PORT}`);
});
