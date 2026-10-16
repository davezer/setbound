import { browser } from '$app/environment';

const CARD_TOKEN = /^[A-Z0-9][A-Z0-9._\/-]{0,24}$/i;
const SOURCE_NIL = '__SOURCE_NIL__';

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
			.sort((a,b)=>b.y-a.y)
			.map((row)=>buildLine(row.items,anchors))
			.filter(Boolean);
		pages.push(lines.join('\n'));
	}
	return pages.join('\n');
}

function groupRows(items) {
	const rows=new Map();
	for (const item of items) {
		if (!('str' in item)||!String(item.str||'').trim()) continue;
		const x=Number(item.transform?.[4]||0);
		const y=Math.round(Number(item.transform?.[5]||0));
		const width=Number(item.width||0);
		if (!rows.has(y)) rows.set(y,{y,items:[]});
		rows.get(y).items.push({x,width,right:x+width,text:String(item.str).trim()});
	}
	for (const row of rows.values()) row.items.sort((a,b)=>a.x-b.x);
	return rows;
}

function looksLikeCardToken(value) {
	const text=String(value||'').trim();
	return CARD_TOKEN.test(text)&&(/\\d/.test(text)||text.includes('-'));
}

function inferColumnAnchors(rows) {
	const cardRows=[...rows.values()].filter((row)=>row.items.length>=2&&looksLikeCardToken(row.items[0].text));
	if (cardRows.length<3) return [];
	const points=[];
	for (const row of cardRows) for (const item of row.items.slice(1)) points.push(item.x);
	const clusters=[];
	for (const x of points.sort((a,b)=>a-b)) {
		let cluster=clusters.find((candidate)=>Math.abs(candidate.mean-x)<=3);
		if (!cluster) { cluster={mean:x,values:[]}; clusters.push(cluster); }
		cluster.values.push(x);
		cluster.mean=cluster.values.reduce((sum,value)=>sum+value,0)/cluster.values.length;
	}
	const minimumSupport=Math.max(3,Math.ceil(cardRows.length*0.5));
	return clusters.filter((c)=>c.values.length>=minimumSupport).map((c)=>c.mean).sort((a,b)=>a-b);
}

function isAtAnchor(x,anchors){ return anchors.some((anchor)=>Math.abs(anchor-x)<=5); }

function buildLine(items,anchors){
	if(!items.length) return '';
	let line='';
	for(let index=0;index<items.length;index++){
		const item=items[index];
		const text=String(item.text||'').trim();
		if(!text) continue;
		if(!line){ line=text; continue; }
		const previous=items[index-1];
		const gap=item.x-previous.right;
		const newColumn=isAtAnchor(item.x,anchors)||(!anchors.length&&gap>=18);
		line+=newColumn?`\t${text}`:` ${text}`;
	}
	line=line.replace(/ +/g,' ').replace(/ *\t */g,'\t').trim();

	// If the page clearly has subject + affiliation columns, but this card row
	// only contains card number + subject, preserve that blank source column.
	if(looksLikeCardToken(items[0]?.text)&&anchors.length>=2){
		const tabCount=(line.match(/\t/g)||[]).length;
		if(tabCount===1) line+=`\t${SOURCE_NIL}`;
	}
	return line;
}


const TIM_HORTONS_TOKEN = /^(?:\d{1,3}|(?:FL|AA|PP|NG|AI|SK|PO|SC)-\d{1,3})$/i;

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

	if (/^\d{1,3}$/.test(value)) return 'Base Set';

	const prefix = value.split('-')[0];
	return TIM_HORTONS_SECTIONS[prefix] || 'Inserts';
}

function timHeading(value) {
	const text = String(value || '').replace(/\s+/g, ' ').trim();

	if (!text) return true;
	if (text.includes('/')) return true;

	return /^(?:collector'?s series checklist|liste des cartes|first liners|premier trio|attack angle|angle d.?attaque|platinum profiles|profil platine|next gen phenoms|phénomènes|sensational celly|célébrations|above the ice|au-dessus de la glace|sidekicks|acolytes|powerhouse pillars|piliers de puissance)$/i.test(text);
}

function timCleanSubject(value) {
	return String(value || '')
		.replace(/\s+/g, ' ')
		.replace(/\s+(?:FIRST LINERS|PREMIER TRIO|ATTACK ANGLE|ANGLE D.?ATTAQUE|PLATINUM PROFILES|PROFIL PLATINE|NEXT GEN PHENOMS|PHÉNOMÈNES DE PROCHAINE GÉNÉRATION|SENSATIONAL CELLY.?S|CÉLÉBRATIONS SENSATIONNELLES|ABOVE THE ICE|AU-DESSUS DE LA GLACE|SIDEKICKS|ACOLYTES|POWERHOUSE PILLARS|PILIERS DE PUISSANCE)\s*\/?\s*$/i, '')
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
		const key = `${card.checklist_name}|${card.card_number}`.toLowerCase();

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
					text: String(item.str).replace(/\s+/g, ' ').trim()
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
						raw: `${cardNumber} ${subject}`
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
					/\d/.test(continuation)
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
					previous.subject = `${previous.subject} / ${continuation}`;
					previous.raw = `${previous.card_number} ${previous.subject}`;
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
				`Tim Hortons parser found only ${result.cards.length} cards across ${result.sections.length} sections; expected a multi-column master checklist.`
			]
		};
	}

	return result;
}
