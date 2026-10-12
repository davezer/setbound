import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';

function clean(value) {
	return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalized(value) {
	return clean(value).toLowerCase();
}

function slug(value) {
	return normalized(value)
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/&/g, ' and ')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

export async function load({ platform, url }) {
	const database = db(platform);
	const q = clean(url.searchParams.get('q'));

	const [sports, affiliations] = await Promise.all([
		database.prepare(`
			SELECT id, name
			FROM sports
			ORDER BY sort_order, name
		`).all(),

		database.prepare(`
			SELECT
				a.id,
				a.name,
				a.normalized_name,
				a.sport_id,
				s.name AS sport_name,
				a.league,
				a.type,
				a.aliases_json,
				COUNT(c.id) AS card_count
			FROM affiliations a
			LEFT JOIN sports s ON s.id = a.sport_id
			LEFT JOIN cards c ON c.affiliation_id = a.id
			WHERE
				? = ''
				OR instr(lower(a.name), lower(?)) > 0
				OR instr(lower(COALESCE(a.league, '')), lower(?)) > 0
				OR instr(lower(a.aliases_json), lower(?)) > 0
			GROUP BY a.id
			ORDER BY COUNT(c.id) DESC, a.name
			LIMIT 500
		`).bind(q, q, q, q).all()
	]);

	return {
		q,
		sports: sports.results || [],
		affiliations: (affiliations.results || []).map((row) => ({
			...row,
			card_count: Number(row.card_count || 0),
			aliases: (() => {
				try { return JSON.parse(row.aliases_json || '[]'); }
				catch { return []; }
			})()
		}))
	};
}

export const actions = {
	save: async ({ platform, request, url }) => {
		const database = db(platform);
		const form = await request.formData();

		const id = Number(form.get('affiliation_id'));
		const name = clean(form.get('name'));
		const sportId = Number(form.get('sport_id') || 0) || null;
		const league = clean(form.get('league')) || null;
		const type = clean(form.get('type')) || 'team';
		const aliases = String(form.get('aliases') || '')
			.split(/\r?\n|,/)
			.map(clean)
			.filter(Boolean);

		if (!Number.isInteger(id) || id <= 0) return fail(400, { message: 'Invalid affiliation.' });
		if (!name) return fail(400, { message: 'Name is required.' });

		const collision = await database.prepare(`
			SELECT id, name
			FROM affiliations
			WHERE normalized_name = ?
			  AND id != ?
		`).bind(normalized(name), id).first();

		if (collision) {
			return fail(409, { message: `“${collision.name}” already exists. Merge instead of renaming to a duplicate.` });
		}

		await database.prepare(`
			UPDATE affiliations
			SET
				name = ?,
				normalized_name = ?,
				sport_id = ?,
				league = ?,
				type = ?,
				aliases_json = ?
			WHERE id = ?
		`).bind(
			name,
			normalized(name),
			sportId,
			league,
			type,
			JSON.stringify([...new Set(aliases)]),
			id
		).run();

		const params = new URLSearchParams(url.searchParams);
		params.set('saved', String(id));
		throw redirect(303, `/admin/affiliations?${params.toString()}`);
	},

	create: async ({ platform, request }) => {
		const database = db(platform);
		const form = await request.formData();

		const name = clean(form.get('name'));
		const sportId = Number(form.get('sport_id') || 0) || null;
		const league = clean(form.get('league')) || null;
		const type = clean(form.get('type')) || 'team';

		if (!name) return fail(400, { message: 'Name is required.' });

		try {
			await database.prepare(`
				INSERT INTO affiliations
					(name, normalized_name, sport_id, league, type, aliases_json)
				VALUES (?, ?, ?, ?, ?, '[]')
			`).bind(name, normalized(name), sportId, league, type).run();
		} catch {
			return fail(409, { message: 'That affiliation already exists.' });
		}

		throw redirect(303, `/admin/affiliations?q=${encodeURIComponent(name)}&created=1`);
	}
};
