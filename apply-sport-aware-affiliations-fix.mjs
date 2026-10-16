import fs from 'node:fs';

const path = 'src/routes/api/import/+server.js';

if (!fs.existsSync(path)) {
	throw new Error(`Could not find ${path}`);
}

let source = fs.readFileSync(path, 'utf8');

source = source.replace(
`				SELECT id, name, normalized_name
				FROM affiliations`,
`				SELECT id, name, normalized_name, sport_id
				FROM affiliations`
);

const oldCache = `		for (const affiliation of existingAff.results || []) {
			const normalizedKey = normalized(
				affiliation.normalized_name || affiliation.name
			);

			if (normalizedKey) {
				affiliationIds.set(normalizedKey, affiliation.id);
			}
		}`;

const newCache = `		for (const affiliation of existingAff.results || []) {
			const normalizedKey = normalized(
				affiliation.normalized_name || affiliation.name
			);

			const sameSport =
				!affiliation.sport_id ||
				Number(affiliation.sport_id) === Number(body.sportId);

			if (normalizedKey && sameSport) {
				affiliationIds.set(normalizedKey, affiliation.id);
			}
		}`;

if (source.includes(oldCache)) {
	source = source.replace(oldCache, newCache);
} else if (!source.includes('const sameSport =')) {
	throw new Error('Could not find affiliation cache block.');
}

const oldLookup = `						let row = await database
							.prepare(\`
								SELECT id
								FROM affiliations
								WHERE normalized_name = ?
								LIMIT 1
							\`)
							.bind(affiliationKey)
							.first();`;

const newLookup = `						let row = await database
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
							.first();

						if (row?.id && !row.sport_id) {
							await database
								.prepare('UPDATE affiliations SET sport_id = ? WHERE id = ? AND sport_id IS NULL')
								.bind(Number(body.sportId), row.id)
								.run();

							row.sport_id = Number(body.sportId);
						}`;

if (source.includes(oldLookup)) {
	source = source.replace(oldLookup, newLookup);
} else if (!source.includes('ORDER BY CASE WHEN sport_id = ? THEN 0 ELSE 1 END')) {
	throw new Error('Could not find affiliation lookup block.');
}

const oldInsert = `								.prepare(\`
									INSERT OR IGNORE INTO affiliations
										(name, normalized_name, type, aliases_json)
									VALUES (?, ?, 'team', '[]')
								\`)
								.bind(affiliationName, affiliationKey)
								.run();`;

const newInsert = `								.prepare(\`
									INSERT OR IGNORE INTO affiliations
										(name, normalized_name, sport_id, type, aliases_json)
									VALUES (?, ?, ?, 'team', '[]')
								\`)
								.bind(
									affiliationName,
									affiliationKey,
									Number(body.sportId)
								)
								.run();`;

if (source.includes(oldInsert)) {
	source = source.replace(oldInsert, newInsert);
} else if (!source.includes('(name, normalized_name, sport_id, type, aliases_json)')) {
	throw new Error('Could not find affiliation insert block.');
}

const oldSecondLookup = `							row = await database
								.prepare(\`
									SELECT id
									FROM affiliations
									WHERE normalized_name = ?
									LIMIT 1
								\`)
								.bind(affiliationKey)
								.first();`;

const newSecondLookup = `							row = await database
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

if (source.includes(oldSecondLookup)) {
	source = source.replace(oldSecondLookup, newSecondLookup);
} else if ((source.match(/ORDER BY CASE WHEN sport_id = \? THEN 0 ELSE 1 END/g) || []).length < 2) {
	throw new Error('Could not find second affiliation lookup block.');
}

fs.writeFileSync(path, source);

console.log('Importer is now sport-aware for normal affiliation resolution.');
