import fs from 'node:fs';

function mustReplace(source, search, replacement, label) {
	if (!source.includes(search)) {
		throw new Error(`${label}: expected code was not found.`);
	}
	return source.replace(search, replacement);
}

function patchPdf() {
	const path = 'src/lib/client/pdf.js';
	let source = fs.readFileSync(path, 'utf8');

	if (source.includes('export async function extractTimHortonsChecklist')) {
		console.log('Tim Hortons PDF parser already installed.');
		return;
	}

	const addition = `

const TIM_HORTONS_TOKEN = /^(?:\\d{1,3}|(?:FL|AA|PP|NG|AI|SK|PO|SC)-\\d{1,3})$/i;

const TIM_HORTONS_SECTIONS = {
	FL: 'First Liners',
	AA: 'Attack Angle',
	PP: 'Platinum Profiles',
	NG: 'Next Gen Phenoms',
	AI: 'Above the Ice',
	SK: 'Sidekicks',
	PO: 'Powerhouse Pillars',
	SC: "Sensational Celly's"
};

function timSection(cardNumber) {
	const value = String(cardNumber || '').trim().toUpperCase();

	if (/^\\d{1,3}$/.test(value)) return 'Base Set';

	const prefix = value.split('-')[0];
	return TIM_HORTONS_SECTIONS[prefix] || 'Inserts';
}

function timHeading(value) {
	const text = String(value || '').replace(/\\s+/g, ' ').trim();

	if (!text) return true;
	if (text.includes('/')) return true;

	return /^(?:collector'?s series checklist|liste des cartes|first liners|premier trio|attack angle|angle d.?attaque|platinum profiles|profil platine|next gen phenoms|phénomènes|sensational celly|célébrations|above the ice|au-dessus de la glace|sidekicks|acolytes|powerhouse pillars|piliers de puissance)$/i.test(text);
}

function timCleanSubject(value) {
	return String(value || '')
		.replace(/\\s+/g, ' ')
		.replace(/\\s+(?:FIRST LINERS|PREMIER TRIO|ATTACK ANGLE|ANGLE D.?ATTAQUE|PLATINUM PROFILES|PROFIL PLATINE|NEXT GEN PHENOMS|PHÉNOMÈNES DE PROCHAINE GÉNÉRATION|SENSATIONAL CELLY.?S|CÉLÉBRATIONS SENSATIONNELLES|ABOVE THE ICE|AU-DESSUS DE LA GLACE|SIDEKICKS|ACOLYTES|POWERHOUSE PILLARS|PILIERS DE PUISSANCE)\\s*\\/?\\s*$/i, '')
		.trim();
}

function clusterTokenAnchors(items) {
	const points = items
		.filter((item) => TIM_HORTONS_TOKEN.test(item.text))
		.map((item) => item.x)
		.sort((a, b) => a - b);

	const clusters = [];

	for (const x of points) {
		let cluster = clusters.find((candidate) => Math.abs(candidate.mean - x) <= 12);

		if (!cluster) {
			cluster = { mean: x, values: [] };
			clusters.push(cluster);
		}

		cluster.values.push(x);
		cluster.mean =
			cluster.values.reduce((sum, value) => sum + value, 0) /
			cluster.values.length;
	}

	return clusters
		.filter((cluster) => cluster.values.length >= 3)
		.map((cluster) => cluster.mean)
		.sort((a, b) => a - b);
}

function timColumnBounds(anchors, index) {
	const center = anchors[index];
	const left =
		index === 0
			? -Infinity
			: (anchors[index - 1] + center) / 2;

	const right =
		index === anchors.length - 1
			? Infinity
			: (center + anchors[index + 1]) / 2;

	return { left, right };
}

function timParsedResult(cards) {
	const dedupe = new Map();

	for (const card of cards) {
		const key = \`\${card.checklist_name}|${'${'}card.card_number}\`.toLowerCase();

		if (!dedupe.has(key)) {
			dedupe.set(key, card);
			continue;
		}

		const existing = dedupe.get(key);

		// A few Tim Hortons cards are intentionally multi-subject. If a wrapped
		// second name was recovered later, keep the richer subject text.
		if (card.subject.length > existing.subject.length) {
			dedupe.set(key, card);
		}
	}

	const finalCards = [...dedupe.values()];
	const sections = [...new Set(finalCards.map((card) => card.checklist_name))];
	const checklist_meta = {};

	for (const section of sections) {
		checklist_meta[section] = {
			card_count_declared: finalCards.filter(
				(card) => card.checklist_name === section
			).length,
			parallels: [],
			notes: []
		};
	}

	return {
		sections,
		cards: finalCards,
		checklist_meta,
		metaSections: sections.length,
		high: finalCards.length,
		review: 0,
		lines: finalCards.length,
		sourceKind: 'upper-deck-tim-hortons-pdf',
		safety: {
			blocked: false,
			reasons: []
		}
	};
}

export async function extractTimHortonsChecklist(file) {
	if (!browser) {
		throw new Error('PDF parsing is only available in the browser.');
	}

	const pdfjs = await import('pdfjs-dist');
	const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
	pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

	const data = new Uint8Array(await file.arrayBuffer());
	const pdf = await pdfjs.getDocument({ data }).promise;
	const cards = [];

	for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
		const page = await pdf.getPage(pageNumber);
		const content = await page.getTextContent();

		const items = content.items
			.filter((item) => 'str' in item && String(item.str || '').trim())
			.map((item) => {
				const x = Number(item.transform?.[4] || 0);
				const y = Math.round(Number(item.transform?.[5] || 0));
				const width = Number(item.width || 0);

				return {
					x,
					y,
					width,
					centerX: x + width / 2,
					text: String(item.str).replace(/\\s+/g, ' ').trim()
				};
			});

		const anchors = clusterTokenAnchors(items);

		if (anchors.length < 3) {
			throw new Error(
				'Tim Hortons multi-column layout was detected, but card columns could not be resolved.'
			);
		}

		const rows = new Map();

		for (const item of items) {
			let row = [...rows.values()].find(
				(candidate) => Math.abs(candidate.y - item.y) <= 2
			);

			if (!row) {
				row = { y: item.y, items: [] };
				rows.set(rows.size, row);
			}

			row.items.push(item);
		}

		const orderedRows = [...rows.values()].sort((a, b) => b.y - a.y);
		const lastCardByColumn = new Map();

		for (const row of orderedRows) {
			for (let column = 0; column < anchors.length; column++) {
				const bounds = timColumnBounds(anchors, column);

				const region = row.items
					.filter(
						(item) =>
							item.centerX >= bounds.left &&
							item.centerX < bounds.right
					)
					.sort((a, b) => a.x - b.x);

				if (!region.length) continue;

				const tokenIndex = region.findIndex((item) =>
					TIM_HORTONS_TOKEN.test(item.text)
				);

				if (tokenIndex >= 0) {
					const cardNumber = region[tokenIndex].text.trim();

					let subject = timCleanSubject(
						region
							.slice(tokenIndex + 1)
							.map((item) => item.text)
							.join(' ')
					);

					if (!subject || timHeading(subject)) continue;

					const card = {
						card_number: cardNumber,
						subject,
						affiliation: 'NIL',
						affiliation_id: null,
						affiliation_status: 'source-nil',
						rookie: false,
						autograph: false,
						memorabilia: false,
						serial_number: null,
						checklist_name: timSection(cardNumber),
						confidence: 0.99,
						raw: \`\${cardNumber} ${'${'}subject}\`
					};

					cards.push(card);
					lastCardByColumn.set(column, card);
					continue;
				}

				const continuation = timCleanSubject(
					region.map((item) => item.text).join(' ')
				);

				if (
					!continuation ||
					timHeading(continuation) ||
					continuation.length > 60 ||
					/\\d/.test(continuation)
				) {
					continue;
				}

				const previous = lastCardByColumn.get(column);

				// Sidekicks are dual-player cards in this checklist. Their second
				// player is printed on the following visual line without repeating
				// the SK card number.
				if (
					previous &&
					previous.checklist_name === 'Sidekicks' &&
					!previous.subject.includes(' / ')
				) {
					previous.subject = \`\${previous.subject} / ${'${'}continuation}\`;
					previous.raw = \`\${previous.card_number} ${'${'}previous.subject}\`;
				}
			}
		}
	}

	if (!cards.length) {
		throw new Error('Tim Hortons PDF was recognized, but no checklist cards were parsed.');
	}

	const result = timParsedResult(cards);

	// This specific collector checklist contains a 120-card base set plus
	// multiple coded insert families. Do not silently accept the old 59-card
	// flattened parse again.
	if (result.cards.length < 180 || result.sections.length < 6) {
		result.safety = {
			blocked: true,
			reasons: [
				\`Tim Hortons parser found only ${'${'}result.cards.length} cards across ${'${'}result.sections.length} sections; expected a multi-column master checklist.\`
			]
		};
	}

	return result;
}
`;

	source += addition;
	fs.writeFileSync(path, source);
	console.log('Tim Hortons PDF parser installed.');
}

function patchHarvester() {
	const path = 'src/routes/admin/source-harvester/+page.svelte';
	let source = fs.readFileSync(path, 'utf8');

	source = source.replace(
		`import { extractPdfText } from '$lib/client/pdf.js';`,
		`import { extractPdfText, extractTimHortonsChecklist } from '$lib/client/pdf.js';`
	);

	if (!source.includes('function applyProductContextAffiliation(')) {
		const anchor = `\tfunction rowReadyState(row) {`;

		const helper = `\tfunction productContextAffiliation(row) {
\t\tconst name = String(row?.name || '').toLowerCase();
\t\tconst manufacturer = String(row?.manufacturer || '').toLowerCase();
\t\tconst sport = String(row?.sport || '').toLowerCase();

\t\tif (manufacturer !== 'upper deck' || sport !== 'hockey') return '';

\t\tif (/\\\\bteam canada juniors?\\\\b/.test(name)) return 'Canada';
\t\tif (/\\\\bteam canada\\\\b/.test(name)) return 'Canada';
\t\tif (/\\\\bteam usa juniors?\\\\b/.test(name)) return 'United States';

\t\treturn '';
\t}

\tfunction applyProductContextAffiliation(row, parsed) {
\t\tconst affiliation = productContextAffiliation(row);
\t\tif (!affiliation || !parsed?.cards?.length) return parsed;

\t\tlet changed = 0;

\t\tconst cards = parsed.cards.map((card) => {
\t\t\tconst unresolved =
\t\t\t\tcard.affiliation === 'UNRESOLVED' ||
\t\t\t\tcard.affiliation_status === 'unresolved';

\t\t\tif (!unresolved) return card;

\t\t\tchanged += 1;

\t\t\treturn {
\t\t\t\t...card,
\t\t\t\taffiliation,
\t\t\t\taffiliation_id: null,
\t\t\t\taffiliation_status: 'product-context',
\t\t\t\tconfidence: Math.max(Number(card.confidence || 0), 0.98)
\t\t\t};
\t\t});

\t\tif (!changed) return parsed;

\t\treturn {
\t\t\t...parsed,
\t\t\tcards,
\t\t\thigh: cards.filter((card) => Number(card.confidence || 0) >= 0.85).length,
\t\t\treview: cards.filter((card) => Number(card.confidence || 0) < 0.85).length,
\t\t\tproductContextAffiliation: affiliation,
\t\t\tproductContextResolved: changed
\t\t};
\t}

`;

		source = mustReplace(source, anchor, helper + anchor, 'product context helper insertion');
	}

	const oldPdf = `\t\t\tif (ext === 'pdf') {
\t\t\t\tconst text = await extractPdfText(file);
\t\t\t\tparsed = parseChecklistText(text, data.affiliations);
\t\t\t} else if (ext === 'xls' || ext === 'xlsx') {
\t\t\t\tparsed = await extractSpreadsheetChecklist(file);
\t\t\t} else {`;

	const newPdf = `\t\t\tif (ext === 'pdf') {
\t\t\t\tconst isTimHortons =
\t\t\t\t\tString(row.manufacturer || '').toLowerCase() === 'upper deck' &&
\t\t\t\t\t/\\\\btim hortons\\\\b/i.test(String(row.name || ''));

\t\t\t\tif (isTimHortons) {
\t\t\t\t\tparsed = await extractTimHortonsChecklist(file);
\t\t\t\t} else {
\t\t\t\t\tconst text = await extractPdfText(file);
\t\t\t\t\tparsed = parseChecklistText(text, data.affiliations);
\t\t\t\t}
\t\t\t} else if (ext === 'xls' || ext === 'xlsx') {
\t\t\t\tparsed = await extractSpreadsheetChecklist(file);
\t\t\t} else {`;

	if (!source.includes('parsed = await extractTimHortonsChecklist(file);')) {
		source = mustReplace(source, oldPdf, newPdf, 'Tim Hortons prepare branch');
	}

	const auditAnchor = `\t\t\tconst audit = validateChecklistImport(parsed.cards, parsed.checklist_meta, parsed.sections);`;

	if (!source.includes('parsed = applyProductContextAffiliation(row, parsed);')) {
		source = mustReplace(
			source,
			auditAnchor,
			`\t\t\tparsed = applyProductContextAffiliation(row, parsed);\n\n${auditAnchor}`,
			'product context application'
		);
	}

	fs.writeFileSync(path, source);
	console.log('Source Harvester patched.');
}

patchPdf();
patchHarvester();

console.log('Upper Deck context + Tim Hortons fix applied.');
