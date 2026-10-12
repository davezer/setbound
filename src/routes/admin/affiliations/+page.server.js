import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';

function clean(value) {
	return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalized(value) {
	return clean(value).toLowerCase();
}

function parseIds(form) {
	return form.getAll('affiliation_id')
		.map((value) => Number(value))
		.filter((value) => Number.isInteger(value) && value > 0);
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
	bulk: async ({ platform, request, url }) => {
		const database = db(platform);
		const form = await request.formData();
		const ids = parseIds(form);

		if (!ids.length) {
			return fail(400, { message: 'Select at least one affiliation.' });
		}

		const sportMode = String(form.get('bulk_sport') || 'unchanged');
		const leagueMode = String(form.get('league_mode') || 'unchanged');
		const leagueValue = clean(form.get('bulk_league'));
		const typeMode = String(form.get('bulk_type') || 'unchanged');

		const assignments = [];
		const bindings = [];

		if (sportMode === 'clear') {
			assignments.push('sport_id = NULL');
		} else if (/^\d+$/.test(sportMode)) {
			assignments.push('sport_id = ?');
			bindings.push(Number(sportMode));
		}

		if (leagueMode === 'clear') {
			assignments.push('league = NULL');
		} else if (leagueMode === 'set') {
			if (!leagueValue) {
				return fail(400, { message: 'Enter a league value, or choose Clear league.' });
			}
			assignments.push('league = ?');
			bindings.push(leagueValue);
		}

		if (typeMode !== 'unchanged') {
			const allowed = new Set(['team', 'school', 'country', 'organization', 'other']);
			if (!allowed.has(typeMode)) {
				return fail(400, { message: 'Invalid affiliation type.' });
			}

			assignments.push('type = ?');
			bindings.push(typeMode);
		}

		if (!assignments.length) {
			return fail(400, { message: 'Choose at least one field to change.' });
		}

		const placeholders = ids.map(() => '?').join(', ');

		await database.prepare(`
			UPDATE affiliations
			SET ${assignments.join(', ')}
			WHERE id IN (${placeholders})
		`).bind(...bindings, ...ids).run();

		const params = new URLSearchParams(url.searchParams);
		params.set('bulk_saved', String(ids.length));

		throw redirect(303, `/admin/affiliations?${params.toString()}`);
	},

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
