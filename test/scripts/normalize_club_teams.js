const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'games.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

function prettify(label) {
  const text = String(label || '').trim();
  const match = text.match(/^U\s*(7|8|9|10|11|12|13|14|15|16|17|18|19|20|21)(.*)$/i);
  if (!match) return text;

  const number = match[1];
  const rest = (match[2] || '').trim();
  if (!rest) return `U${number}`;

  const noise = new Set(['home', 'away', 'vs', 'v', 'no', 'team', 'teams', 'squad', 'age', 'group', 'fc', 'jfc', 'afc', 'mrjfc']);

  const normalized = rest
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/([0-9])([A-Za-z])/g, '$1 $2')
    .replace(/([A-Za-z])([0-9])/g, '$1 $2')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .filter((token) => !noise.has(token.toLowerCase()))
    .filter((token) => token.toLowerCase() !== 'u')
    .filter((token) => !/^u(?:7|8|9|10|11|12|13|14|15|16|17|18|19|20|21)$/i.test(token))
    .slice(0, 2)
    .map((token) => token.length === 1
      ? token.toUpperCase()
      : token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(' ');

  return normalized ? `U${number} ${normalized}` : `U${number}`;
}

if (!data.clubTeams || typeof data.clubTeams !== 'object') {
  data.clubTeams = {};
}

for (const club of Object.keys(data.clubTeams)) {
  const arr = Array.isArray(data.clubTeams[club]) ? data.clubTeams[club] : [];
  const out = [];
  const seen = new Set();

  for (const item of arr) {
    const pretty = prettify(item);
    const key = pretty.toLowerCase();
    if (!seen.has(key) && pretty) {
      seen.add(key);
      out.push(pretty);
    }
  }

  data.clubTeams[club] = out;
}

delete data.clubWebsites;

fs.writeFileSync(file, JSON.stringify(data, null, 2));
console.log('Updated clubTeams labels to readable format and removed clubWebsites');
