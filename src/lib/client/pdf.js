import { browser } from '$app/environment';

const CARD_TOKEN = /^[A-Z0-9][A-Z0-9._\-/]{0,24}$/i;

export async function extractPdfText(file) {
	if (!browser) throw new Error('PDF parsing is only available in the browser.');

	const pdfjs = await import('pdfjs-dist');
	const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
	pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

	const data = new Uint8Array(await file.arrayBuffer());
	const pdf = await pdfjs.getDocument({ data }).promise;
	const pages = [];

	for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
		const page = await pdf.getPage(pageNumber);
		const content = await page.getTextContent();
		const rows = groupRows(content.items);
		const anchors = inferColumnAnchors(rows);

		const lines = [...rows.values()]
			.sort((a, b) => b.y - a.y)
			.map((row) => buildLine(row.items, anchors))
			.filter(Boolean);

		pages.push(lines.join('\n'));
	}

	return pages.join('\n');
}

function groupRows(items) {
	const rows = new Map();

	for (const item of items) {
		if (!('str' in item) || !String(item.str || '').trim()) continue;

		const x = Number(item.transform?.[4] || 0);
		const y = Math.round(Number(item.transform?.[5] || 0));
		const width = Number(item.width || 0);

		if (!rows.has(y)) rows.set(y, { y, items: [] });

		rows.get(y).items.push({
			x,
			width,
			right: x + width,
			text: String(item.str).trim()
		});
	}

	for (const row of rows.values()) row.items.sort((a, b) => a.x - b.x);

	return rows;
}

function looksLikeCardToken(value) {
	const text = String(value || '').trim();
	return CARD_TOKEN.test(text) && (/\d/.test(text) || text.includes('-'));
}

function inferColumnAnchors(rows) {
	const cardRows = [...rows.values()].filter((row) => {
		if (row.items.length < 2) return false;
		return looksLikeCardToken(row.items[0].text);
	});

	if (cardRows.length < 3) return [];

	const points = [];

	for (const row of cardRows) {
		// Ignore the card-number token itself. We only want the repeated starts of
		// subject / affiliation / flag columns.
		for (const item of row.items.slice(1)) points.push(item.x);
	}

	const clusters = [];

	for (const x of points.sort((a, b) => a - b)) {
		let cluster = clusters.find((candidate) => Math.abs(candidate.mean - x) <= 3);

		if (!cluster) {
			cluster = { mean: x, values: [] };
			clusters.push(cluster);
		}

		cluster.values.push(x);
		cluster.mean = cluster.values.reduce((sum, value) => sum + value, 0) / cluster.values.length;
	}

	const minimumSupport = Math.max(3, Math.ceil(cardRows.length * 0.5));

	// A real table column start repeats on at least half of the card rows.
	// In Topps PDFs this cleanly finds values like ~134px (subject) and
	// ~296px (affiliation) regardless of how long the subject name is.
	return clusters
		.filter((cluster) => cluster.values.length >= minimumSupport)
		.map((cluster) => cluster.mean)
		.sort((a, b) => a - b);
}

function isAtAnchor(x, anchors) {
	return anchors.some((anchor) => Math.abs(anchor - x) <= 5);
}

function buildLine(items, anchors) {
	if (!items.length) return '';

	let line = '';

	for (let index = 0; index < items.length; index++) {
		const item = items[index];
		const text = String(item.text || '').trim();
		if (!text) continue;

		if (!line) {
			line = text;
			continue;
		}

		const previous = items[index - 1];
		const gap = item.x - previous.right;

		// Prefer inferred table anchors. This fixes long names whose final letter
		// nearly touches the affiliation column, where a simple gap threshold fails.
		const newColumn =
			isAtAnchor(item.x, anchors) ||
			(!anchors.length && gap >= 18);

		line += newColumn ? `\t${text}` : ` ${text}`;
	}

	return line
		.replace(/ +/g, ' ')
		.replace(/ *\t */g, '\t')
		.trim();
}
