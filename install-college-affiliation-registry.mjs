import fs from 'node:fs';

const importPath = 'src/routes/api/import/+server.js';
const helperPath = 'src/lib/college-affiliations.js';

if (!fs.existsSync(importPath)) throw new Error(`Could not find ${importPath}`);
if (!fs.existsSync(helperPath)) throw new Error(`Could not find ${helperPath}. Extract the entire ZIP into the project root first.`);

let source = fs.readFileSync(importPath, 'utf8');

const importLine = "import { canonicalCollegeAffiliation } from '$lib/college-affiliations.js';";
if (!source.includes(importLine)) {
  const anchor = "import { productDisplayName } from '$lib/product-display.js';";
  if (!source.includes(anchor)) throw new Error('Could not find product-display import anchor.');
  source = source.replace(anchor, `${anchor}\n${importLine}`);
}

const oldNames = `\t\t\t\t\tconst affiliationName = clean(card.affiliation);\n\t\t\t\t\tconst affiliationKey = normalized(affiliationName);`;
const newNames = `\t\t\t\t\tconst sourceAffiliationName = clean(card.affiliation);\n\t\t\t\t\tconst collegeAffiliationName = canonicalCollegeAffiliation(sourceAffiliationName);\n\t\t\t\t\tconst affiliationName = collegeAffiliationName || sourceAffiliationName;\n\t\t\t\t\tconst affiliationKey = normalized(affiliationName);`;

if (!source.includes(newNames)) {
  if (!source.includes(oldNames)) throw new Error('Could not find affiliation-name resolution block.');
  source = source.replace(oldNames, newNames);
}

const oldLookup = `\t\t\t\t\t\tlet row = await database\n\t\t\t\t\t\t\t.prepare(\`\n\t\t\t\t\t\t\t\tSELECT id, sport_id\n\t\t\t\t\t\t\t\tFROM affiliations\n\t\t\t\t\t\t\t\tWHERE (\n\t\t\t\t\t\t\t\t\tnormalized_name = ?\n\t\t\t\t\t\t\t\t\tOR lower(trim(name)) = lower(trim(?))\n\t\t\t\t\t\t\t\t)\n\t\t\t\t\t\t\t\t  AND (sport_id = ? OR sport_id IS NULL)\n\t\t\t\t\t\t\t\tORDER BY CASE WHEN sport_id = ? THEN 0 ELSE 1 END, id\n\t\t\t\t\t\t\t\tLIMIT 1\n\t\t\t\t\t\t\t\`)\n\t\t\t\t\t\t\t.bind(\n\t\t\t\t\t\t\t\taffiliationKey,\n\t\t\t\t\t\t\t\taffiliationName,\n\t\t\t\t\t\t\t\tNumber(body.sportId),\n\t\t\t\t\t\t\t\tNumber(body.sportId)\n\t\t\t\t\t\t\t)\n\t\t\t\t\t\t\t.first();`;

const newLookup = `\t\t\t\t\t\tlet row;\n\n\t\t\t\t\t\tif (collegeAffiliationName) {\n\t\t\t\t\t\t\t// College affiliations are school identities, not sport-specific franchises.\n\t\t\t\t\t\t\t// Reuse the same Penn State / Alabama / Notre Dame row across sports.\n\t\t\t\t\t\t\trow = await database\n\t\t\t\t\t\t\t\t.prepare(\`\n\t\t\t\t\t\t\t\t\tSELECT id, sport_id\n\t\t\t\t\t\t\t\t\tFROM affiliations\n\t\t\t\t\t\t\t\t\tWHERE normalized_name = ?\n\t\t\t\t\t\t\t\t\t   OR lower(trim(name)) = lower(trim(?))\n\t\t\t\t\t\t\t\t\tLIMIT 1\n\t\t\t\t\t\t\t\t\`)\n\t\t\t\t\t\t\t\t.bind(affiliationKey, affiliationName)\n\t\t\t\t\t\t\t\t.first();\n\t\t\t\t\t\t} else {\n\t\t\t\t\t\t\trow = await database\n\t\t\t\t\t\t\t\t.prepare(\`\n\t\t\t\t\t\t\t\t\tSELECT id, sport_id\n\t\t\t\t\t\t\t\t\tFROM affiliations\n\t\t\t\t\t\t\t\t\tWHERE (\n\t\t\t\t\t\t\t\t\t\tnormalized_name = ?\n\t\t\t\t\t\t\t\t\t\tOR lower(trim(name)) = lower(trim(?))\n\t\t\t\t\t\t\t\t\t)\n\t\t\t\t\t\t\t\t\t  AND (sport_id = ? OR sport_id IS NULL)\n\t\t\t\t\t\t\t\t\tORDER BY CASE WHEN sport_id = ? THEN 0 ELSE 1 END, id\n\t\t\t\t\t\t\t\t\tLIMIT 1\n\t\t\t\t\t\t\t\t\`)\n\t\t\t\t\t\t\t\t.bind(\n\t\t\t\t\t\t\t\t\taffiliationKey,\n\t\t\t\t\t\t\t\t\taffiliationName,\n\t\t\t\t\t\t\t\t\tNumber(body.sportId),\n\t\t\t\t\t\t\t\t\tNumber(body.sportId)\n\t\t\t\t\t\t\t\t)\n\t\t\t\t\t\t\t\t.first();\n\t\t\t\t\t\t}`;

if (!source.includes(newLookup)) {
  if (!source.includes(oldLookup)) throw new Error('Could not find sport-aware affiliation lookup block.');
  source = source.replace(oldLookup, newLookup);
}

fs.writeFileSync(importPath, source);
console.log('Installed college affiliation registry + cross-sport college resolution.');
console.log('Run npm run check && npm run build. No migration required.');
