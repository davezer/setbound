import { browser } from '$app/environment';
import { parseToppsEntertainmentPdfText } from './topps-entertainment-pdf.js';

function text(value) {
	return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function key(value) {
	return text(value).toLowerCase();
}

function card({
	number = 'UNNUMBERED',
	subject,
	affiliation = 'NIL',
	checklist = 'Checklist',
	rookie = false,
	autograph = false,
	memorabilia = false,
	variation = null,
	raw = ''
}) {
	return {
		card_number: String(number),
		subject: text(subject),
		affiliation: text(affiliation) || 'NIL',
		affiliation_id: null,
		affiliation_status:
			affiliation && affiliation !== 'NIL' ? 'source' : 'source-nil',
		rookie,
		autograph,
		memorabilia,
		serial_number: null,
		variation,
		checklist_name: checklist,
		confidence: 0.99,
		raw
	};
}

function finish(cards, sourceKind) {
	const sections = [...new Set(cards.map((c) => c.checklist_name).filter(Boolean))];
	const checklist_meta = Object.fromEntries(
		sections.map((section) => [
			section,
			{
				card_count_declared: cards.filter((card) => card.checklist_name === section).length,
				parallels: [],
				notes: []
			}
		])
	);

	return {
		cards,
		sections,
		checklist_meta,
		metaSections: sections.length,
		high: cards.length,
		review: 0,
		lines: cards.length,
		sourceKind
	};
}

async function pdfPages(file) {
	if (!browser) throw new Error('PDF parsing is only available in the browser.');

	const pdfjs = await import('pdfjs-dist');
	const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
	pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

	const bytes = new Uint8Array(await file.arrayBuffer());
	const pdf = await pdfjs.getDocument({ data: bytes }).promise;
	const pages = [];

	for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
		const page = await pdf.getPage(pageNumber);
		const viewport = page.getViewport({ scale: 1 });
		const content = await page.getTextContent();

		const items = content.items
			.filter((item) => 'str' in item && text(item.str))
			.map((item) => ({
				text: text(item.str),
				x: Number(item.transform?.[4] || 0),
				y: Number(item.transform?.[5] || 0),
				width: Number(item.width || 0),
				right: Number(item.transform?.[4] || 0) + Number(item.width || 0)
			}));

		pages.push({
			pageNumber,
			width: viewport.width,
			height: viewport.height,
			items
		});
	}

	return pages;
}

function groupRows(items, tolerance = 2.5) {
	const rows = [];

	for (const item of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
		let row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= tolerance);

		if (!row) {
			row = { y: item.y, items: [] };
			rows.push(row);
		}

		row.items.push(item);
	}

	return rows
		.map((row) => ({
			...row,
			items: row.items.sort((a, b) => a.x - b.x),
			text: row.items.map((item) => item.text).join(' ')
		}))
		.sort((a, b) => b.y - a.y);
}

function columnStartsFromSoccerHeader(row) {
	const words = row.items.map((item) => ({
		...item,
		k: key(item.text)
	}));

	const findX = (matches) => {
		const item = words.find((candidate) => matches.includes(candidate.k));
		return item?.x ?? null;
	};

	const cardX = findX(['card', 'card number']);
	const nameX = findX(['name']);
	const teamX = findX(['team']);
	const subsetX = findX(['subset']);
	const rookieX = findX(['rookie']);

	if (cardX == null || nameX == null || teamX == null || subsetX == null) {
		return null;
	}

	return [cardX, nameX, teamX, subsetX, rookieX ?? Number.POSITIVE_INFINITY];
}

function cellsForStarts(row, starts) {
	const finite = starts.filter(Number.isFinite);
	const cells = finite.map(() => []);

	for (const item of row.items) {
		let index = 0;

		for (let i = 0; i < finite.length; i++) {
			if (item.x >= finite[i]) index = i;
		}

		cells[index].push(item.text);
	}

	return cells.map((parts) => text(parts.join(' ')));
}

async function parseSoccerTablePdf(file) {
	const pages = await pdfPages(file);
	const cards = [];
	let majorSection = 'Checklist';

	for (const page of pages) {
		const rows = groupRows(page.items);
		let starts = null;

		for (const row of rows) {
			const upper = text(row.text).toUpperCase();

			if (
				/^(BASE CARDS|INSERT CARDS|AUTOGRAPH CARDS|AUTOGRAPHS|AUTOGRAPH RELICS|RELICS)$/.test(
					upper
				)
			) {
				majorSection = text(row.text);
				starts = null;
				continue;
			}

			const headerStarts = columnStartsFromSoccerHeader(row);

			if (headerStarts) {
				starts = headerStarts;
				continue;
			}

			if (!starts) continue;

			const cells = cellsForStarts(row, starts);
			const number = text(cells[0]);
			const subject = text(cells[1]);
			const affiliation = text(cells[2]);
			const subset = text(cells[3]);
			const rookieCell = text(cells[4]);

			if (!/^[A-Z0-9][A-Z0-9._/-]{0,20}$/i.test(number)) continue;
			if (!subject || !affiliation || !subset) continue;
			if (/^(card|card number|name|team|subset)$/i.test(subject)) continue;

			cards.push(
				card({
					number,
					subject,
					affiliation,
					checklist: subset || majorSection,
					rookie: /\brookie\b|\brc\b/i.test(rookieCell),
					autograph: /\bauto|autograph\b/i.test(`${majorSection} ${subset}`),
					memorabilia: /\brelic|memorabilia|patch|material\b/i.test(
						`${majorSection} ${subset}`
					),
					raw: row.text
				})
			);
		}
	}

	if (!cards.length) {
		throw new Error(
			'Recognized Topps soccer table PDF, but no rows were parsed from its visual columns.'
		);
	}

	return finish(cards, 'topps-soccer-table-pdf');
}

function isHeadingLine(value) {
	const v = text(value);
	if (!v || v.length > 90) return false;
	if (/^checklists provided by topps/i.test(v)) return false;
	if (/^subject to change$/i.test(v)) return false;
	if (/^\d/.test(v)) return false;
	if (/^[A-Z0-9]{1,8}-[A-Z0-9-]+/.test(v)) return false;

	const letters = v.replace(/[^A-Za-z]/g, '');
	if (!letters) return false;

	const uppers = [...letters].filter((char) => char === char.toUpperCase()).length;
	return uppers / letters.length >= 0.92;
}

function parseNumberedListPdf(source) {
	const lines = String(source || '')
		.split(/\n+/)
		.map((line) => text(line.replace(/\t/g, ' ')))
		.filter(Boolean);

	const rawCards = [];
	let section = 'Checklist';

	for (const line of lines) {
		if (isHeadingLine(line)) {
			if (!/^(BASE|INSERT)$/i.test(line)) section = line;
			continue;
		}

		const match = line.match(/^([A-Z0-9]{1,8}(?:-[A-Z0-9]{1,12})+|\d{1,4})\s+(.+)$/i);
		if (!match) continue;

		const number = match[1];
		const subject = text(match[2]).replace(/\s*\(DEBUT\)\s*$/i, '').trim();

		if (!subject) continue;

		rawCards.push({
			number,
			subject,
			section,
			raw: line
		});
	}

	const grouped = new Map();

	for (const row of rawCards) {
		const id = `${key(row.section)}|${key(row.number)}`;

		if (!grouped.has(id)) {
			grouped.set(id, {
				...row,
				subjects: [row.subject]
			});
		} else {
			const current = grouped.get(id);
			if (!current.subjects.some((subject) => key(subject) === key(row.subject))) {
				current.subjects.push(row.subject);
			}
		}
	}

	const cards = [...grouped.values()].map((row) =>
		card({
			number: row.number,
			subject: row.subjects.join(' / '),
			checklist: row.section,
			autograph: /\bautograph\b/i.test(row.section),
			raw: row.raw
		})
	);

	if (!cards.length) {
		throw new Error(
			'Recognized Topps numbered-list PDF, but no numbered checklist rows were parsed.'
		);
	}

	return finish(cards, 'topps-numbered-list-pdf');
}

export async function parseToppsModernChecklistPdf(file) {
	const pages = await pdfPages(file);
	const cards = [];
	let majorSection = 'Checklist';
	let checklist = 'Checklist';

	const majorHeadings = new Map([
		['BASE', 'Base'],
		['INSERT', 'Insert'],
		['AUTOGRAPH', 'Autograph'],
		['AUTOGRAPHS', 'Autograph'],
		['AUTOGRAPH RELIC', 'Autograph Relic'],
		['AUTOGRAPH RELICS', 'Autograph Relic'],
		['RELIC', 'Relic'],
		['RELICS', 'Relic'],
		['MEMORABILIA', 'Memorabilia']
	]);

	function cleanAffiliation(value) {
		return text(value)
			.replace(/[®™©]/g, '')
			.replace(/\s+/g, ' ')
			.trim();
	}

	function isBoilerplate(value) {
		return /^(?:checklists provided by topps|at the time of production|time of production|but actual contents|actual contents|subject to change)/i.test(
			text(value)
		);
	}

	function heading(value) {
		const v = text(value);
		if (!v || v.length > 100 || isBoilerplate(v)) return false;
		if (/^[A-Z0-9]{1,12}(?:-[A-Z0-9]{1,16})+\s+/i.test(v)) return false;
		if (/^\d{1,4}\s+/.test(v)) return false;

		const letters = v.replace(/[^A-Za-z]/g, '');
		if (!letters) return false;
		const uppercase = [...letters].filter((char) => char === char.toUpperCase()).length;
		return uppercase / letters.length >= 0.92;
	}

	function cardNumber(value) {
		const v = text(value);
		return /^(?:\d{1,4}[A-Z]?|[A-Z0-9]{1,12}(?:-[A-Z0-9]{1,16})+)$/i.test(v) ? v : null;
	}

	for (const page of pages) {
		const rows = groupRows(page.items, 3);

		for (const row of rows) {
			const rowText = text(row.text);
			if (!rowText || isBoilerplate(rowText)) continue;

			const upper = rowText.toUpperCase().replace(/\s+/g, ' ').trim();
			if (majorHeadings.has(upper)) {
				majorSection = majorHeadings.get(upper);
				continue;
			}

			if (heading(rowText)) {
				// Generic container labels do not replace the named subset.
				if (!/^(BASE CARDS?|INSERTS?|AUTOGRAPHS?|AUTOGRAPH RELICS?|RELICS?|MEMORABILIA)$/i.test(rowText)) {
					checklist = rowText;
				} else if (/^BASE CARDS?$/i.test(rowText)) {
					checklist = 'Base Cards';
				}
				continue;
			}

			const items = row.items.map((item) => ({ ...item, text: text(item.text) })).filter((item) => item.text);
			if (!items.length) continue;

			let numberIndex = -1;
			let number = null;
			for (let i = 0; i < Math.min(items.length, 3); i++) {
				const candidate = cardNumber(items[i].text);
				if (candidate) {
					numberIndex = i;
					number = candidate;
					break;
				}
			}
			if (!number || numberIndex < 0) continue;

			const rest = items.slice(numberIndex + 1);
			if (!rest.length) continue;

			let subject = '';
			let affiliation = '';

			if (rest.length >= 2) {
				// The modern Topps PDFs are laid out as visual columns. Find the largest
				// horizontal gap after the card number; that boundary separates the
				// subject column from the affiliation column even when either contains
				// multiple PDF text fragments.
				let splitAt = -1;
				let largestGap = -Infinity;
				for (let i = 1; i < rest.length; i++) {
					const previous = rest[i - 1];
					const gap = Number(rest[i].x || 0) - Number(previous.right || previous.x || 0);
					if (gap > largestGap) {
						largestGap = gap;
						splitAt = i;
					}
				}

				// Require some visual separation; otherwise we know a card exists but
				// refuse to invent where the subject ends and affiliation begins.
				if (splitAt > 0 && largestGap >= 8) {
					subject = text(rest.slice(0, splitAt).map((item) => item.text).join(' '));
					affiliation = cleanAffiliation(rest.slice(splitAt).map((item) => item.text).join(' '));
				}
			}

			if (!subject) {
				// Some PDFs emit the subject as one item and omit a distinct affiliation
				// cell. Keep the card reviewable rather than guessing an affiliation.
				subject = text(rest.map((item) => item.text).join(' '));
				affiliation = 'UNRESOLVED';
			}

			if (!subject || /^(card|card number|name|team|subset)$/i.test(subject)) continue;

			const sectionText = `${majorSection} ${checklist}`;
			const parsed = card({
				number,
				subject: subject.replace(/\s*\(RC\)\s*/gi, ' ').trim(),
				affiliation: affiliation || 'UNRESOLVED',
				checklist: checklist || majorSection || 'Checklist',
				rookie: /\(RC\)|\brookie\b/i.test(rowText),
				autograph: /\bauto(?:graph)?s?\b|signature/i.test(sectionText),
				memorabilia: /\brelic\b|memorabilia|patch|swatch|material/i.test(sectionText),
				raw: rowText
			});

			if (parsed.affiliation === 'UNRESOLVED') {
				parsed.affiliation_status = 'unresolved';
				parsed.confidence = 0.72;
			}

			cards.push(parsed);
		}
	}

	if (!cards.length) {
		throw new Error(
			'Recognized modern Topps checklist PDF, but no card rows matched the registered visual-column parser.'
		);
	}

	return finish(cards, 'topps-modern-checklist-pdf');
}

export function parseKnownPdfText(source, layout) {
	const lines = String(source || '')
		.split(/\n+/)
		.map(text)
		.filter(Boolean);
	const cards = [];

	if (layout === 'topps-entertainment-pdf') {
  return parseToppsEntertainmentPdfText(source);
}

	if (layout === 'topps-rugby-list-pdf') {
		let section = 'Checklist';

		for (const line of lines) {
			if (/^(numbered inserts|autographs?|base cards?)$/i.test(line)) {
				section = line;
				continue;
			}

			const match = line.match(/^(.+?)\s*-\s*([A-Za-z][A-Za-z .'-]+)$/);
			if (!match) continue;

			cards.push(
				card({
					subject: match[1],
					affiliation: match[2],
					checklist: section,
					autograph: /auto/i.test(section),
					raw: line
				})
			);
		}
	}

	if (layout === 'topps-match-attax-pdf') {
		let club = 'NIL';
		const section = 'Match Attax';

		for (const line of lines) {
			if (
				/^[A-ZÀ-ÖØ-Ý0-9 .&'/-]{3,}$/.test(line) &&
				!/^\d/.test(line) &&
				!/CHECKLIST|INFINITY/.test(line)
			) {
				club = line;
				continue;
			}

			const match = line.match(
				/^(\d{1,4})\s+(.+?)\s+([GDMF])\s+\d+(?:\.\d+)?M(?:\s+[A-Z]{2})?$/i
			);

			if (!match) continue;

			cards.push(
				card({
					number: match[1],
					subject: match[2],
					affiliation: club,
					checklist: section,
					raw: line
				})
			);
		}
	}

	if (layout === 'topps-entertainment-pdf') {
		let section = 'Base';

		for (const line of lines) {
			if (
				/^card # product type/i.test(line) ||
				/checklists provided by topps/i.test(line)
			) {
				continue;
			}

			const match = line.match(
				/^([A-Z0-9-]+)\s+(?:Card|Sticker)\s+([^\s]+)\s+(.+?)\s+(?:Puzzle|Coupon|Checklist|Game|Back)\b/i
			);

			if (!match) continue;

			section = match[2] || section;

			cards.push(
				card({
					number: match[1],
					subject: match[3],
					checklist: section,
					raw: line
				})
			);
		}
	}

	if (!cards.length) {
		throw new Error(
			`Recognized ${layout} PDF, but its rows did not match the registered parser strategy.`
		);
	}

	return finish(cards, layout);
}

export async function parseKnownPdfSource(file, source, layout) {
	if (layout === 'topps-soccer-table-pdf') {
		return parseSoccerTablePdf(file);
	}

	if (layout === 'topps-numbered-list-pdf') {
		return parseNumberedListPdf(source);
	}

	return parseKnownPdfText(source, layout);
}
