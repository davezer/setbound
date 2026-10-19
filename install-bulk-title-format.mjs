import fs from 'node:fs';
import path from 'node:path';

const files = {
  page: path.join(process.cwd(), 'src/routes/admin/import-bulk/+page.svelte'),
  api: path.join(process.cwd(), 'src/routes/api/import/+server.js')
};
for (const [label, filename] of Object.entries(files)) {
  if (!fs.existsSync(filename)) throw Error(`Missing ${label} file: ${filename}. No changes made.`);
}
const originals = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, 'utf8')]));
function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw Error(`Expected exactly one ${label} anchor, found ${count}. No changes made.`);
  return source.replace(before, () => after);
}
const formatter = String.raw`  const SPECIAL = new Map(Object.entries({
    nba:'NBA', nfl:'NFL', mlb:'MLB', nhl:'NHL', mls:'MLS', wwe:'WWE', ufc:'UFC', fifa:'FIFA',
    f1:'F1', wnba:'WNBA', ncaa:'NCAA', rc:'RC', sdcc:'SDCC', nycc:'NYCC', nscc:'NSCC',
    prizm:'Prizm', topps:'Topps', bowman:'Bowman', chrome:'Chrome', 'o-pee-chee':'O-Pee-Chee'
  }));
  function titleWord(word) {
    if (word.toLowerCase() === 'x') return 'x';
    if (SPECIAL.has(word.toLowerCase())) return SPECIAL.get(word.toLowerCase());
    return word.split(/([-'])/).map((part, i, parts) => part === '-' || part === "'" ? part : (i > 0 && parts[i-1] === "'" && part.toLowerCase() === 's') ? 's' :
      (SPECIAL.get(part.toLowerCase()) || (part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : ''))
    ).join('');
  }
  function formattedName(file) {
    const base = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    const season = file.name.match(/^(19\d{2}|20\d{2})[-_](\d{2})(?:[-_]|\.)/);
    const year = file.name.match(/^(19\d{2}|20\d{2})(?:[-_\s]|\.)/);
    const prefix = season ? season[1] + '-' + season[2] : year ? year[1] : String(new Date().getFullYear());
    const rest = base.replace(/^(?:19|20)\d{2}(?:\s+\d{2})?\s*/, '').trim();
    return { year: Number(prefix.slice(0,4)), name: prefix + ' ' + (rest || base).split(/\s+/).map(titleWord).join(' ').replace(/\bO Pee Chee\b/g, 'O-Pee-Chee') };
  }
`;
let page = replaceOnce(originals.page,
  "  const prettyName = file => file.name.replace(/\\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\\s+/g, ' ').trim();",
  formatter, 'formatter');
page = replaceOnce(page,
`    const full = prettyName(file);
    const m = full.match(/(?:^|\\s)((?:19|20)\\d{2})(?:[-– ](\\d{2}))?(?=\\s|$)/);
    const year = m ? Number(m[1]) : new Date().getFullYear();
    const name = full.replace(/^\\s*(?:19|20)\\d{2}(?:\\s+\\d{2})?\\s*/,'').trim();`,
`    const { year, name } = formattedName(file);`, 'name guess');
page = replaceOnce(page, 'return {year,name: name || full,manufacturerId:', 'return {year,name,manufacturerId:', 'guess return');
let api = replaceOnce(originals.api,
`\t\tconst displayName = productDisplayName(body.name, year);
\t\tconst canonicalName = \`\${year} \${displayName}\`.trim();
\t\tconst slug = \`\${year}-\${slugify(displayName)}\`;`,
`\t\tconst seasonMatch = String(body.name).trim().match(new RegExp('^' + year + '-(\\\\d{2})\\\\s+(.+)$'));
\t\tconst displayName = seasonMatch ? seasonMatch[2] : productDisplayName(body.name, year);
\t\tconst canonicalName = seasonMatch ? \`\${year}-\${seasonMatch[1]} \${displayName}\` : \`\${year} \${displayName}\`;
\t\tconst slug = \`\${year}-\${slugify(seasonMatch ? seasonMatch[1] + ' ' + displayName : displayName)}\`;`, 'API name and slug');
// Only a write after every anchor has matched; backups are kept outside src.
const backupDir = path.join(process.cwd(), '.setbound-title-backup-' + Date.now());
fs.mkdirSync(backupDir);
fs.writeFileSync(path.join(backupDir, 'import-bulk-page.svelte'), originals.page);
fs.writeFileSync(path.join(backupDir, 'api-import-server.js'), originals.api);
try {
  fs.writeFileSync(files.page, page);
  fs.writeFileSync(files.api, api);
} catch (error) {
  fs.writeFileSync(files.page, originals.page);
  fs.writeFileSync(files.api, originals.api);
  throw error;
}
console.log('Bulk importer title formatting installed. Backups:', backupDir);
