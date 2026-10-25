import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { productDisplayName } from '$lib/product-display.js';

export async function load({ platform, params, locals, url }) {
	const preview = url.pathname.startsWith('/admin/sets/preview/');
	if (preview && !locals.isAdmin) throw error(403, 'Admin access required');
	const database = db(platform);

	const product = await database.prepare(`
		SELECT
			p.*,
			m.name AS manufacturer_name,
			s.name AS sport_name,
			src.original_filename,
			src.source_url,
			src.imported_at
		FROM products p
		JOIN manufacturers m ON m.id = p.manufacturer_id
		JOIN sports s ON s.id = p.sport_id
		LEFT JOIN sources src ON src.id = p.primary_source_id
		WHERE p.slug = ?
		  AND (p.published = 1 OR ? = 1)
	`).bind(params.slug, preview ? 1 : 0).first();

	if (!product) throw error(404, 'Set not found');

	// Keep the canonical DB value intact, but expose the collector-facing
	// name to the public page without a duplicated year prefix.
	product.name = productDisplayName(product.name, product.year);

	const collectionJoin = !preview && locals.user
		? `LEFT JOIN collection_cards uc ON uc.card_id = c.id AND uc.user_id = ${Number(locals.user.id)}`
		: '';

	const collectionSelect = !preview && locals.user
		? ', uc.status AS collection_status'
		: ', NULL AS collection_status';

	const [checklists, cards, formats, oddsSource, oddsFormats, oddsRows] = await Promise.all([
		database.prepare(`
			SELECT
				cl.id,
				cl.name,
				cl.kind,
				COUNT(c.id) AS card_count,
				cd.card_count_declared,
				cd.parallels_json,
				cd.notes_json
			FROM checklists cl
			LEFT JOIN cards c ON c.checklist_id = cl.id
			LEFT JOIN checklist_details cd ON cd.checklist_id = cl.id
			WHERE cl.product_id = ?
			GROUP BY cl.id
			ORDER BY cl.sort_order, cl.name
		`).bind(product.id).all(),

		database.prepare(`
			SELECT
				c.id,
				c.card_number,
				c.rookie,
				c.autograph,
				c.memorabilia,
				c.serial_number,
				c.confidence,
				sub.name AS subject_name,
				COALESCE(c.affiliation_label, a.name, 'NIL') AS affiliation_name,
				COALESCE(a.name, 'NIL') AS franchise_name,
				cl.name AS checklist_name
				${collectionSelect}
			FROM cards c
			JOIN subjects sub ON sub.id = c.subject_id
			JOIN checklists cl ON cl.id = c.checklist_id
			LEFT JOIN affiliations a ON a.id = c.affiliation_id
			${collectionJoin}
			WHERE c.product_id = ?
			ORDER BY cl.sort_order, c.sort_key, c.card_number
			LIMIT 10000
		`).bind(product.id).all(),

		database.prepare(`
			SELECT format_key, label, details, sort_order
			FROM product_formats
			WHERE product_id = ?
			  AND TRIM(details) != ''
			ORDER BY sort_order, id
		`).bind(product.id).all(),

		database.prepare(`
			SELECT id, original_filename, source_url, disclaimer, imported_at
			FROM odds_sources
			WHERE product_id = ?
			ORDER BY imported_at DESC
			LIMIT 1
		`).bind(product.id).first(),

		database.prepare(`
			SELECT ofm.id, ofm.name, ofm.sort_order
			FROM odds_formats ofm
			JOIN odds_sources os ON os.id = ofm.source_id
			WHERE os.product_id = ?
			ORDER BY ofm.sort_order, ofm.id
		`).bind(product.id).all(),

		database.prepare(`
			SELECT
				oe.id,
				oe.checklist_id,
				oe.name,
				oe.sort_order,
				ov.format_id,
				ov.odds_text,
				ov.denominator
			FROM odds_entries oe
			JOIN odds_sources os ON os.id = oe.source_id
			LEFT JOIN odds_values ov ON ov.entry_id = oe.id
			WHERE os.product_id = ?
			ORDER BY oe.sort_order, oe.id
		`).bind(product.id).all()
	]);

	const oddsFormatList = oddsFormats.results || [];
	const oddsFormatMap = new Map(oddsFormatList.map((format) => [Number(format.id), format]));

	const oddsEntryMap = new Map();

	for (const row of oddsRows.results || []) {
		const id = Number(row.id);

		if (!oddsEntryMap.has(id)) {
			oddsEntryMap.set(id, {
				id,
				checklist_id: row.checklist_id ? Number(row.checklist_id) : null,
				name: row.name,
				sort_order: Number(row.sort_order || 0),
				values: {}
			});
		}

		if (row.format_id) {
			const format = oddsFormatMap.get(Number(row.format_id));
			if (format) {
				oddsEntryMap.get(id).values[String(format.id)] = {
					text: row.odds_text,
					denominator: row.denominator == null ? null : Number(row.denominator)
				};
			}
		}
	}

	return {
        canExport: Boolean(locals.isAdmin || locals.user?.is_admin || locals.user?.is_breaker),
		preview,
		product,
		formats: formats.results || [],
		oddsSource: oddsSource || null,
		oddsFormats: oddsFormatList,
		odds: [...oddsEntryMap.values()],
		checklists: (checklists.results || []).map((row) => ({
			...row,
			parallels: safeJson(row.parallels_json),
			notes: safeJson(row.notes_json)
		})),
		cards: cards.results || [],
		initialQuery: url.searchParams.get('q') || ''
	};
}

function safeJson(value) {
	if (!value) return [];
	try {
		return JSON.parse(value);
	} catch {
		return [];
	}
}
