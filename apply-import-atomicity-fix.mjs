import fs from 'node:fs';

function mustReplace(source, search, replacement, label) {
	if (!source.includes(search)) {
		throw new Error(`${label}: expected code was not found.`);
	}
	return source.replace(search, replacement);
}

function patchImportApi() {
	const path = 'src/routes/api/import/+server.js';
	let source = fs.readFileSync(path, 'utf8');

	if (!source.includes('function normalized(value)')) {
		source = mustReplace(
			source,
			`function hasVerifiedAffiliation(card) {
	const value = String(card.affiliation || '').trim();

	return Boolean(
		value &&
		value !== 'NIL' &&
		value !== 'UNRESOLVED'
	);
}
`,
			`function hasVerifiedAffiliation(card) {
	const value = String(card.affiliation || '').trim();

	return Boolean(
		value &&
		value !== 'NIL' &&
		value !== 'UNRESOLVED'
	);
}

function clean(value) {
	return String(value || '').trim().replace(/\\s+/g, ' ');
}

function normalized(value) {
	return clean(value).toLowerCase();
}

async function cleanupPartialImport(database, productId, sourceId) {
	if (productId) {
		await database.prepare(\`
			DELETE FROM checklist_details
			WHERE checklist_id IN (
				SELECT id FROM checklists WHERE product_id = ?
			)
		\`).bind(productId).run();

		await database.prepare('DELETE FROM cards WHERE product_id = ?').bind(productId).run();
		await database.prepare('DELETE FROM checklists WHERE product_id = ?').bind(productId).run();

		for (const table of ['product_formats', 'odds_sources']) {
			try {
				await database.prepare(\`DELETE FROM \${table} WHERE product_id = ?\`)
					.bind(productId)
					.run();
			} catch {}
		}

		await database.prepare('DELETE FROM products WHERE id = ?').bind(productId).run();
	}

	if (sourceId) {
		try {
			await database.prepare('DELETE FROM sources WHERE id = ?').bind(sourceId).run();
		} catch {}
	}
}
`,
			'helper insertion'
		);
	}

	source = source.replace(
		`export async function POST({ request, platform }) {
	try {
		const database = db(platform);`,
		`export async function POST({ request, platform }) {
	const database = db(platform);
	let createdProductId = null;
	let createdSourceId = null;

	try {`
	);

	source = source.replace(
		`SELECT id, name, year
				FROM products`,
		`SELECT id, name, year, published, primary_source_id
				FROM products`
	);

	const oldExisting = `		if (existingProduct) {
			return json(
				{
					message:
						\`\${existingProduct.name} is already in Setbound. \` +
						\`Delete or replace the existing product before importing it again.\`,
					code: 'PRODUCT_ALREADY_EXISTS'
				},
				{ status: 409 }
			);
		}
`;

	const newExisting = `		if (existingProduct) {
			if (body.replaceDraft === true && Number(existingProduct.published || 0) === 0) {
				await cleanupPartialImport(
					database,
					existingProduct.id,
					existingProduct.primary_source_id || null
				);
			} else {
				return json(
					{
						message:
							\`\${existingProduct.name} is already in Setbound. \` +
							\`Delete or replace the existing product before importing it again.\`,
						code: 'PRODUCT_ALREADY_EXISTS'
					},
					{ status: 409 }
				);
			}
		}
`;

	if (source.includes(oldExisting)) source = source.replace(oldExisting, newExisting);

	source = source.replace(
		`			.first();

		const product = await database`,
		`			.first();

		createdSourceId = source.id;

		const product = await database`
	);

	source = source.replace(
		`			.first();

		const checklistIds = new Map();`,
		`			.first();

		createdProductId = product.id;

		const checklistIds = new Map();`
	);

	source = source.replace(
		`				SELECT id, name
				FROM affiliations`,
		`				SELECT id, name, normalized_name
				FROM affiliations`
	);

	const oldMap = `		for (const affiliation of existingAff.results || []) {
			affiliationIds.set(
				affiliation.name.toLowerCase(),
				affiliation.id
			);
		}
`;
	const newMap = `		for (const affiliation of existingAff.results || []) {
			const normalizedKey = normalized(
				affiliation.normalized_name || affiliation.name
			);

			if (normalizedKey) {
				affiliationIds.set(normalizedKey, affiliation.id);
			}
		}
`;
	if (source.includes(oldMap)) source = source.replace(oldMap, newMap);

	const start = source.indexOf(`			if (hasVerifiedAffiliation(card)) {`);
	const endMarker = `
			await database
				.prepare(\``;
	const end = source.indexOf(endMarker, start);

	if (start < 0 || end < 0) throw new Error('Could not locate affiliation block.');

	const newAffBlock = `			if (hasVerifiedAffiliation(card)) {
				const affiliationName = clean(card.affiliation);
				const affiliationKey = normalized(affiliationName);

				affiliationId = affiliationIds.get(affiliationKey) || null;

				if (!affiliationId) {
					let row = await database
						.prepare(\`
							SELECT id
							FROM affiliations
							WHERE normalized_name = ?
							LIMIT 1
						\`)
						.bind(affiliationKey)
						.first();

					if (!row) {
						await database
							.prepare(\`
								INSERT OR IGNORE INTO affiliations
									(name, normalized_name, type, aliases_json)
								VALUES (?, ?, 'team', '[]')
							\`)
							.bind(affiliationName, affiliationKey)
							.run();

						row = await database
							.prepare(\`
								SELECT id
								FROM affiliations
								WHERE normalized_name = ?
								LIMIT 1
							\`)
							.bind(affiliationKey)
							.first();
					}

					if (!row?.id) {
						throw new Error(
							\`Could not resolve affiliation "\${affiliationName}".\`
						);
					}

					affiliationId = row.id;
					affiliationIds.set(affiliationKey, affiliationId);
				}
			}
`;

	source = source.slice(0, start) + newAffBlock + source.slice(end);

	const oldCatch = `	} catch (e) {
		return json(
			{
				message:
					e?.message ||
					'Import failed.'
			},
			{ status: 500 }
		);
	}
}`;

	const newCatch = `	} catch (e) {
		try {
			await cleanupPartialImport(
				database,
				createdProductId,
				createdSourceId
			);
		} catch (cleanupError) {
			console.error('Import cleanup failed:', cleanupError);
		}

		return json(
			{
				message:
					e?.message ||
					'Import failed.'
			},
			{ status: 500 }
		);
	}
}`;

	if (!source.includes('Import cleanup failed:')) {
		source = mustReplace(source, oldCatch, newCatch, 'catch replacement');
	}

	fs.writeFileSync(path, source);
	console.log('Import API patched.');
}

function patchHarvester() {
	const path = 'src/routes/admin/source-harvester/+page.svelte';
	if (!fs.existsSync(path)) return;

	let source = fs.readFileSync(path, 'utf8');
	if (source.includes('replaceDraft: true')) return;

	const anchor = `					sections: row.parsed.sections
				})`;
	const replacement = `					sections: row.parsed.sections,
					replaceDraft: true
				})`;

	if (source.includes(anchor)) {
		source = source.replace(anchor, replacement);
		fs.writeFileSync(path, source);
		console.log('Harvester retry payload patched.');
	}
}

patchImportApi();
patchHarvester();

console.log('Done.');
