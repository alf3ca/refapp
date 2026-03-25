const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const txtPath = path.join(root, 'OYFL_2025_2026_registered_squads_partial.txt');
const gamesPath = path.join(root, 'games.json');

const lines = fs.readFileSync(txtPath, 'utf8').split(/\r?\n/);

let inPages = false;
const rawTeams = [];

for (const lineRaw of lines) {
  const line = lineRaw.trim();
  if (!line) continue;

  if (/^Page\s+1$/i.test(line)) {
    inPages = true;
    continue;
  }

  if (!inPages) continue;
  if (/^Page\s+\d+$/i.test(line)) continue;

  rawTeams.push(line);
}

function cleanClubName(entry) {
  let value = entry.trim();
  value = value.replace(/\bUnder\s*(\d{1,2})s?\b/gi, 'U$1');
  value = value.replace(/\bU\d{1,2}s?(?:[-–]\d{1,2})?\b[\s\S]*$/i, '');
  value = value.replace(/^(.+?)\s+\1$/i, '$1');
  value = value.replace(/\s+/g, ' ').trim();
  value = value.replace(/[\s,.'-]+$/g, '').trim();

  if (/end of extracted partial list/i.test(value)) return '';
  if (/\bwhitelands\b.*\bwhitelands\b/i.test(value)) return 'FC Whitelands';
  if (/\bbanbury united youth\b.*\bbanbury united yout\b/i.test(value)) return 'Banbury United Youth';

  return value;
}

const teams = Array.from(
  new Set(
    rawTeams
      .map(cleanClubName)
      .filter(Boolean)
  )
).sort((a, b) => a.localeCompare(b));

const data = JSON.parse(fs.readFileSync(gamesPath, 'utf8'));
data.teams = teams;

fs.writeFileSync(gamesPath, `${JSON.stringify(data, null, 2)}\n`);

console.log(`Updated games.json teams from partial file: ${teams.length} teams`);
