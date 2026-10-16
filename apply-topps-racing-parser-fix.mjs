import fs from 'node:fs';

const path = 'src/lib/client/checklist-parser.js';

if (!fs.existsSync(path)) {
	throw new Error(`Could not find ${path}`);
}

let source = fs.readFileSync(path, 'utf8');

const oldCount = `const DECLARED_COUNT = /^(\\d{1,6})\\s+cards?\\.?$/i;`;
const newCount = `const DECLARED_COUNT = /^(\\d{1,6})\\s*(?:-\\s*)?cards?(?:\\s+set)?\\.?$/i;`;

if (source.includes(oldCount)) {
	source = source.replace(oldCount, newCount);
} else if (!source.includes('(?:\\s+set)?')) {
	throw new Error('Could not find DECLARED_COUNT regex.');
}

const oldStructured = `  if (affiliation === SOURCE_NIL) {
    return { subject, affiliation: null, sourceNil: true, trailing: parts.slice(2) };
  }

  if (!affiliation || /^(rookie|rc|auto|autograph|relic|memorabilia)$/i.test(affiliation)) {
    return { subject, affiliation: null, sourceNil: true, trailing: parts.slice(1) };
  }`;

const newStructured = `  if (affiliation === SOURCE_NIL) {
    return { subject, affiliation: null, sourceNil: true, trailing: parts.slice(2) };
  }

  // Some manufacturer checklists use a category/status value in the column
  // where other products put a team. These are not real affiliations.
  // Example: Formula 1 legends can carry "Legend" rather than a constructor.
  if (
    !affiliation ||
    /^(rookie|rc|auto|autograph|relic|memorabilia|legend|legends)$/i.test(affiliation)
  ) {
    return { subject, affiliation: null, sourceNil: true, trailing: parts.slice(1) };
  }`;

if (source.includes(oldStructured)) {
	source = source.replace(oldStructured, newStructured);
} else if (!source.includes('legend|legends')) {
	throw new Error('Could not find structuredColumns affiliation block.');
}

fs.writeFileSync(path, source);

console.log('Topps racing checklist parser fix applied.');
