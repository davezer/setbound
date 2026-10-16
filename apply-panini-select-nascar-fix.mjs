import fs from 'node:fs';

const path = 'src/lib/client/spreadsheet.js';

if (!fs.existsSync(path)) {
	throw new Error(`Could not find ${path}`);
}

let source = fs.readFileSync(path, 'utf8');

const oldTail = `\t'printing plate', 'press proof', 'diamond plate', 'diamond', 'fireworks'
];`;

const newTail = `\t'printing plate', 'press proof', 'diamond plate', 'diamond', 'fireworks',
\t'tie-dye', 'tri-color', 'maroon'
];`;

if (source.includes(oldTail)) {
	source = source.replace(oldTail, newTail);
} else if (!source.includes("'tie-dye', 'tri-color', 'maroon'")) {
	throw new Error('Could not find PANINI_PARALLEL_PREFIXES tail.');
}

const oldSuffix = `function isPaniniParallelSuffix(value) {
\tconst suffix = text(value).toLowerCase();
\tif (!suffix) return false;

\tif (/^\\d+(?:st|nd|rd|th)\\s+anniversary\\b/.test(suffix)) return true;

\treturn PANINI_PARALLEL_PREFIXES.some(
\t\t(prefix) => suffix === prefix || suffix.startsWith(prefix + ' ')
\t);
}`;

const newSuffix = `function isPaniniParallelSuffix(value) {
\tconst suffix = text(value)
\t\t.toLowerCase()
\t\t.replace(/^[\\s\\-–—:|/]+/, '')
\t\t.trim();

\tif (!suffix) return false;

\tif (/^\\d+(?:st|nd|rd|th)\\s+anniversary\\b/.test(suffix)) return true;

\treturn PANINI_PARALLEL_PREFIXES.some(
\t\t(prefix) => suffix === prefix || suffix.startsWith(prefix + ' ')
\t);
}`;

if (source.includes(oldSuffix)) {
	source = source.replace(oldSuffix, newSuffix);
} else if (!source.includes("replace(/^[\\s\\-–—:|/]+/, '')")) {
	throw new Error('Could not find isPaniniParallelSuffix().');
}

fs.writeFileSync(path, source);
console.log('Panini Select / delimiter parallel fix applied.');
