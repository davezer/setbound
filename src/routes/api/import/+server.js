import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { productDisplayName } from '$lib/product-display.js';

function slugify(value) {
	return value
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/&/g, ' and ')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 120);
}

function sortKey(cardNumber) {
	const match = String(cardNumber).match(/^(\D*)(\d+)(.*)$/);

	return match
		? `${match[1]}${String(Number(match[2])).padStart(8, '0')}${match[3]}`
		: String(cardNumber);
}

function resolvedSubject(card) {
	const explicit = String(card.subject || '').trim();

	if (explicit) return explicit;

	return (
		String(card.checklist_name || 'Unspecified subject').trim() ||
		'Unspecified subject'
	);
}

function franchiseLookupKey(value) {
	return String(value || '')
		.trim()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/&/g, ' and ')
		.replace(/[^a-z0-9]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function hasVerifiedAffiliation(card) {
	const value = String(card.affiliation || '').trim();

	return Boolean(
		value &&
		value !== 'NIL' &&
		value !== 'UNRESOLVED'
	);
}

function clean(value) {
	return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalized(value) {
	return clean(value).toLowerCase();
}

async function cleanupPartialImport(database, productId, sourceId) {
	if (productId) {
		await database.prepare(`
			DELETE FROM checklist_details
			WHERE checklist_id IN (
				SELECT id FROM checklists WHERE product_id = ?
			)
		`).bind(productId).run();

		await database.prepare('DELETE FROM cards WHERE product_id = ?').bind(productId).run();
		await database.prepare('DELETE FROM checklists WHERE product_id = ?').bind(productId).run();

		for (const table of ['product_formats', 'odds_sources']) {
			try {
				await database.prepare(`DELETE FROM ${table} WHERE product_id = ?`)
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

export async function POST({ request, platform }) {
	const database = db(platform);
	let createdProductId = null;
	let createdSourceId = null;

	try {
		const body = await request.json();

		if (
			!body.name ||
			!body.year ||
			!body.sportId ||
			!body.manufacturerId ||
			!Array.isArray(body.cards)
		) {
			return json(
				{ message: 'Missing import fields.' },
				{ status: 400 }
			);
		}

		const year = Number(body.year);

		if (!Number.isInteger(year) || year < 1800 || year > 2200) {
			return json(
				{ message: 'Invalid product year.' },
				{ status: 400 }
			);
		}

		const unresolved = body.cards.filter(
			(card) =>
				card.affiliation === 'UNRESOLVED' ||
				card.affiliation_status === 'unresolved'
		);

		if (unresolved.length) {
			return json(
				{
					message:
						`${unresolved.length} selected card` +
						`${unresolved.length === 1 ? '' : 's'} still have unresolved affiliations. ` +
						`Deselect or fix them before importing.`,
					code: 'UNRESOLVED_AFFILIATIONS'
				},
				{ status: 400 }
			);
		}

		/*
		 * Product naming rules
		 *
		 * User may enter:
		 *   Bowman Football
		 *   2026 Bowman Football
		 *
		 * We always store:
		 *   2026 Bowman Football
		 *
		 * And always create:
		 *   2026-bowman-football
		 */
		const displayName = productDisplayName(body.name, year);
		const canonicalName = `${year} ${displayName}`.trim();
		const slug = `${year}-${slugify(displayName)}`;

		const existingProduct = await database
			.prepare(`
				SELECT id, name, year, published, primary_source_id
				FROM products
				WHERE slug = ?
			`)
			.bind(slug)
			.first();

		if (existingProduct) {
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
							`${existingProduct.name} is already in Setbound. ` +
							`Delete or replace the existing product before importing it again.`,
						code: 'PRODUCT_ALREADY_EXISTS'
					},
					{ status: 409 }
				);
			}
		}

		const source = await database
			.prepare(`
				INSERT INTO sources
					(source_type, source_url, original_filename, imported_at)
				VALUES
					('official', ?, ?, datetime('now'))
				RETURNING id
			`)
			.bind(
				body.sourceUrl || null,
				body.sourceFilename || null
			)
			.first();

		createdSourceId = source.id;

		const product = await database
			.prepare(`
				INSERT INTO products
					(
						sport_id,
						manufacturer_id,
						year,
						name,
						slug,
						primary_source_id,
						published
					)
				VALUES
					(?, ?, ?, ?, ?, ?, 0)
				RETURNING id
			`)
			.bind(
				body.sportId,
				body.manufacturerId,
				year,
				canonicalName,
				slug,
				source.id
			)
			.first();

		createdProductId = product.id;

		const checklistIds = new Map();
		const subjectIds = new Map();
		const affiliationIds = new Map();

		const existingAff = await database
			.prepare(`
				SELECT id, name, normalized_name
				FROM affiliations
			`)
			.all();

		for (const affiliation of existingAff.results || []) {
			const normalizedKey = normalized(
				affiliation.normalized_name || affiliation.name
			);

			if (normalizedKey) {
				affiliationIds.set(normalizedKey, affiliation.id);
			}
		}

		let sort = 0;

		for (const card of body.cards) {
			if (!checklistIds.has(card.checklist_name)) {
				const row = await database
					.prepare(`
						INSERT INTO checklists
							(
								product_id,
								name,
								slug,
								kind,
								sort_order
							)
						VALUES
							(?, ?, ?, ?, ?)
						RETURNING id
					`)
					.bind(
						product.id,
						card.checklist_name,
						slugify(card.checklist_name),
						'checklist',
						sort++
					)
					.first();

				checklistIds.set(
					card.checklist_name,
					row.id
				);
			}

			const subjectName = resolvedSubject(card);
			const subjectKey = subjectName.toLowerCase();

			if (!subjectIds.has(subjectKey)) {
				let row = await database
					.prepare(`
						SELECT id
						FROM subjects
						WHERE normalized_name = ?
					`)
					.bind(subjectKey)
					.first();

				if (!row) {
					row = await database
						.prepare(`
							INSERT INTO subjects
								(
									name,
									normalized_name,
									subject_type
								)
							VALUES
								(?, ?, ?)
							RETURNING id
						`)
						.bind(
							subjectName,
							subjectKey,
							hasVerifiedAffiliation(card)
								? 'athlete'
								: 'personality'
						)
						.first();
				}

				subjectIds.set(
					subjectKey,
					row.id
				);
			}

			let affiliationId = null;
			let affiliationLabel = null;

			if (hasVerifiedAffiliation(card)) {
				const historicalName = String(card.affiliation || '').trim();
				const aliasKey = franchiseLookupKey(historicalName);

				const franchiseAlias = await database
					.prepare('SELECT canonical_affiliation_id FROM affiliation_franchise_aliases WHERE sport_id = ? AND alias_normalized = ? LIMIT 1')
					.bind(Number(body.sportId), aliasKey)
					.first();

				if (franchiseAlias?.canonical_affiliation_id) {
					affiliationId = franchiseAlias.canonical_affiliation_id;
					affiliationLabel = historicalName;
				} else {
					const affiliationName = clean(card.affiliation);
					const affiliationKey = normalized(affiliationName);
	
					affiliationId = affiliationIds.get(affiliationKey) || null;
	
					if (!affiliationId) {
						let row = await database
							.prepare(`
								SELECT id
								FROM affiliations
								WHERE normalized_name = ?
								LIMIT 1
							`)
							.bind(affiliationKey)
							.first();
	
						if (!row) {
							await database
								.prepare(`
									INSERT OR IGNORE INTO affiliations
										(name, normalized_name, type, aliases_json)
									VALUES (?, ?, 'team', '[]')
								`)
								.bind(affiliationName, affiliationKey)
								.run();
	
							row = await database
								.prepare(`
									SELECT id
									FROM affiliations
									WHERE normalized_name = ?
									LIMIT 1
								`)
								.bind(affiliationKey)
								.first();
						}
	
						if (!row?.id) {
							throw new Error(
								`Could not resolve affiliation "${affiliationName}".`
							);
						}
	
						affiliationId = row.id;
						affiliationIds.set(affiliationKey, affiliationId);
					}
				}
			}

			await database
				.prepare(`
					INSERT INTO cards
						(
							product_id,
							checklist_id,
							subject_id,
							affiliation_id,
							affiliation_label,
							card_number,
							sort_key,
							rookie,
							autograph,
							memorabilia,
							serial_number,
							confidence,
							raw_source
						)
					VALUES
						(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				`)
				.bind(
					product.id,
					checklistIds.get(card.checklist_name),
					subjectIds.get(subjectKey),
					affiliationId,
					affiliationLabel,
					String(card.card_number),
					sortKey(card.card_number),
					card.rookie ? 1 : 0,
					card.autograph ? 1 : 0,
					card.memorabilia ? 1 : 0,
					card.serial_number || null,
					card.confidence || null,
					card.raw || null
				)
				.run();
		}

		const checklistMeta =
			body.checklistMeta || {};

		for (const [name, meta] of Object.entries(checklistMeta)) {
			const checklistId =
				checklistIds.get(name);

			if (!checklistId) continue;

			await database
				.prepare(`
					INSERT INTO checklist_details
						(
							checklist_id,
							card_count_declared,
							parallels_json,
							notes_json,
							updated_at
						)
					VALUES
						(?, ?, ?, ?, datetime('now'))
					ON CONFLICT(checklist_id)
					DO UPDATE SET
						card_count_declared = excluded.card_count_declared,
						parallels_json = excluded.parallels_json,
						notes_json = excluded.notes_json,
						updated_at = datetime('now')
				`)
				.bind(
					checklistId,
					meta?.card_count_declared || null,
					JSON.stringify(meta?.parallels || []),
					JSON.stringify(meta?.notes || [])
				)
				.run();
		}

		return json({
			ok: true,
			slug,
			name: canonicalName,
			imported: body.cards.length
		});
	} catch (e) {
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
}