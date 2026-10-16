import { browser } from '$app/environment';

const NIL = 'NIL';

function text(value) {
	return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function key(value) {
	return text(value).toLowerCase();
}

function card({
	cardNumber = 'UNNUMBERED',
	subject,
	affiliation = NIL,
	checklist,
	rookie = false,
	autograph = false,
	memorabilia = false,
	variation = null,
	raw = ''
}) {
	return {
		card_number: String(cardNumber),
		subject: text(subject),
		affiliation: affiliation || NIL,
		affiliation_id: null,
		affiliation_status: affiliation && affiliation !== NIL ? 'source' : 'source-nil',
		rookie: Boolean(rookie),
		autograph: Boolean(autograph),
		memorabilia: Boolean(memorabilia),
		serial_number: null,
		variation: variation || null,
		checklist_name: text(checklist) || 'Checklist',
		confidence: 0.99,
		raw
	};
}

function result(cards, sourceKind, notes = []) {
	const sections = [...new Set(cards.map((item) => item.checklist_name).filter(Boolean))];
	const checklist_meta = {};

	for (const section of sections) {
		checklist_meta[section] = {
			card_count_declared: cards.filter((item) => item.checklist_name === section).length,
			parallels: [],
			notes: []
		};
	}

	return {
		sections,
		cards,
		checklist_meta,
		metaSections: sections.length,
		high: cards.length,
		review: 0,
		lines: cards.length,
		sourceKind,
		notes,
		safety: {
			blocked: cards.length === 0,
			reasons: cards.length ? [] : ['Dedicated Topps Racing parser found no checklist rows.']
		}
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
				height: Number(item.height || 0)
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
			text: row.items.sort((a, b) => a.x - b.x).map((item) => item.text).join(' ')
		}))
		.sort((a, b) => b.y - a.y);
}

function cleanHeading(value) {
	return text(value)
		.replace(/[®™©]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function normalizeF1Affiliation(value) {
	const v = text(value);

	if (!v) return NIL;

	// These are roles / classifications, not constructors.
	if (/^(legend|legends|driver|drivers|car|cars|team|team principal)$/i.test(v)) {
		return NIL;
	}

	// Race/event labels sometimes occupy the Team column for special cards.
	if (/\b(grand prix|grande prêmio|sprint|driver of the day|award winner)\b/i.test(v)) {
		return NIL;
	}

	return v;
}

async function parseToppsRacingSpreadsheet(file) {
	const XLSX = await import('xlsx');
	const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
	const cards = [];

	for (const sheetName of workbook.SheetNames) {
		const sheet = workbook.Sheets[sheetName];
		const rows = XLSX.utils.sheet_to_json(sheet, {
			header: 1,
			defval: '',
			raw: false,
			blankrows: false
		});

		let headerIndex = -1;
		let columns = null;

		for (let index = 0; index < Math.min(rows.length, 25); index++) {
			const normalized = (rows[index] || []).map(key);
			const cardNumber = normalized.indexOf('card number');
			const name = normalized.indexOf('name');
			const team = normalized.indexOf('team');
			const subset = normalized.indexOf('subset');

			if (cardNumber >= 0 && name >= 0 && subset >= 0) {
				headerIndex = index;
				columns = {
					cardNumber,
					name,
					team,
					subset,
					rookie: normalized.indexOf('rookie'),
					firstLogo: normalized.indexOf('1st logo')
				};
				break;
			}
		}

		if (!columns) continue;

		for (let index = headerIndex + 1; index < rows.length; index++) {
			const row = rows[index] || [];
			const cardNumber = text(row[columns.cardNumber]);
			const subject = text(row[columns.name]);
			const checklist = text(row[columns.subset]);
			const sourceTeam = columns.team >= 0 ? text(row[columns.team]) : '';

			if (!cardNumber || !subject || !checklist) continue;
			if (/^(card number|name|subset)$/i.test(cardNumber)) continue;

			const rookie =
				(columns.rookie >= 0 && Boolean(text(row[columns.rookie]))) ||
				/\brookie\b/i.test(checklist);

			cards.push(card({
				cardNumber,
				subject,
				affiliation: normalizeF1Affiliation(sourceTeam),
				checklist,
				rookie,
				autograph: /\b(auto|autograph|signatures?)\b/i.test(checklist),
				memorabilia: /\b(relic|memorabilia|patch|material|swatch)\b/i.test(checklist),
				raw: [cardNumber, subject, sourceTeam, checklist].filter(Boolean).join(' | ')
			}));
		}
	}

	return cards.length ? result(cards, 'topps-racing-spreadsheet') : null;
}

const WILLIAMS_SECTIONS = new Set([
	'BASE CARDS',
	'INSERT CARDS',
	'AUTOGRAPH CARDS',
	'RELICS',
	'AUTOGRAPH RELICS'
]);

function williamsSectionName(section, subset) {
	const left = section
		.toLowerCase()
		.replace(/\b\w/g, (match) => match.toUpperCase());

	return subset ? `${left} — ${subset}` : left;
}

function findWilliamsColumns(row) {
	const byText = new Map(row.items.map((item) => [key(item.text), item.x]));
	const name = byText.get('name');
	const role = byText.get('role');
	const subset = byText.get('subset');
	const relic = byText.get('relic');

	if (name == null || role == null || subset == null) return null;

	return [name, role, subset, relic].filter((value) => value != null);
}

function cellsForRow(row, starts) {
	const cells = starts.map(() => []);

	for (const item of row.items) {
		let index = 0;

		for (let i = 0; i < starts.length; i++) {
			if (item.x >= starts[i]) index = i;
		}

		cells[index].push(item.text);
	}

	return cells.map((parts) => text(parts.join(' ')));
}

async function parseWilliamsPdf(file) {
	const pages = await pdfPages(file);
	const cards = [];
	let section = 'BASE CARDS';

	for (const page of pages) {
		const rows = groupRows(page.items);
		let starts = null;

		for (const row of rows) {
			const heading = cleanHeading(row.text).toUpperCase();

			if (WILLIAMS_SECTIONS.has(heading)) {
				section = heading;
				starts = null;
				continue;
			}

			const maybeStarts = findWilliamsColumns(row);
			if (maybeStarts) {
				starts = maybeStarts;
				continue;
			}

			if (!starts) continue;

			const cells = cellsForRow(row, starts);
			const [subject, role, subset, relic] = cells;

			if (
				!subject ||
				!role ||
				!subset ||
				/^(name|topps\.com|subject to change)$/i.test(subject) ||
				! /^(driver|legend|car|team|team principal)$/i.test(role)
			) {
				continue;
			}

			cards.push(card({
				subject,
				affiliation: 'Atlassian Williams F1 Team',
				checklist: williamsSectionName(section, subset),
				autograph: /AUTOGRAPH/.test(section),
				memorabilia: /RELIC/.test(section),
				variation: relic || null,
				raw: [subject, role, subset, relic].filter(Boolean).join(' | ')
			}));
		}
	}

	return result(cards, 'topps-williams-racing-pdf', [
		'Source checklist does not print card numbers; Setbound stores these as UNNUMBERED.'
	]);
}

const LIGHTS_OUT_HEADINGS = new Set([
	'lights out',
	'nero',
	'powertrain',
	'lumina',
	'halo',
	'radiance',
	'ignite',
	'next gen'
]);

function titleCase(value) {
	return text(value)
		.toLowerCase()
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

async function parseLightsOutPdf(file) {
	const pages = await pdfPages(file);
	const cards = [];
	let section = 'Checklist';
	let autographMode = false;
	let currentTeam = NIL;
	let previousCard = null;

	for (const page of pages) {
		const rows = groupRows(page.items);

		for (const row of rows) {
			const rowText = cleanHeading(row.text);
			const low = rowText.toLowerCase();

			if (/short print autograph cards/i.test(rowText)) {
				section = 'F2 & F3 Short Print Autograph Cards';
				autographMode = true;
				currentTeam = NIL;
				previousCard = null;
				continue;
			}

			if (/^f1\s+autograph cards$/i.test(cleanHeading(rowText))) {
				section = 'F1 Autograph Cards';
				autographMode = true;
				currentTeam = NIL;
				previousCard = null;
				continue;
			}

			const leftHeading = text(
				row.items
					.filter((item) => item.x < page.width * 0.20)
					.map((item) => item.text)
					.join(' ')
			);

			const normalizedHeading = cleanHeading(leftHeading).toLowerCase();

			if (LIGHTS_OUT_HEADINGS.has(normalizedHeading)) {
				const baseName = titleCase(normalizedHeading);
				section = autographMode ? `F1 Autograph Cards — ${baseName}` : baseName;
				currentTeam = NIL;
				previousCard = null;
				continue;
			}

			if (
				/checklist|subject to change|topps f1|numbered parallels|parallels numbered|autographs numbered|cards per box|card set/i.test(rowText)
			) {
				continue;
			}

			const subject = text(
				row.items
					.filter(
						(item) =>
							item.x >= page.width * 0.20 &&
							item.x < page.width * 0.41
					)
					.map((item) => item.text)
					.join(' ')
			);

			const sourceTeam = text(
				row.items
					.filter((item) => item.x >= page.width * 0.41)
					.map((item) => item.text)
					.join(' ')
			);

			if (sourceTeam && !/^(>|checklist)$/i.test(sourceTeam)) {
				currentTeam = sourceTeam;
			}

			if (!subject || /^(checklist|subject to change)$/i.test(subject)) continue;

			// Wrapped names such as "Martinius / Stenshorne" or
			// "Tasanapol / Inthraphuvasak" have the team on the first visual line.
			if (
				!sourceTeam &&
				previousCard &&
				previousCard.__page === page.pageNumber &&
				Math.abs(previousCard.__y - row.y) <= 22 &&
				subject.split(/\s+/).length <= 2 &&
				previousCard.__canWrap
			) {
				previousCard.subject = `${previousCard.subject} ${subject}`.trim();
				previousCard.raw = `${previousCard.raw} ${subject}`.trim();
				previousCard.__y = row.y;
				previousCard.__canWrap = false;
				continue;
			}

			if (!currentTeam || currentTeam === NIL) continue;

			const parsed = card({
				subject,
				affiliation: currentTeam,
				checklist: section,
				autograph: autographMode,
				raw: [subject, currentTeam, section].join(' | ')
			});

			parsed.__page = page.pageNumber;
			parsed.__y = row.y;
			parsed.__canWrap = Boolean(sourceTeam && subject.split(/\s+/).length === 1);

			cards.push(parsed);
			previousCard = parsed;
		}
	}

	for (const item of cards) {
		delete item.__page;
		delete item.__y;
		delete item.__canWrap;
	}

	return result(cards, 'topps-lights-out-racing-pdf', [
		'Source checklist does not print card numbers; Setbound stores these as UNNUMBERED.'
	]);
}

export async function extractToppsRacingChecklist(file, productName = '') {
	const name = key(productName);
	const extension = String(file.name || '').split('.').pop()?.toLowerCase();

	if (extension === 'xls' || extension === 'xlsx') {
		const spreadsheet = await parseToppsRacingSpreadsheet(file);
		if (spreadsheet) return spreadsheet;
	}

	if (extension === 'pdf') {
		if (name.includes('atlassian williams')) {
			return parseWilliamsPdf(file);
		}

		if (name.includes('lights out')) {
			return parseLightsOutPdf(file);
		}
	}

	return null;
}
