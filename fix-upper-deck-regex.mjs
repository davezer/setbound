import fs from 'node:fs';

const path = 'src/lib/client/spreadsheet.js';

if (!fs.existsSync(path)) {
	throw new Error(`Could not find ${path}`);
}

let source = fs.readFileSync(path, 'utf8');

const lines = source.split(/\r?\n/);

let fixedVariant = false;
let fixedScore = false;

for (let i = 0; i < lines.length; i++) {
	if (lines[i].includes('const UPPER_DECK_VARIANT_RE =')) {
		if (i + 1 >= lines.length) {
			throw new Error('UPPER_DECK_VARIANT_RE declaration is incomplete.');
		}

		lines[i] = 'const UPPER_DECK_VARIANT_RE = new RegExp(';
		lines[i + 1] =
			"\t'\\\\b(parallel|foil|rainbow|script|printing plates?|outburst|high gloss|ud exclusives|deluxe|gold|silver|black|blue|red|green|purple|pink|orange|yellow|emerald|ruby|copper|jade|platinum|amber|rose|sky blue|teal|speckle|turquoise|auto|material)\\\\b|//',";
		lines.splice(i + 2, 0, "\t'i'", ');');
		fixedVariant = true;
		i += 3;
		continue;
	}

	if (
		lines[i].includes('.test(value)) score += 3;') &&
		(lines[i].includes('/\\\\/\\\\//') || lines[i].includes('/\\/\\//'))
	) {
		const indent = lines[i].match(/^\s*/)?.[0] || '';
		lines[i] = `${indent}if (value.includes('//')) score += 3;`;
		fixedScore = true;
	}
}

if (!fixedVariant) {
	if (source.includes("const UPPER_DECK_VARIANT_RE = new RegExp(")) {
		console.log('UPPER_DECK_VARIANT_RE is already fixed.');
	} else {
		throw new Error('Could not find UPPER_DECK_VARIANT_RE.');
	}
}

let result = lines.join('\n');

if (!fixedScore) {
	if (result.includes("if (value.includes('//')) score += 3;")) {
		console.log('Parallel slash scoring is already fixed.');
	} else {
		throw new Error('Could not find the malformed // scoring regex.');
	}
}

fs.writeFileSync(path, result);

console.log('Upper Deck regex syntax hotfix applied.');
