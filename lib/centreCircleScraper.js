const puppeteer = require('puppeteer');

/**
 * Scrapes Centre Circle fixtures from the web app
 * @param {string} email - Centre Circle email
 * @param {string} password - Centre Circle password
 * @returns {Promise<Array>} Array of fixture objects
 */
async function scrapeCentreCircleFixtures(email, password) {
  let browser;
  try {
    console.log('🔍 Launching Puppeteer...');
    console.log('📌 Cache directory:', process.env.PUPPETEER_CACHE_DIR || 'default');
    
    // Let Puppeteer manage the browser download to the cache directory
    const launchOptions = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    };
    
    console.log('✅ Launching browser with Puppeteer-managed Chromium...');
    browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();
    const CC_LOGIN_URL = 'https://app.centrecircleapp.com/#/signin';

    console.log('📍 Navigating to Centre Circle login...');
    await page.goto(CC_LOGIN_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    console.log('🔐 Logging in...');
    // Fill in email
    await page.type('input[type="email"]', email, { delay: 50 });
    // Fill in password
    await page.type('input[type="password"]', password, { delay: 50 });
    // Click login button
    await page.click('button[type="submit"]');

    // Wait for navigation after login
    console.log('⏳ Waiting for login to complete...');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

    // Navigate to fixtures
    console.log('📋 Looking for Fixtures button...');
    await page.waitForSelector('button:contains("Fixtures"), a:contains("Fixtures")', { timeout: 10000 }).catch(() => {
      console.log('ℹ️ Fixtures selector not found, trying alternative search...');
    });

    // Try to find and click Fixtures button/link
    const fixturesLink = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, a'));
      return buttons.find(btn => btn.textContent.toLowerCase().includes('fixture'));
    });

    if (fixturesLink) {
      console.log('✅ Found Fixtures link, navigating...');
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
        page.click('button:contains("Fixtures"), a:contains("Fixtures")')
      ]).catch(() => {
        console.log('Navigation attempt completed');
      });
    } else {
      console.log('⚠️ Fixtures button not immediately visible, waiting...');
      await page.waitForTimeout(2000);
    }

    // Extract fixture data
    console.log('🎯 Extracting fixture data...');
    const fixtures = await page.evaluate(() => {
      const rows = [];
      const tableRows = document.querySelectorAll('tr, [role="row"], .fixture-row');
      
      tableRows.forEach((row) => {
        const cells = row.querySelectorAll('td, [role="gridcell"], .fixture-cell');
        if (cells.length > 0) {
          const fixture = {
            homeTeam: cells[0]?.textContent.trim() || '',
            awayTeam: cells[1]?.textContent.trim() || '',
            matchDate: cells[2]?.textContent.trim() || '',
            kickoffTime: cells[3]?.textContent.trim() || '',
            venue: cells[4]?.textContent.trim() || '',
            league: cells[5]?.textContent.trim() || '',
            ageGroup: cells[6]?.textContent.trim() || '',
            role: cells[7]?.textContent.trim() || '',
            contact: cells[8]?.textContent.trim() || ''
          };
          
          // Only add if it has essential data
          if (fixture.homeTeam && fixture.awayTeam) {
            rows.push(fixture);
          }
        }
      });

      return rows;
    });

    console.log(`✅ Extracted ${fixtures.length} fixtures`);
    await browser.close();
    return fixtures;

  } catch (error) {
    console.error('❌ Error scraping Centre Circle:', error);
    if (browser) {
      await browser.close();
    }
    throw new Error(`Failed to scrape Centre Circle: ${error.message}`);
  }
}

/**
 * Convert Centre Circle fixture to app game format
 * @param {Object} fixture - Centre Circle fixture
 * @param {number} userId - User ID
 * @returns {Object} Game object in app format
 */
function convertToGameFormat(fixture, userId) {
  // Parse date and time
  const dateStr = fixture.matchDate || '';
  const timeStr = fixture.kickoffTime || '00:00';
  
  // Try to parse various date formats (DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD)
  let matchDate = '';
  let kickoffTime = '00:00';
  
  if (dateStr) {
    const dateRegex = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/;
    const match = dateStr.match(dateRegex);
    if (match) {
      const [, day, month, year] = match;
      // Assume DD/MM/YYYY format first, then try MM/DD/YYYY
      let d = parseInt(day);
      let m = parseInt(month);
      if (d > 12) {
        // Definitely day > 12, so first param is day
        matchDate = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      } else if (m > 12) {
        // Second param is definitely not month, try swap
        matchDate = `${year}-${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}`;
      } else {
        // Ambiguous - try first format (DD/MM/YYYY)
        matchDate = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
  }

  if (timeStr && timeStr !== '00:00') {
    const timeRegex = /(\d{1,2}):?(\d{2})/;
    const timeMatch = timeStr.match(timeRegex);
    if (timeMatch) {
      const [, hours, minutes] = timeMatch;
      kickoffTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }

  // Default values and mappings
  const game = {
    matchDate: matchDate || new Date().toISOString().split('T')[0],
    kickoffTime: kickoffTime,
    homeTeam: fixture.homeTeam?.trim() || '',
    awayTeam: fixture.awayTeam?.trim() || '',
    venue: fixture.venue?.trim() || 'TBD',
    league: fixture.league?.trim() || 'Centre Circle Import',
    ageGroup: mapAgeGroup(fixture.ageGroup),
    role: mapRole(fixture.role),
    status: 'upcoming',
    travelTimeMinutes: 0,
    travelDistanceMiles: 0,
    matchFee: 0,
    feePaid: false,
    reportSubmitted: false,
    personalNotes: fixture.contact ? `Contact: ${fixture.contact}` : '',
    incidentNotes: ''
  };

  return game;
}

/**
 * Map Centre Circle age group to app format (U7-U21)
 * @param {string} ccAgeGroup - Centre Circle age group
 * @returns {string} Mapped age group
 */
function mapAgeGroup(ccAgeGroup) {
  if (!ccAgeGroup) return 'U10';
  
  const ageStr = ccAgeGroup.toUpperCase();
  const ageRegex = /U(\d+)/;
  const match = ageStr.match(ageRegex);
  
  if (match) {
    const age = parseInt(match[1]);
    if (age >= 7 && age <= 21) {
      return `U${age}`;
    }
  }
  
  return 'U10';
}

/**
 * Map Centre Circle role to app format (Referee, Assistant Referee, Fourth Official)
 * @param {string} ccRole - Centre Circle role
 * @returns {string} Mapped role
 */
function mapRole(ccRole) {
  if (!ccRole) return 'Referee';
  
  const role = ccRole.toLowerCase();
  if (role.includes('4th') || role.includes('fourth')) return 'Fourth Official';
  if (role.includes('assistant') || role.includes('ar')) return 'Assistant Referee';
  return 'Referee';
}

module.exports = {
  scrapeCentreCircleFixtures,
  convertToGameFormat,
  mapAgeGroup,
  mapRole
};
