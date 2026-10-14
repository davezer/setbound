import { db } from '$lib/server/db';

export async function load({ platform }) {
	const database = db(platform);

	const [sportsResult, manufacturersResult, affiliationsResult, productsResult] = await Promise.all([
		database.prepare('SELECT id, name, slug FROM sports ORDER BY sort_order, name').all(),
		database.prepare('SELECT id, name, slug FROM manufacturers ORDER BY name').all(),
		database.prepare('SELECT id, name, aliases_json FROM affiliations ORDER BY length(name) DESC').all(),
		database.prepare('SELECT id, year, name, slug FROM products ORDER BY year DESC, name').all()
	]);

	return {
		sports: sportsResult.results || [],
		manufacturers: manufacturersResult.results || [],
		affiliations: (affiliationsResult.results || []).map((item) => ({
			...item,
			aliases: JSON.parse(item.aliases_json || '[]')
		})),
		products: productsResult.results || []
	};
}
