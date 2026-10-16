function text(value) {
	return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function key(value) {
	return text(value).toLowerCase();
}

function truthy(value) {
	const v = key(value);
	return Boolean(v && !['0', 'false', 'no', 'n', '-'].includes(v));
}

function makeCard({ cardNumber, subject, affiliation = 'NIL', checklist, rookie = false, autograph = false, memorabilia = false, variation = null, raw = '' }) {
	return {
		card_number: text(cardNumber),
		subject: text(subject),
		affiliation: text(affiliation) || 'NIL',
		affiliation_id: null,
		affiliation_status: text(affiliation) && text(affiliation) !== 'NIL' ? 'source' : 'source-nil',
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

function finish(cards, sourceKind) {
	const sections = [...new Set(cards.map((card) => card.checklist_name).filter(Boolean))];
	const checklist_meta = {};
	for (const section of sections) {
		checklist_meta[section] = { card_count_declared: null, parallels: [], notes: [] };
	}
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

function findHeader(rows, predicate) {
	for (let index = 0; index < Math.min(rows.length, 30); index++) {
		const normalized = rows[index].map(key);
		if (predicate(normalized)) return { index, normalized };
	}
	return null;
}

export async function parseStructuredSpreadsheet(file, layout) {
	const XLSX = await import('xlsx');
	const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellText: true, raw: false });
	const cards = [];

	for (const sheetName of workbook.SheetNames) {
		const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false, blankrows: false });

		if (layout === 'topps-split-name-no-header') {
			let section = 'Checklist';

			for (const rawRow of rows) {
				const row = rawRow || [];
				const non = row.map(text).filter(Boolean);

				if (non.length === 1 && !/^[A-Z0-9][A-Z0-9._/-]{0,20}$/i.test(non[0])) {
					if (!/checklists provided by topps|subject to change|checklist$/i.test(non[0])) {
						section = non[0];
					}
					continue;
				}

				const number = text(row[0]);
				const first = text(row[1]);
				const last = text(row[2]);
				const team = text(row[3]);

				if (!/^[A-Z0-9][A-Z0-9._/-]{0,20}$/i.test(number) || !(first || last) || !team) {
					continue;
				}

				cards.push(makeCard({
					cardNumber: number,
					subject: [first, last].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(),
					affiliation: team,
					checklist: section,
					raw: non.join(' | ')
				}));
			}
			continue;
		}

		if (layout === 'topps-nonsport-sectioned') {
			let section = 'Checklist';
			let majorType = '';

			for (const rawRow of rows) {
				const row = rawRow || [];
				const non = row.map(text).filter(Boolean);

				if (!non.length) continue;

				if (non.length === 1) {
					const label = non[0].trim();

					if (/^(INSERT|AUTOGRAPH|RELIC|AUTOGRAPH RELIC|AUTOGRAPH RELICS)$/i.test(label)) {
						majorType = label.toUpperCase();
						continue;
					}

					if (
						!/checklists provided by topps|subject to change|checklist$/i.test(label) &&
						!/^2026\b/i.test(label)
					) {
						section = label;
					}
					continue;
				}

				const number = text(row[0]);
				const subject = text(row[1]);
				const detail = text(row[2]);

				if (!/^[A-Z0-9][A-Z0-9._/-]{0,24}$/i.test(number) || !subject) continue;

				cards.push(makeCard({
					cardNumber: number,
					subject,
					affiliation: 'NIL',
					checklist: section,
					autograph: /AUTOGRAPH/.test(majorType) || /AUTO|AUTOGRAPH/i.test(section),
					memorabilia: /RELIC/.test(majorType) || /RELIC|MEMORABILIA|PATCH/i.test(section),
					variation: detail || null,
					raw: non.join(' | ')
				}));
			}
			continue;
		}

		if (layout === 'topps-entertainment') {
			const header = findHeader(rows, (r) => (r.includes('card number') || r.includes('card #')) && r.includes('character'));
			if (!header) continue;
			const cols = {
				card: header.normalized.findIndex((v) => ['card number', 'card #'].includes(v)),
				character: header.normalized.indexOf('character'),
				property: header.normalized.indexOf('property')
			};
			let section = 'Base Cards';
			for (let i = header.index + 1; i < rows.length; i++) {
				const row = rows[i] || [];
				const non = row.map(text).filter(Boolean);
				if (non.length === 1 && !/^\d/.test(non[0])) { section = non[0]; continue; }
				const number = text(row[cols.card]);
				const subject = text(row[cols.character]);
				if (!number || !subject) continue;
				cards.push(makeCard({
					cardNumber: number,
					subject,
					affiliation: cols.property >= 0 ? text(row[cols.property]) : 'NIL',
					checklist: section,
					raw: non.join(' | ')
				}));
			}
			continue;
		}

		if (layout === 'topps-dual-subject') {
			const header = findHeader(rows, (r) => (r.includes('card number') || r.includes('card #')) && r.includes('player 1') && r.includes('player 2'));
			if (!header) continue;
			const col = (name) => header.normalized.indexOf(name);
			const cardCol = Math.max(header.normalized.indexOf('card #'), header.normalized.indexOf('card number'));
			let section = 'Checklist';
			for (let i = header.index + 1; i < rows.length; i++) {
				const row = rows[i] || [];
				const non = row.map(text).filter(Boolean);
				if (non.length === 1 && !/^\d/.test(non[0])) { section = non[0]; continue; }
				const number = text(row[cardCol]);
				const p1 = text(row[col('player 1')]);
				const p2 = text(row[col('player 2')]);
				if (!number || (!p1 && !p2)) continue;
				const t1 = text(row[col('team 1')]);
				const t2 = text(row[col('team 2')]);
				const sameTeam = t1 && t2 && key(t1) === key(t2);
				cards.push(makeCard({
					cardNumber: number,
					subject: [p1, p2].filter(Boolean).join(' / '),
					affiliation: sameTeam ? t1 : (t1 || t2 || 'NIL'),
					checklist: section,
					raw: non.join(' | ')
				}));
			}
			continue;
		}

		if (layout === 'topps-structured') {
			const header = findHeader(rows, (r) => (r.includes('card number') || r.includes('card #')) && r.includes('name') && r.includes('subset'));
			if (!header) continue;
			const cardCol = header.normalized.includes('card number') ? header.normalized.indexOf('card number') : header.normalized.indexOf('card #');
			const nameCol = header.normalized.indexOf('name');
			const teamCol = header.normalized.indexOf('team');
			const subsetCol = header.normalized.indexOf('subset');
			const rookieCol = header.normalized.indexOf('rookie');
			for (let i = header.index + 1; i < rows.length; i++) {
				const row = rows[i] || [];
				const number = text(row[cardCol]);
				const subject = text(row[nameCol]);
				const checklist = text(row[subsetCol]);
				if (!number || !subject || !checklist) continue;
				let affiliation = teamCol >= 0 ? text(row[teamCol]) : '';
				if (/^(legend|legends|driver|car|team principal)$/i.test(affiliation)) affiliation = '';
				cards.push(makeCard({
					cardNumber: number,
					subject,
					affiliation: affiliation || 'NIL',
					checklist,
					rookie: rookieCol >= 0 && truthy(row[rookieCol]),
					autograph: /\b(auto|autograph|signatures?)\b/i.test(checklist),
					memorabilia: /\b(relic|memorabilia|patch|material)\b/i.test(checklist),
					raw: row.map(text).filter(Boolean).join(' | ')
				}));
			}
		}
	}

	if (!cards.length) throw new Error(`Recognized ${layout} workbook, but no checklist cards were parsed.`);
	return finish(cards, layout);
}
