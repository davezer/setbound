import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export async function load({ platform, url }) {
	const database = db(platform);
	const requestedId = Number(url.searchParams.get('product') || 0);

	const productResult = await database.prepare(`
		SELECT
			p.id,
			p.year,
			p.name,
			p.slug,
			m.name AS manufacturer_name,
			s.name AS sport_name,
			COUNT(DISTINCT oe.id) AS odds_rows
		FROM products p
		JOIN manufacturers m ON m.id = p.manufacturer_id
		JOIN sports s ON s.id = p.sport_id
		LEFT JOIN odds_sources os ON os.product_id = p.id
		LEFT JOIN odds_entries oe ON oe.source_id = os.id
		GROUP BY p.id
		ORDER BY p.year DESC, p.name
	`).all();

	const products = productResult.results || [];
	const selectedProductId = requestedId || Number(products[0]?.id || 0);

	const [checklistResult, sourceResult] = selectedProductId
		? await Promise.all([
				database.prepare(`
					SELECT
						cl.id,
						cl.name,
						COUNT(c.id) AS card_count
					FROM checklists cl
					LEFT JOIN cards c ON c.checklist_id = cl.id
					WHERE cl.product_id = ?
					GROUP BY cl.id, cl.name, cl.sort_order
					ORDER BY cl.sort_order, cl.name
				`).bind(selectedProductId).all(),

				database.prepare(`
					SELECT
						os.id,
						os.original_filename,
						os.source_url,
						os.disclaimer,
						os.imported_at,
						COUNT(DISTINCT oe.id) AS row_count,
						COUNT(DISTINCT ofm.id) AS format_count
					FROM odds_sources os
					LEFT JOIN odds_entries oe ON oe.source_id = os.id
					LEFT JOIN odds_formats ofm ON ofm.source_id = os.id
					WHERE os.product_id = ?
					GROUP BY os.id
					ORDER BY os.imported_at DESC
				`).bind(selectedProductId).all()
			])
		: [{ results: [] }, { results: [] }];

	return {
		products,
		selectedProductId,
		checklists: checklistResult.results || [],
		sources: sourceResult.results || []
	};
}

export const actions = {
	importOdds: async ({ platform, request }) => {
		const database = db(platform);
		const form = await request.formData();

		const productId = Number(form.get('product_id'));
		const filename = String(form.get('filename') || '').trim();
		const sourceUrl = String(form.get('source_url') || '').trim() || null;
		const disclaimer = String(form.get('disclaimer') || '').trim() || null;
		const replaceExisting = String(form.get('replace_existing') || '') === '1';

		let payload;

		try {
			payload = JSON.parse(String(form.get('payload') || ''));
		} catch {
			return fail(400, { message: 'The odds preview payload could not be read.' });
		}

		if (!Number.isInteger(productId) || productId <= 0) {
			return fail(400, { message: 'Choose a set first.' });
		}

		if (!Array.isArray(payload?.formats) || payload.formats.length < 1) {
			return fail(400, { message: 'No odds formats were detected.' });
		}

		if (!Array.isArray(payload?.rows) || payload.rows.length < 1) {
			return fail(400, { message: 'No odds rows were detected.' });
		}

		const product = await database.prepare(
			'SELECT id, name FROM products WHERE id = ?'
		).bind(productId).first();

		if (!product) return fail(404, { message: 'Set not found.' });

		const existing = await database.prepare(
			'SELECT id FROM odds_sources WHERE product_id = ? LIMIT 1'
		).bind(productId).first();

		if (existing && !replaceExisting) {
			return fail(409, {
				message: 'This set already has odds. Check “replace existing odds” to import a new sheet.'
			});
		}

		if (replaceExisting) {
			await database.prepare(
				'DELETE FROM odds_sources WHERE product_id = ?'
			).bind(productId).run();
		}

		const checklistResult = await database.prepare(`
			SELECT id, name
			FROM checklists
			WHERE product_id = ?
			ORDER BY LENGTH(name) DESC, sort_order
		`).bind(productId).all();

		const checklists = checklistResult.results || [];

		const sourceInsert = await database.prepare(`
			INSERT INTO odds_sources (
				product_id,
				original_filename,
				source_url,
				disclaimer,
				imported_at
			)
			VALUES (?, ?, ?, ?, datetime('now'))
		`).bind(productId, filename || null, sourceUrl, disclaimer).run();

		const sourceId = Number(sourceInsert.meta.last_row_id);
		const formatIds = [];

		for (let index = 0; index < payload.formats.length; index++) {
			const name = String(payload.formats[index]?.name || '').trim();
			if (!name) continue;

			const inserted = await database.prepare(`
				INSERT INTO odds_formats (source_id, name, sort_order)
				VALUES (?, ?, ?)
			`).bind(sourceId, name, index).run();

			formatIds[index] = Number(inserted.meta.last_row_id);
		}

		let importedRows = 0;

		for (let index = 0; index < payload.rows.length; index++) {
			const row = payload.rows[index];
			const name = String(row?.name || '').trim();
			if (!name) continue;

			const normalized = normalize(name);
			const checklistId = guessChecklistId(name, checklists);

			const entryInsert = await database.prepare(`
				INSERT INTO odds_entries (
					source_id,
					checklist_id,
					name,
					normalized_name,
					sort_order
				)
				VALUES (?, ?, ?, ?, ?)
			`).bind(sourceId, checklistId, name, normalized, index).run();

			const entryId = Number(entryInsert.meta.last_row_id);

			for (let valueIndex = 0; valueIndex < payload.formats.length; valueIndex++) {
				const text = String(row?.values?.[valueIndex] ?? '').trim();
				const formatId = formatIds[valueIndex];

				if (!formatId || !text) continue;

				const denominator = parseDenominator(text);

				await database.prepare(`
					INSERT INTO odds_values (
						entry_id,
						format_id,
						odds_text,
						denominator
					)
					VALUES (?, ?, ?, ?)
				`).bind(entryId, formatId, text, denominator).run();
			}

			importedRows += 1;
		}

		if (!importedRows) {
			await database.prepare('DELETE FROM odds_sources WHERE id = ?').bind(sourceId).run();
			return fail(400, { message: 'Nothing was imported.' });
		}

		throw redirect(303, `/admin/odds?product=${productId}&imported=${importedRows}`);
	},

	deleteOdds: async ({ platform, request }) => {
		const database = db(platform);
		const form = await request.formData();
		const sourceId = Number(form.get('source_id'));
		const productId = Number(form.get('product_id'));

		if (!Number.isInteger(sourceId) || sourceId <= 0) {
			return fail(400, { message: 'Invalid odds source.' });
		}

		await database.prepare('DELETE FROM odds_sources WHERE id = ?').bind(sourceId).run();

		throw redirect(303, `/admin/odds?product=${productId}`);
	}
};

function normalize(value) {
	return String(value || '')
		.toLowerCase()
		.replace(/&/g, ' and ')
		.replace(/[^a-z0-9]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function guessChecklistId(entryName, checklists) {
	const entry = normalize(entryName);

	let best = null;

	for (const checklist of checklists) {
		const candidate = normalize(checklist.name);
		if (!candidate) continue;

		let score = 0;

		if (entry === candidate) score = 10000 + candidate.length;
		else if (entry.startsWith(candidate + ' ')) score = 5000 + candidate.length;
		else if (entry.includes(candidate)) score = 2000 + candidate.length;

		if (!best || score > best.score) {
			if (score > 0) best = { id: checklist.id, score };
		}
	}

	return best?.id || null;
}

function parseDenominator(value) {
	const text = String(value || '').trim();

	if (text === '-' || !text) return null;

	const match = text.match(/(?:\d+:)?([\d,]+)$/);
	if (!match) return null;

	const number = Number(match[1].replace(/,/g, ''));
	return Number.isFinite(number) ? number : null;
}
