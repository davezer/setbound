import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';

function normalize(value) {
	return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizedKey(value) {
	return normalize(value).toLowerCase();
}

async function resolveSubject(database, name, currentSubjectId) {
	const clean = normalize(name);

	if (!clean) throw new Error('Subject name is required.');

	const key = normalizedKey(clean);

	const existing = await database.prepare(`
		SELECT id
		FROM subjects
		WHERE normalized_name = ?
		LIMIT 1
	`).bind(key).first();

	if (existing) return existing.id;

	if (currentSubjectId) {
		const current = await database.prepare(`
			SELECT id, name
			FROM subjects
			WHERE id = ?
		`).bind(currentSubjectId).first();

		if (current) {
			const useCount = await database.prepare(`
				SELECT COUNT(*) AS count
				FROM cards
				WHERE subject_id = ?
			`).bind(currentSubjectId).first();

			if (Number(useCount?.count || 0) === 1) {
				await database.prepare(`
					UPDATE subjects
					SET name = ?, normalized_name = ?
					WHERE id = ?
				`).bind(clean, key, currentSubjectId).run();

				return currentSubjectId;
			}
		}
	}

	const created = await database.prepare(`
		INSERT INTO subjects (name, normalized_name, subject_type)
		VALUES (?, ?, 'athlete')
		RETURNING id
	`).bind(clean, key).first();

	return created.id;
}

async function resolveAffiliation(database, name, sportId) {
	const clean = normalize(name);

	if (!clean || clean.toUpperCase() === 'NIL') return null;

	const key = normalizedKey(clean);

	let existing = await database.prepare(`
		SELECT id
		FROM affiliations
		WHERE normalized_name = ?
		LIMIT 1
	`).bind(key).first();

	if (existing) return existing.id;

	existing = await database.prepare(`
		SELECT id
		FROM affiliations
		WHERE lower(name) = lower(?)
		LIMIT 1
	`).bind(clean).first();

	if (existing) return existing.id;

	const created = await database.prepare(`
		INSERT INTO affiliations
			(name, normalized_name, sport_id, type, aliases_json)
		VALUES (?, ?, ?, 'team', '[]')
		RETURNING id
	`).bind(clean, key, sportId || null).first();

	return created.id;
}

export async function load({ platform, url }) {
	const database = db(platform);

	const q = normalize(url.searchParams.get('q'));
	const productId = Number(url.searchParams.get('product') || 0);
	const affiliationFilter = String(url.searchParams.get('affiliation') || 'all');
	const flagFilter = String(url.searchParams.get('flag') || 'all');

	const products = await database.prepare(`
		SELECT p.id, p.year, p.name, m.name AS manufacturer_name, s.name AS sport_name
		FROM products p
		JOIN manufacturers m ON m.id = p.manufacturer_id
		JOIN sports s ON s.id = p.sport_id
		ORDER BY p.year DESC, p.name
	`).all();

	const affiliations = await database.prepare(`
		SELECT a.id, a.name, a.league, a.type, s.name AS sport_name
		FROM affiliations a
		LEFT JOIN sports s ON s.id = a.sport_id
		ORDER BY a.name
	`).all();

	const where = ['1 = 1'];
	const bindings = [];

	if (q) {
		where.push(`(
			instr(lower(sub.name), lower(?)) > 0
			OR instr(lower(c.card_number), lower(?)) > 0
			OR instr(lower(COALESCE(a.name, '')), lower(?)) > 0
			OR instr(lower(cl.name), lower(?)) > 0
			OR instr(lower(p.name), lower(?)) > 0
		)`);
		bindings.push(q, q, q, q, q);
	}

	if (productId > 0) {
		where.push('p.id = ?');
		bindings.push(productId);
	}

	if (affiliationFilter === 'nil') {
		where.push('c.affiliation_id IS NULL');
	} else if (/^\d+$/.test(affiliationFilter)) {
		where.push('c.affiliation_id = ?');
		bindings.push(Number(affiliationFilter));
	}

	if (flagFilter === 'rookie') where.push('c.rookie = 1');
	if (flagFilter === 'autograph') where.push('c.autograph = 1');
	if (flagFilter === 'memorabilia') where.push('c.memorabilia = 1');

	const result = await database.prepare(`
		SELECT
			c.id,
			c.card_number,
			c.subject_id,
			sub.name AS subject_name,
			c.affiliation_id,
			COALESCE(a.name, 'NIL') AS affiliation_name,
			a.league AS affiliation_league,
			c.rookie,
			c.autograph,
			c.memorabilia,
			c.serial_number,
			c.variation,
			c.notes,
			c.confidence,
			c.raw_source,
			p.id AS product_id,
			p.year,
			p.name AS product_name,
			p.sport_id,
			s.name AS sport_name,
			m.name AS manufacturer_name,
			cl.name AS checklist_name
		FROM cards c
		JOIN subjects sub ON sub.id = c.subject_id
		LEFT JOIN affiliations a ON a.id = c.affiliation_id
		JOIN products p ON p.id = c.product_id
		JOIN sports s ON s.id = p.sport_id
		JOIN manufacturers m ON m.id = p.manufacturer_id
		JOIN checklists cl ON cl.id = c.checklist_id
		WHERE ${where.join(' AND ')}
		ORDER BY p.year DESC, p.name, cl.sort_order, c.sort_key
		LIMIT 300
	`).bind(...bindings).all();

	return {
		q,
		productId,
		affiliationFilter,
		flagFilter,
		products: products.results || [],
		affiliations: affiliations.results || [],
		cards: result.results || []
	};
}

export const actions = {
	update: async ({ platform, request, url }) => {
		const database = db(platform);
		const form = await request.formData();

		const cardId = Number(form.get('card_id'));
		const subjectName = normalize(form.get('subject_name'));
		const affiliationName = normalize(form.get('affiliation_name'));
		const serialRaw = normalize(form.get('serial_number'));
		const variation = normalize(form.get('variation')) || null;
		const notes = normalize(form.get('notes')) || null;

		if (!Number.isInteger(cardId) || cardId <= 0) {
			return fail(400, { message: 'Invalid card.' });
		}

		const card = await database.prepare(`
			SELECT c.id, c.subject_id, p.sport_id
			FROM cards c
			JOIN products p ON p.id = c.product_id
			WHERE c.id = ?
		`).bind(cardId).first();

		if (!card) return fail(404, { message: 'Card not found.' });

		let serialNumber = null;

		if (serialRaw) {
			serialNumber = Number(serialRaw.replace(/^\//, ''));

			if (!Number.isInteger(serialNumber) || serialNumber <= 0) {
				return fail(400, { message: 'Serial number must be a positive number.' });
			}
		}

		try {
			const subjectId = await resolveSubject(database, subjectName, card.subject_id);
			const affiliationId = await resolveAffiliation(database, affiliationName, card.sport_id);

			await database.prepare(`
				UPDATE cards
				SET
					subject_id = ?,
					affiliation_id = ?,
					rookie = ?,
					autograph = ?,
					memorabilia = ?,
					serial_number = ?,
					variation = ?,
					notes = ?,
					confidence = 1.0
				WHERE id = ?
			`).bind(
				subjectId,
				affiliationId,
				form.get('rookie') === '1' ? 1 : 0,
				form.get('autograph') === '1' ? 1 : 0,
				form.get('memorabilia') === '1' ? 1 : 0,
				serialNumber,
				variation,
				notes,
				cardId
			).run();
		} catch (error) {
			return fail(400, { message: error?.message || 'Could not update card.' });
		}

		const params = new URLSearchParams(url.searchParams);
		params.set('saved', String(cardId));

		throw redirect(303, `/admin/cards?${params.toString()}`);
	},

	bulkAffiliation: async ({ platform, request, url }) => {
		const database = db(platform);
		const form = await request.formData();

		const rawIds = form.getAll('card_ids');
		const cardIds = [...new Set(
			rawIds
				.map((value) => Number(value))
				.filter((value) => Number.isInteger(value) && value > 0)
		)];

		if (!cardIds.length) {
			return fail(400, { message: 'Select at least one card first.' });
		}

		const target = normalize(form.get('bulk_affiliation'));

		let affiliationId = null;

		if (target && target.toUpperCase() !== 'NIL') {
			const numericId = Number(target);

			if (!Number.isInteger(numericId) || numericId <= 0) {
				return fail(400, { message: 'Invalid bulk affiliation.' });
			}

			const affiliation = await database.prepare(`
				SELECT id
				FROM affiliations
				WHERE id = ?
				LIMIT 1
			`).bind(numericId).first();

			if (!affiliation) {
				return fail(400, { message: 'Bulk affiliation not found.' });
			}

			affiliationId = affiliation.id;
		}

		try {
			const placeholders = cardIds.map(() => '?').join(', ');

			await database.prepare(`
				UPDATE cards
				SET affiliation_id = ?, confidence = 1.0
				WHERE id IN (${placeholders})
			`).bind(affiliationId, ...cardIds).run();
		} catch (error) {
			return fail(400, {
				message:
					error?.message?.includes('idx_cards_unique_identity')
						? 'That bulk change would create duplicate logical cards. Review the conflicting rows first.'
						: error?.message || 'Could not bulk update affiliations.'
			});
		}

		const params = new URLSearchParams(url.searchParams);
		params.set('bulkSaved', String(cardIds.length));

		throw redirect(303, `/admin/cards?${params.toString()}`);
	}
};
