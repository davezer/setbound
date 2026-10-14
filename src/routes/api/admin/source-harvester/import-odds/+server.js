import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

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

function validateFormats(formats) {
	const issues = [];
	const seen = new Set();

	for (let index = 0; index < formats.length; index++) {
		const name = String(formats[index]?.name || '').trim();
		const lower = name.toLowerCase();

		if (!name || /^format \d+$/i.test(name)) {
			issues.push(`Column ${index + 1} needs a verified format name.`);
			continue;
		}

		if (/^\d{3,}\b/.test(name) || /MLB-|NFL-|NBA-|NHL-/i.test(name)) {
			issues.push(`"${name}" still looks like a SKU/product code.`);
		}

		if (/^cards?\b/i.test(name)) {
			issues.push(`"${name}" incorrectly includes the Card column heading.`);
		}

		if (seen.has(lower)) issues.push(`Duplicate format name: "${name}".`);
		if (lower) seen.add(lower);
	}

	return [...new Set(issues)];
}

export async function POST({ platform, request }) {
	try {
		const database = db(platform);
		const body = await request.json();

		const productSlug = String(body.productSlug || '').trim();
		const filename = String(body.filename || '').trim();
		const sourceUrl = String(body.sourceUrl || '').trim() || null;
		const disclaimer = String(body.disclaimer || '').trim() || null;
		const formats = Array.isArray(body.formats) ? body.formats : [];
		const rows = Array.isArray(body.rows) ? body.rows : [];

		if (!productSlug) {
			return json({ message: 'Missing product slug.' }, { status: 400 });
		}

		if (!formats.length) {
			return json({ message: 'No odds formats were supplied.' }, { status: 400 });
		}

		if (!rows.length) {
			return json({ message: 'No odds rows were supplied.' }, { status: 400 });
		}

		const formatProblems = validateFormats(formats);

		if (formatProblems.length) {
			return json({
				message: `Odds format verification failed: ${formatProblems.join(' ')}`
			}, { status: 400 });
		}

		const product = await database.prepare(
			'SELECT id, name FROM products WHERE slug = ?'
		).bind(productSlug).first();

		if (!product) {
			return json({ message: 'Imported product could not be found for odds import.' }, { status: 404 });
		}

		// Harvester imports are authoritative for this specific source attempt.
		// If odds already exist for the product, replace them so a retry cannot duplicate rows.
		await database.prepare(
			'DELETE FROM odds_sources WHERE product_id = ?'
		).bind(product.id).run();

		const checklistResult = await database.prepare(`
			SELECT id, name
			FROM checklists
			WHERE product_id = ?
			ORDER BY LENGTH(name) DESC, sort_order
		`).bind(product.id).all();

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
		`).bind(product.id, filename || null, sourceUrl, disclaimer).run();

		const sourceId = Number(sourceInsert.meta.last_row_id);
		const formatIds = [];

		for (let index = 0; index < formats.length; index++) {
			const name = String(formats[index]?.name || '').trim();
			if (!name) continue;

			const inserted = await database.prepare(`
				INSERT INTO odds_formats (source_id, name, sort_order)
				VALUES (?, ?, ?)
			`).bind(sourceId, name, index).run();

			formatIds[index] = Number(inserted.meta.last_row_id);
		}

		let importedRows = 0;

		for (let index = 0; index < rows.length; index++) {
			const row = rows[index];
			const name = String(row?.name || '').trim();
			if (!name) continue;

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
			`).bind(
				sourceId,
				checklistId,
				name,
				normalize(name),
				index
			).run();

			const entryId = Number(entryInsert.meta.last_row_id);

			for (let valueIndex = 0; valueIndex < formats.length; valueIndex++) {
				const value = String(row?.values?.[valueIndex] ?? '').trim();
				const formatId = formatIds[valueIndex];

				if (!formatId || !value) continue;

				await database.prepare(`
					INSERT INTO odds_values (
						entry_id,
						format_id,
						odds_text,
						denominator
					)
					VALUES (?, ?, ?, ?)
				`).bind(
					entryId,
					formatId,
					value,
					parseDenominator(value)
				).run();
			}

			importedRows += 1;
		}

		if (!importedRows) {
			await database.prepare('DELETE FROM odds_sources WHERE id = ?')
				.bind(sourceId)
				.run();

			return json({ message: 'No odds rows were imported.' }, { status: 400 });
		}

		return json({
			ok: true,
			productId: product.id,
			importedRows,
			formatCount: formatIds.filter(Boolean).length
		});
	} catch (error) {
		return json({ message: error?.message || 'Odds import failed.' }, { status: 500 });
	}
}
