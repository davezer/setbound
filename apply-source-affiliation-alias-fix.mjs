import fs from 'node:fs';

const path = 'src/routes/api/import/+server.js';

if (!fs.existsSync(path)) {
	throw new Error(`Could not find ${path}`);
}

let source = fs.readFileSync(path, 'utf8');

const oldQuery =
	".prepare('SELECT canonical_affiliation_id FROM affiliation_franchise_aliases WHERE sport_id = ? AND alias_normalized = ? LIMIT 1')";

const newQuery =
	".prepare('SELECT canonical_affiliation_id, preserve_source_label FROM affiliation_franchise_aliases WHERE sport_id = ? AND alias_normalized = ? LIMIT 1')";

if (source.includes(oldQuery)) {
	source = source.replace(oldQuery, newQuery);
} else if (!source.includes('preserve_source_label FROM affiliation_franchise_aliases')) {
	throw new Error('Could not find franchise alias lookup query.');
}

const oldAssignment = `				if (franchiseAlias?.canonical_affiliation_id) {
					affiliationId = franchiseAlias.canonical_affiliation_id;
					affiliationLabel = historicalName;
				} else {`;

const newAssignment = `				if (franchiseAlias?.canonical_affiliation_id) {
					affiliationId = franchiseAlias.canonical_affiliation_id;

					// Historical aliases preserve what was printed on the card.
					// Source shorthand aliases (e.g. "Pittsburgh") resolve to the
					// canonical team and display that canonical team name instead.
					affiliationLabel =
						Number(franchiseAlias.preserve_source_label ?? 1) === 1
							? historicalName
							: null;
				} else {`;

if (source.includes(oldAssignment)) {
	source = source.replace(oldAssignment, newAssignment);
} else if (!source.includes('preserve_source_label ?? 1')) {
	throw new Error('Could not find franchise alias assignment block.');
}

fs.writeFileSync(path, source);
console.log('Source affiliation alias semantics installed.');
