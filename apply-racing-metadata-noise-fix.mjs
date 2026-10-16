import fs from 'node:fs';

const path = 'src/lib/client/checklist-parser.js';

if (!fs.existsSync(path)) {
	throw new Error(`Could not find ${path}`);
}

let source = fs.readFileSync(path, 'utf8');

if (!source.includes('const PRODUCT_CONFIG_NOISE =')) {
	const anchor = `const DECLARED_COUNT = /^(\\d{1,6})\\s*(?:-\\s*)?cards?(?:\\s+set)?\\.?$/i;`;

	const replacement = `${anchor}
const PRODUCT_CONFIG_NOISE =
  /^(?:\\d{1,6}\\s*(?:-\\s*)?card\\s+set\\b|\\d{1,6}\\s+cards?\\s+per\\s+(?:box|pack)\\b|\\d{1,6}\\s+packs?\\s+per\\s+box\\b|\\d{1,6}\\s+boxes?\\b|\\d{1,6}\\s+cards?\\s*,?\\s*\\d{1,6}\\s+cards?\\s+per\\s+box\\b)|\\b(?:cards?\\s+per\\s+box|cards?\\s+per\\s+pack|packs?\\s+per\\s+box|packs?\\s+of\\s+\\d{1,6}\\s+cards?|autograph\\s+cards?\\s+per\\s+box|autographs?\\s+per\\s+box|relics?\\s+per\\s+box|hits?\\s+per\\s+box)\\b/i;`;

	if (!source.includes(anchor)) {
		throw new Error('Could not find DECLARED_COUNT.');
	}

	source = source.replace(anchor, replacement);
}

if (!source.includes('if (PRODUCT_CONFIG_NOISE.test(line)) return null;')) {
	const anchor = `function parseCard(line, section, affiliations) {
  const m = line.match(CARD_START);`;

	const replacement = `function parseCard(line, section, affiliations) {
  if (PRODUCT_CONFIG_NOISE.test(line)) return null;

  const m = line.match(CARD_START);`;

	if (!source.includes(anchor)) {
		throw new Error('Could not find parseCard().');
	}

	source = source.replace(anchor, replacement);
}

if (!source.includes('if (PRODUCT_CONFIG_NOISE.test(line)) continue;')) {
	const anchor = `  for (const line of lines) {
    if (PAGE_NOISE.test(line)) continue;`;

	const replacement = `  for (const line of lines) {
    if (PAGE_NOISE.test(line)) continue;
    if (PRODUCT_CONFIG_NOISE.test(line)) continue;`;

	if (!source.includes(anchor)) {
		throw new Error('Could not find parseChecklistText loop.');
	}

	source = source.replace(anchor, replacement);
}

// Harden category/status values such as "Legend." or "Legend:" so punctuation
// cannot turn them back into fake affiliations.
const oldStatus = `/^(rookie|rc|auto|autograph|relic|memorabilia|legend|legends)$/i.test(affiliation)`;

const newStatus = `/^(rookie|rc|auto|autograph|relic|memorabilia|legend|legends)$/i.test(
      affiliation.replace(/[.:;,-]+$/g, '').trim()
    )`;

if (source.includes(oldStatus)) {
	source = source.replace(oldStatus, newStatus);
} else if (!source.includes("affiliation.replace(/[.:;,-]+$/g, '').trim()")) {
	throw new Error('Could not find non-affiliation status test.');
}

fs.writeFileSync(path, source);
console.log('Racing metadata/noise parser hardening applied.');
