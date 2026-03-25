const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GAMES_FILE = path.join(ROOT, 'games.json');
const CLUBS_PAGE = 'https://oyfl.co.uk/clubs.html';

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(text) {
  return decodeEntities(text.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function uniq(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const trimmed = String(item || '').trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function normalizeTeamLabel(raw) {
  let value = raw.trim();
  value = decodeEntities(value);
  value = value.replace(/\bunder\b/gi, 'U');
  value = value.replace(/[\-_/]+/g, ' ');
  value = value.replace(/\s+/g, ' ').trim();

  const match = value.match(/^U\s*(7|8|9|10|11|12|13|14|15|16|17|18|19|20|21)\b\s*(.*)$/i);
  if (!match) return null;

  const number = match[1];
  const suffixRaw = (match[2] || '').trim();

  const noiseWords = new Set([
    'team',
    'teams',
    'age',
    'group',
    'football',
    'fc',
    'jfc',
    'afc',
    'mrjfc',
    'academy',
    'season',
    'squad',
    'home',
    'away',
    'vs',
    'v',
    'no'
  ]);

  const suffixTokens = suffixRaw
    .split(/\s+/)
    .map((token) => token.replace(/[^A-Za-z0-9]/g, '').trim())
    .filter((token) => token && !noiseWords.has(token.toLowerCase()))
    .filter((token) => token.toLowerCase() !== 'u')
    .filter((token) => !/^u(?:7|8|9|10|11|12|13|14|15|16|17|18|19|20|21)$/i.test(token));

  const suffixFormatted = suffixTokens
    .slice(0, 2)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(' ');

  if (suffixFormatted) {
    return `U${number} ${suffixFormatted}`;
  }

  return `U${number}`;
}

async function fetchText(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RefPortalBot/1.0)'
      }
    });
    if (!response.ok) {
      return null;
    }
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractClubLinks(clubsHtml) {
  const pairs = [];
  const regex = /<h4>([\s\S]*?)<\/h4>[\s\S]*?<ul class="social-icons">([\s\S]*?)<\/ul>/gi;

  for (const match of clubsHtml.matchAll(regex)) {
    const clubName = stripTags(match[1]).replace(/\s+/g, ' ').trim();
    if (!clubName || /member clubs/i.test(clubName)) continue;

    const socialBlock = match[2];
    const linkMatch = socialBlock.match(/<a href="([^"]+)"[^>]*>\s*<i class="fa fa-external-link"/i);
    if (!linkMatch) continue;

    let website = linkMatch[1].trim();
    if (website.startsWith('//')) website = `https:${website}`;
    pairs.push({ clubName, website });
  }

  return pairs;
}

function extractSquadsFromPage(pageText) {
  const cleaned = pageText
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');

  const ageFirstRegex = /\b(?:u|under)\s*-?\s*(?:7|8|9|10|11|12|13|14|15|16|17|18|19|20|21)(?:\s+[A-Za-z][A-Za-z0-9-]*){0,2}/gi;
  const nameFirstRegex = /\b([A-Za-z][A-Za-z0-9-]{2,}(?:\s+[A-Za-z][A-Za-z0-9-]{2,})?)\s+(?:u|under)\s*-?\s*(7|8|9|10|11|12|13|14|15|16|17|18|19|20|21)\b/gi;

  const extracted = [];
  for (const match of cleaned.matchAll(ageFirstRegex)) {
    const normalized = normalizeTeamLabel(match[0]);
    if (normalized) extracted.push(normalized);
  }

  const noisePrefixes = new Set([
    'league',
    'club',
    'team',
    'football',
    'academy',
    'oxfordshire',
    'youth',
    'junior',
    'juniors',
    'fixtures',
    'results'
  ]);

  for (const match of cleaned.matchAll(nameFirstRegex)) {
    const nameRaw = (match[1] || '').trim();
    const age = (match[2] || '').trim();
    if (!nameRaw || !age) continue;

    const tokens = nameRaw
      .split(/\s+/)
      .map((token) => token.replace(/[^A-Za-z0-9]/g, ''))
      .filter(Boolean)
      .filter((token) => !noisePrefixes.has(token.toLowerCase()))
      .slice(0, 2)
      .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase());

    if (tokens.length === 0) continue;
    extracted.push(`U${age} ${tokens.join(' ')}`);
  }

  return uniq(extracted);
}

async function run() {
  if (!fs.existsSync(GAMES_FILE)) {
    throw new Error('games.json not found');
  }

  const gamesData = JSON.parse(fs.readFileSync(GAMES_FILE, 'utf-8'));
  const clubsHtml = await fetchText(CLUBS_PAGE);
  if (!clubsHtml) {
    throw new Error('Could not fetch OYFL clubs page');
  }

  const clubLinks = extractClubLinks(clubsHtml);
  const clubWebsiteMap = Object.fromEntries(clubLinks.map((entry) => [entry.clubName, entry.website]));

  const teams = gamesData.teams || [];
  const clubTeams = gamesData.clubTeams || {};

  let scanned = 0;
  for (const clubName of teams) {
    const website = clubWebsiteMap[clubName];
    if (!website) {
      if (!Array.isArray(clubTeams[clubName])) clubTeams[clubName] = [];
      continue;
    }

    scanned += 1;
    const clubHtml = await fetchText(website, 10000);
    if (!clubHtml) {
      if (!Array.isArray(clubTeams[clubName])) clubTeams[clubName] = [];
      continue;
    }

    clubTeams[clubName] = extractSquadsFromPage(clubHtml);
  }

  gamesData.clubTeams = clubTeams;
  delete gamesData.clubWebsites;

  fs.writeFileSync(GAMES_FILE, JSON.stringify(gamesData, null, 2));

  const withSquads = Object.values(clubTeams).filter((items) => Array.isArray(items) && items.length > 0).length;
  console.log(`Processed ${scanned} club websites.`);
  console.log(`Found squad options for ${withSquads} clubs.`);
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
