import { db } from '$lib/server/db';
import { fail } from '@sveltejs/kit';

export async function load({ platform, url }) {
	const database = db(platform);
	const q = String(url.searchParams.get('q') || '').trim();
	const normalized = q.toLowerCase();
	const where = q
		? `WHERE instr(lower(u.email), ?) > 0 OR instr(lower(COALESCE(u.display_name, '')), ?) > 0`
		: '';
	const bindings = q ? [normalized, normalized] : [];

	const [summary, usersResult] = await Promise.all([
		database.prepare(`
			SELECT
				COUNT(*) AS total,
				SUM(CASE WHEN datetime(created_at) >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS last_7_days,
				SUM(CASE WHEN is_admin = 1 THEN 1 ELSE 0 END) AS admins
			FROM users
		`).first(),
		database.prepare(`
			SELECT
				u.id,
				u.email,
				u.display_name,
				u.created_at,
				u.is_admin,
				u.is_breaker,
				SUM(CASE WHEN cc.status = 'owned' THEN 1 ELSE 0 END) AS owned_count,
				SUM(CASE WHEN cc.status = 'wanted' THEN 1 ELSE 0 END) AS wanted_count,
				COUNT(cc.card_id) AS tracked_count
			FROM users u
			LEFT JOIN collection_cards cc ON cc.user_id = u.id
			${where}
			GROUP BY u.id
			ORDER BY datetime(u.created_at) DESC, u.id DESC
			LIMIT 500
		`).bind(...bindings).all()
	]);

	return {
		q,
		stats: {
			total: Number(summary?.total || 0),
			last7Days: Number(summary?.last_7_days || 0),
			admins: Number(summary?.admins || 0)
		},
		users: (usersResult.results || []).map((user) => ({
			...user,
			owned_count: Number(user.owned_count || 0),
			wanted_count: Number(user.wanted_count || 0),
			tracked_count: Number(user.tracked_count || 0)
		}))
	};
}

export const actions = {
  breaker: async ({request,platform,locals}) => {
    if (!locals.isAdmin) return fail(403,{message:'Admin access required.'});
    const form=await request.formData();
    const id=Number(form.get('user_id'));
    const enabled=String(form.get('enabled'))==='1';
    if (!Number.isSafeInteger(id)||id<=0) return fail(400,{message:'Invalid user.'});
    const database=db(platform);
    const result=await database.prepare('UPDATE users SET is_breaker=? WHERE id=?').bind(enabled?1:0,id).run();
    if (!Number(result.meta?.changes||0)) return fail(404,{message:'User not found.'});
    return {message:enabled?'Breaker access granted.':'Breaker access revoked.'};
  }
};
