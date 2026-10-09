import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

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

	// Some official checklists legitimately have no named subject.
	// Use the checklist heading as the display subject rather than inventing a person.
	return String(card.checklist_name || 'Unspecified subject').trim() || 'Unspecified subject';
}

export async function POST({ request, platform }) {
	try {
		const database = db(platform);
		const body = await request.json();

		if (
			!body.name ||
			!body.year ||
			!body.sportId ||
			!body.manufacturerId ||
			!Array.isArray(body.cards)
		) {
			return json({ message: 'Missing import fields.' }, { status: 400 });
		}

		const slug = `${body.year}-${slugify(body.name)}`;

		const existingProduct = await database
			.prepare('SELECT id, name, year FROM products WHERE slug = ?')
			.bind(slug)
			.first();

		if (existingProduct) {
			return json(
				{
					message: `${existingProduct.year} ${existingProduct.name} is already in Setbound. Delete or replace the existing product before importing it again.`,
					code: 'PRODUCT_ALREADY_EXISTS'
				},
				{ status: 409 }
			);
		}

		const source = await database
			.prepare(
				`INSERT INTO sources
					(source_type, source_url, original_filename, imported_at)
				 VALUES ('official', ?, ?, datetime('now'))
				 RETURNING id`
			)
			.bind(body.sourceUrl || null, body.sourceFilename || null)
			.first();

		const product = await database
			.prepare(
				`INSERT INTO products
					(sport_id, manufacturer_id, year, name, slug, primary_source_id, published)
				 VALUES (?, ?, ?, ?, ?, ?, 1)
				 RETURNING id`
			)
			.bind(
				body.sportId,
				body.manufacturerId,
				body.year,
				body.name,
				slug,
				source.id
			)
			.first();

		const checklistIds = new Map();
		const subjectIds = new Map();
		const affiliationIds = new Map();

		const existingAff = await database.prepare('SELECT id, name FROM affiliations').all();

		for (const affiliation of existingAff.results || []) {
			affiliationIds.set(affiliation.name.toLowerCase(), affiliation.id);
		}

		let sort = 0;

		for (const card of body.cards) {
			if (!checklistIds.has(card.checklist_name)) {
				const row = await database
					.prepare(
						`INSERT INTO checklists
							(product_id, name, slug, kind, sort_order)
						 VALUES (?, ?, ?, ?, ?)
						 RETURNING id`
					)
					.bind(
						product.id,
						card.checklist_name,
						slugify(card.checklist_name),
						'checklist',
						sort++
					)
					.first();

				checklistIds.set(card.checklist_name, row.id);
			}

			const subjectName = resolvedSubject(card);
			const subjectKey = subjectName.toLowerCase();

			if (!subjectIds.has(subjectKey)) {
				let row = await database
					.prepare('SELECT id FROM subjects WHERE normalized_name = ?')
					.bind(subjectKey)
					.first();

				if (!row) {
					row = await database
						.prepare(
							`INSERT INTO subjects
								(name, normalized_name, subject_type)
							 VALUES (?, ?, ?)
							 RETURNING id`
						)
						.bind(
							subjectName,
							subjectKey,
							card.affiliation === 'NIL' ? 'personality' : 'athlete'
						)
						.first();
				}

				subjectIds.set(subjectKey, row.id);
			}

			let affiliationId = null;

			if (card.affiliation && card.affiliation !== 'NIL') {
				affiliationId =
					affiliationIds.get(card.affiliation.toLowerCase()) || null;

				if (!affiliationId) {
					const row = await database
						.prepare(
							`INSERT INTO affiliations
								(name, normalized_name, type, aliases_json)
							 VALUES (?, ?, 'team', '[]')
							 RETURNING id`
						)
						.bind(card.affiliation, card.affiliation.toLowerCase())
						.first();

					affiliationId = row.id;
					affiliationIds.set(
						card.affiliation.toLowerCase(),
						affiliationId
					);
				}
			}

			await database
				.prepare(
					`INSERT INTO cards
						(product_id, checklist_id, subject_id, affiliation_id, card_number,
						 sort_key, rookie, autograph, memorabilia, serial_number,
						 confidence, raw_source)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
				)
				.bind(
					product.id,
					checklistIds.get(card.checklist_name),
					subjectIds.get(subjectKey),
					affiliationId,
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

		const checklistMeta = body.checklistMeta || {};

		for (const [name, meta] of Object.entries(checklistMeta)) {
			const checklistId = checklistIds.get(name);
			if (!checklistId) continue;

			await database
				.prepare(
					`INSERT INTO checklist_details
						(checklist_id, card_count_declared, parallels_json, notes_json, updated_at)
					 VALUES (?, ?, ?, ?, datetime('now'))
					 ON CONFLICT(checklist_id) DO UPDATE SET
						card_count_declared = excluded.card_count_declared,
						parallels_json = excluded.parallels_json,
						notes_json = excluded.notes_json,
						updated_at = datetime('now')`
				)
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
			imported: body.cards.length
		});
	} catch (e) {
		return json(
			{ message: e?.message || 'Import failed.' },
			{ status: 500 }
		);
	}
}
