import fs from 'node:fs';

const path = 'src/routes/api/import/+server.js';

if (!fs.existsSync(path)) {
	throw new Error(`Could not find ${path}`);
}

let source = fs.readFileSync(path, 'utf8');

source = source.replace(
`			const normalizedKey = normalized(
				affiliation.normalized_name || affiliation.name
			);`,
`			const normalizedKey = franchiseLookupKey(
				affiliation.normalized_name || affiliation.name
			);`
);

source = source.replace(
`				const affiliationName = clean(card.affiliation);
				const affiliationKey = normalized(affiliationName);`,
`				const affiliationName = clean(card.affiliation);
				const affiliationKey = franchiseLookupKey(affiliationName);`
);

const oldLookup = `						let row = await database
							.prepare(\`
								SELECT id, sport_id
								FROM affiliations
								WHERE normalized_name = ?
								  AND (sport_id = ? OR sport_id IS NULL)
								ORDER BY CASE WHEN sport_id = ? THEN 0 ELSE 1 END, id
								LIMIT 1
							\`)
							.bind(
								affiliationKey,
								Number(body.sportId),
								Number(body.sportId)
							)
							.first();`;

const newLookup = `						let row = await database
							.prepare(\`
								SELECT id, sport_id
								FROM affiliations
								WHERE (
									normalized_name = ?
									OR lower(trim(name)) = lower(trim(?))
								)
								  AND (sport_id = ? OR sport_id IS NULL)
								ORDER BY CASE WHEN sport_id = ? THEN 0 ELSE 1 END, id
								LIMIT 1
							\`)
							.bind(
								affiliationKey,
								affiliationName,
								Number(body.sportId),
								Number(body.sportId)
							)
							.first();

						if (!row) {
							// The affiliations table still has a global name uniqueness rule.
							// If a same-name row belongs to another sport, it may be a historical
							// name there (e.g. Baseball New York Giants) but the real current
							// team in this sport (NFL New York Giants). If the old sport already
							// has a historical alias pointing somewhere else, that global row is
							// safe to claim for the current sport.
							const globalRow = await database
								.prepare(\`
									SELECT id, sport_id
									FROM affiliations
									WHERE normalized_name = ?
									   OR lower(trim(name)) = lower(trim(?))
									LIMIT 1
								\`)
								.bind(affiliationKey, affiliationName)
								.first();

							if (globalRow?.id && globalRow.sport_id) {
								const historicalElsewhere = await database
									.prepare(\`
										SELECT 1 AS ok
										FROM affiliation_franchise_aliases
										WHERE sport_id = ?
										  AND alias_normalized = ?
										  AND canonical_affiliation_id <> ?
										LIMIT 1
									\`)
									.bind(
										Number(globalRow.sport_id),
										affiliationKey,
										Number(globalRow.id)
									)
									.first();

								if (historicalElsewhere?.ok) {
									await database
										.prepare('UPDATE affiliations SET sport_id = ? WHERE id = ?')
										.bind(Number(body.sportId), globalRow.id)
										.run();

									row = {
										id: globalRow.id,
										sport_id: Number(body.sportId)
									};
								}
							}
						}`;

if (!source.includes('const historicalElsewhere = await database')) {
	if (!source.includes(oldLookup)) {
		throw new Error('Could not find primary affiliation lookup block.');
	}
	source = source.replace(oldLookup, newLookup);
}

const oldSecondLookup = `							row = await database
								.prepare(\`
									SELECT id, sport_id
									FROM affiliations
									WHERE normalized_name = ?
									  AND (sport_id = ? OR sport_id IS NULL)
									ORDER BY CASE WHEN sport_id = ? THEN 0 ELSE 1 END, id
									LIMIT 1
								\`)
								.bind(
									affiliationKey,
									Number(body.sportId),
									Number(body.sportId)
								)
								.first();`;

const newSecondLookup = `							row = await database
								.prepare(\`
									SELECT id, sport_id
									FROM affiliations
									WHERE (
										normalized_name = ?
										OR lower(trim(name)) = lower(trim(?))
									)
									  AND (sport_id = ? OR sport_id IS NULL)
									ORDER BY CASE WHEN sport_id = ? THEN 0 ELSE 1 END, id
									LIMIT 1
								\`)
								.bind(
									affiliationKey,
									affiliationName,
									Number(body.sportId),
									Number(body.sportId)
								)
								.first();`;

if (source.includes(oldSecondLookup)) {
	source = source.replace(oldSecondLookup, newSecondLookup);
}

fs.writeFileSync(path, source);
console.log('Affiliation resolver hardened for cross-sport historical-name collisions.');
