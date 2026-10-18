import fs from 'node:fs';
import path from 'node:path';

const filename = path.resolve('src/routes/api/import/+server.js');
if (!fs.existsSync(filename)) {
  console.error(`Missing ${filename}. Run this from the Setbound project root.`);
  process.exit(1);
}
const original = fs.readFileSync(filename, 'utf8');
const newline = original.includes('\r\n') ? '\r\n' : '\n';
const normalized = original.replace(/\r\n/g, '\n');
if (normalized.includes('reviewAffiliations: [...reviewAffiliations]')) {
  console.log('Affiliation review fix already installed. No files changed.');
  process.exit(0);
}

function replaceExactlyOnce(text, matcher, replacement, label) {
  const matches = [...text.matchAll(new RegExp(matcher.source, matcher.flags.includes('g') ? matcher.flags : matcher.flags + 'g'))];
  if (matches.length !== 1) throw new Error(`Expected exactly one ${label} anchor, found ${matches.length}. Nothing changed.`);
  return text.replace(matcher, replacement);
}

try {
  let updated = normalized;
  updated = replaceExactlyOnce(
    updated,
    /(\t\tconst affiliationIds = new Map\(\);)/,
    '$1\n\t\t// Printed but unlinked affiliations are preserved for later admin review.\n\t\tconst reviewAffiliations = new Set();',
    'affiliation IDs initialization'
  );

  updated = replaceExactlyOnce(
    updated,
    /\t{6}if \(!row\?\.id\) \{\s*throw new Error\(\s*`Could not resolve affiliation "\$\{affiliationName\}"\.`\s*\);\s*\}\s*\n\s*\t{6}affiliationId = row\.id;\s*\n\s*\t{6}affiliationIds\.set\(affiliationKey, affiliationId\);/,
    `\t\t\t\t\t\tif (!row?.id) {\n\t\t\t\t\t\t\t// Never invent a canonical team/school/country or borrow one from another sport.\n\t\t\t\t\t\t\t// The printed value remains visible on the card, with no linked affiliation.\n\t\t\t\t\t\t\taffiliationLabel = sourceAffiliationName;\n\t\t\t\t\t\t\treviewAffiliations.add(sourceAffiliationName);\n\t\t\t\t\t\t} else {\n\t\t\t\t\t\t\taffiliationId = row.id;\n\t\t\t\t\t\t\taffiliationIds.set(affiliationKey, affiliationId);\n\t\t\t\t\t\t}`,
    'unresolved affiliation exception'
  );

  updated = replaceExactlyOnce(
    updated,
    /\t\treturn json\(\{\s*ok: true,\s*slug,\s*name: canonicalName,\s*imported: body\.cards\.length\s*\}\);/,
    `\t\treturn json({\n\t\t\tok: true,\n\t\t\tslug,\n\t\t\tname: canonicalName,\n\t\t\timported: body.cards.length,\n\t\t\treviewAffiliations: [...reviewAffiliations],\n\t\t\treviewCount: reviewAffiliations.size\n\t\t});`,
    'success JSON response'
  );

  const backup = filename + '.before-affiliation-review.bak';
  if (fs.existsSync(backup)) throw new Error(`Backup already exists: ${backup}. Move it before installing to avoid overwriting a backup.`);
  fs.copyFileSync(filename, backup, fs.constants.COPYFILE_EXCL);
  fs.writeFileSync(filename, updated.replace(/\n/g, newline), 'utf8');
  console.log(`Updated ${filename}`);
  console.log(`Backup: ${backup}`);
  console.log('Unknown printed affiliations now retain their label and are returned in reviewAffiliations.');
  console.log('Explicit UNRESOLVED card data remains blocked; PDF parser safety remains unchanged.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
