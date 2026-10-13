import { db } from '$lib/server/db';

export async function load({ platform }) {
	const database = db(platform);

	const [totalRow, weekRow, activeRow, recentResult] = await Promise.all([
		database.prepare(`SELECT COUNT(*) AS count FROM users`).first(),
		database.prepare(`SELECT COUNT(*) AS count FROM users WHERE datetime(created_at) >= datetime('now', '-7 days')`).first(),
		database.prepare(`SELECT COUNT(DISTINCT user_id) AS count FROM collection_cards`).first(),
		database.prepare(`
			SELECT id, email, display_name, created_at, is_admin
			FROM users
			ORDER BY datetime(created_at) DESC, id DESC
			LIMIT 5
		`).all()
	]);

	return {
		userStats: {
			total: Number(totalRow?.count || 0),
			last7Days: Number(weekRow?.count || 0),
			withCollectionActivity: Number(activeRow?.count || 0),
			recent: recentResult.results || []
		}
	};
}
