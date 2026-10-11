import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export async function load({ locals, platform }) {
	if (!locals.user) throw redirect(303, '/auth/login?next=/collection');

	const database = db(platform);

	const [profile, setsResult, ownedResult, wantedResult] = await Promise.all([
		database.prepare(`
			SELECT
				id,
				email,
				display_name,
				public_handle,
				collection_public,
				profile_bio
			FROM users
			WHERE id = ?
		`).bind(locals.user.id).first(),

		database.prepare(`
			SELECT
				p.id,
				p.slug,
				p.year,
				p.name,
				p.image_key,
				m.name AS manufacturer_name,
				s.name AS sport_name,
				COUNT(DISTINCT c.id) AS total_cards,
				COUNT(DISTINCT CASE WHEN uc.status = 'owned' THEN c.id END) AS owned_cards,
				COUNT(DISTINCT CASE WHEN uc.status = 'wanted' THEN c.id END) AS wanted_cards,
				MAX(uc.updated_at) AS collection_updated_at
			FROM products p
			JOIN manufacturers m ON m.id = p.manufacturer_id
			JOIN sports s ON s.id = p.sport_id
			JOIN cards c ON c.product_id = p.id
			LEFT JOIN collection_cards uc
				ON uc.card_id = c.id
				AND uc.user_id = ?
			WHERE p.published = 1
			GROUP BY p.id
			HAVING
				COUNT(DISTINCT CASE WHEN uc.status = 'owned' THEN c.id END) > 0
				OR COUNT(DISTINCT CASE WHEN uc.status = 'wanted' THEN c.id END) > 0
			ORDER BY collection_updated_at DESC, p.year DESC, p.name
		`).bind(locals.user.id).all(),

		cardList(database, locals.user.id, 'owned'),
		cardList(database, locals.user.id, 'wanted')
	]);

	const sets = (setsResult.results || []).map((set) => {
		const total = Number(set.total_cards || 0);
		const owned = Number(set.owned_cards || 0);
		const wanted = Number(set.wanted_cards || 0);

		return {
			...set,
			total_cards: total,
			owned_cards: owned,
			wanted_cards: wanted,
			missing_cards: Math.max(0, total - owned),
			percent_complete: total ? Math.round((owned / total) * 100) : 0
		};
	});

	const owned = ownedResult.results || [];
	const wanted = wantedResult.results || [];

	return {
		profile: {
			...profile,
			collection_public: Boolean(profile?.collection_public)
		},
		sets,
		owned,
		wanted,
		totals: {
			owned: owned.length,
			wanted: wanted.length,
			sets: sets.length,
			incomplete: sets.filter((set) => set.owned_cards < set.total_cards).length
		}
	};
}

export const actions = {
	sharing: async ({ locals, platform, request }) => {
		if (!locals.user) throw redirect(303, '/auth/login?next=/collection');

		const database = db(platform);
		const form = await request.formData();

		const enabled = form.get('collection_public') === '1';
		const handle = normalizeHandle(form.get('public_handle'));
		const bio = String(form.get('profile_bio') || '').trim().slice(0, 240) || null;

		if (enabled && !handle) {
			return fail(400, {
				shareError: 'Choose a public handle before turning sharing on.'
			});
		}

		if (handle && !/^[a-z0-9][a-z0-9-]{2,31}$/.test(handle)) {
			return fail(400, {
				shareError: 'Handle must be 3–32 characters using lowercase letters, numbers, and hyphens.'
			});
		}

		if (handle) {
			const taken = await database.prepare(`
				SELECT id
				FROM users
				WHERE public_handle = ?
				  AND id != ?
				LIMIT 1
			`).bind(handle, locals.user.id).first();

			if (taken) {
				return fail(409, { shareError: 'That public handle is already taken.' });
			}
		}

		await database.prepare(`
			UPDATE users
			SET
				public_handle = ?,
				collection_public = ?,
				profile_bio = ?,
				updated_at = datetime('now')
			WHERE id = ?
		`).bind(handle || null, enabled ? 1 : 0, bio, locals.user.id).run();

		throw redirect(303, '/collection?saved=sharing');
	}
};

function cardList(database, userId, status) {
	return database.prepare(`
		SELECT
			c.id,
			c.card_number,
			c.rookie,
			c.autograph,
			c.memorabilia,
			c.serial_number,
			sub.id AS subject_id,
			sub.name AS subject_name,
			a.id AS affiliation_id,
			COALESCE(a.name, 'NIL') AS affiliation_name,
			cl.name AS checklist_name,
			p.slug,
			p.year,
			p.name AS product_name,
			m.name AS manufacturer_name,
			s.name AS sport_name
		FROM collection_cards uc
		JOIN cards c ON c.id = uc.card_id
		JOIN subjects sub ON sub.id = c.subject_id
		LEFT JOIN affiliations a ON a.id = c.affiliation_id
		JOIN checklists cl ON cl.id = c.checklist_id
		JOIN products p ON p.id = c.product_id
		JOIN manufacturers m ON m.id = p.manufacturer_id
		JOIN sports s ON s.id = p.sport_id
		WHERE uc.user_id = ?
		  AND uc.status = ?
		  AND p.published = 1
		ORDER BY p.year DESC, p.name, cl.sort_order, c.sort_key
		LIMIT 5000
	`).bind(userId, status).all();
}

function normalizeHandle(value) {
	return String(value || '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.replace(/-{2,}/g, '-')
		.slice(0, 32);
}
