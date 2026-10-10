import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';

function normalizeName(value) {
	return String(value || '')
		.trim()
		.replace(/\s+/g, ' ')
		.toLowerCase();
}

export async function load({ platform, url }) {
	const database = db(platform);
	const q = String(url.searchParams.get('q') || '').trim();

	const result = await database.prepare(`
		SELECT
			s.id,
			s.name,
			s.normalized_name,
			s.subject_type,
			COUNT(c.id) AS card_count,
			COUNT(DISTINCT c.product_id) AS set_count,
			GROUP_CONCAT(DISTINCT COALESCE(a.name, 'NIL')) AS affiliations,
			GROUP_CONCAT(DISTINCT p.year || ' ' || p.name) AS products
		FROM subjects s
		LEFT JOIN cards c ON c.subject_id = s.id
		LEFT JOIN affiliations a ON a.id = c.affiliation_id
		LEFT JOIN products p ON p.id = c.product_id
		WHERE (
			? = ''
			OR instr(lower(s.name), lower(?)) > 0
			OR instr(lower(s.normalized_name), lower(?)) > 0
		)
		GROUP BY s.id
		ORDER BY
			CASE
				WHEN instr(s.name, '/') > 0 THEN 0
				WHEN LENGTH(s.name) - LENGTH(REPLACE(s.name, ' ', '')) >= 3 THEN 1
				ELSE 2
			END,
			COUNT(c.id) DESC,
			s.name
		LIMIT 250
	`).bind(q, q, q).all();

	return {
		q,
		subjects: (result.results || []).map((row) => ({
			...row,
			card_count: Number(row.card_count || 0),
			set_count: Number(row.set_count || 0),
			affiliations: row.affiliations ? row.affiliations.split(',').slice(0, 8) : [],
			products: row.products ? row.products.split(',').slice(0, 6) : []
		}))
	};
}

export const actions = {
	rename: async ({ platform, request }) => {
		const database = db(platform);
		const form = await request.formData();
		const id = Number(form.get('subject_id'));
		const name = String(form.get('name') || '').trim().replace(/\s+/g, ' ');
		const normalized = normalizeName(name);

		if (!Number.isInteger(id) || id <= 0) {
			return fail(400, { message: 'Invalid subject.' });
		}

		if (!name || name.length < 2) {
			return fail(400, { message: 'Enter a valid subject name.' });
		}

		const source = await database.prepare(
			'SELECT id, name FROM subjects WHERE id = ?'
		).bind(id).first();

		if (!source) {
			return fail(404, { message: 'Subject not found.' });
		}

		const collision = await database.prepare(`
			SELECT id, name
			FROM subjects
			WHERE normalized_name = ?
			  AND id != ?
		`).bind(normalized, id).first();

		if (collision) {
			return fail(409, {
				message: `“${collision.name}” already exists. Use Merge instead of Rename.`
			});
		}

		await database.prepare(`
			UPDATE subjects
			SET name = ?, normalized_name = ?
			WHERE id = ?
		`).bind(name, normalized, id).run();

		throw redirect(
			303,
			`/admin/subjects?q=${encodeURIComponent(name)}&saved=1`
		);
	},

	merge: async ({ platform, request }) => {
		const database = db(platform);
		const form = await request.formData();
		const sourceId = Number(form.get('subject_id'));
		const targetName = String(form.get('target_name') || '').trim().replace(/\s+/g, ' ');
		const targetNormalized = normalizeName(targetName);

		if (!Number.isInteger(sourceId) || sourceId <= 0) {
			return fail(400, { message: 'Invalid source subject.' });
		}

		if (!targetName) {
			return fail(400, { message: 'Enter the exact subject name to merge into.' });
		}

		const [source, target] = await Promise.all([
			database.prepare(
				'SELECT id, name FROM subjects WHERE id = ?'
			).bind(sourceId).first(),
			database.prepare(
				'SELECT id, name FROM subjects WHERE normalized_name = ?'
			).bind(targetNormalized).first()
		]);

		if (!source) {
			return fail(404, { message: 'Source subject not found.' });
		}

		if (!target) {
			return fail(404, {
				message: `No existing subject named “${targetName}”. Rename this subject instead, or enter an existing target.`
			});
		}

		if (target.id === source.id) {
			return fail(400, { message: 'Source and target are the same subject.' });
		}

		const sourceCards = await database.prepare(`
			SELECT
				id,
				product_id,
				checklist_id,
				affiliation_id,
				card_number,
				rookie,
				autograph,
				memorabilia,
				serial_number,
				variation
			FROM cards
			WHERE subject_id = ?
			ORDER BY id
		`).bind(sourceId).all();

		for (const card of sourceCards.results || []) {
			const duplicate = await database.prepare(`
				SELECT id
				FROM cards
				WHERE subject_id = ?
				  AND product_id = ?
				  AND checklist_id = ?
				  AND IFNULL(affiliation_id, -1) = IFNULL(?, -1)
				  AND card_number = ?
				  AND rookie = ?
				  AND autograph = ?
				  AND memorabilia = ?
				  AND IFNULL(serial_number, -1) = IFNULL(?, -1)
				  AND IFNULL(variation, '') = IFNULL(?, '')
				LIMIT 1
			`).bind(
				target.id,
				card.product_id,
				card.checklist_id,
				card.affiliation_id,
				card.card_number,
				card.rookie,
				card.autograph,
				card.memorabilia,
				card.serial_number,
				card.variation
			).first();

			if (duplicate) {
				const collectionRows = await database.prepare(`
					SELECT user_id, status
					FROM collection_cards
					WHERE card_id = ?
				`).bind(card.id).all();

				for (const row of collectionRows.results || []) {
					await database.prepare(`
						INSERT INTO collection_cards (
							user_id,
							card_id,
							status,
							created_at,
							updated_at
						)
						VALUES (?, ?, ?, datetime('now'), datetime('now'))
						ON CONFLICT(user_id, card_id) DO UPDATE SET
							status = CASE
								WHEN collection_cards.status = 'owned'
									OR excluded.status = 'owned'
								THEN 'owned'
								ELSE 'wanted'
							END,
							updated_at = datetime('now')
					`).bind(
						row.user_id,
						duplicate.id,
						row.status
					).run();
				}

				await database.prepare(
					'DELETE FROM collection_cards WHERE card_id = ?'
				).bind(card.id).run();

				await database.prepare(
					'DELETE FROM cards WHERE id = ?'
				).bind(card.id).run();
			} else {
				await database.prepare(
					'UPDATE cards SET subject_id = ? WHERE id = ?'
				).bind(target.id, card.id).run();
			}
		}

		await database.prepare(
			'DELETE FROM subjects WHERE id = ?'
		).bind(sourceId).run();

		throw redirect(
			303,
			`/admin/subjects?q=${encodeURIComponent(target.name)}&merged=1`
		);
	}
};
