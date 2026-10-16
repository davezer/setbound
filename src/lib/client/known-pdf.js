function text(value) {
	return String(value ?? '').replace(/\s+/g, ' ').trim();
}
function key(value) { return text(value).toLowerCase(); }
function card({ number = 'UNNUMBERED', subject, affiliation = 'NIL', checklist = 'Checklist', rookie = false, autograph = false, memorabilia = false, raw = '' }) {
	return {
		card_number: String(number), subject: text(subject), affiliation: text(affiliation) || 'NIL', affiliation_id: null,
		affiliation_status: affiliation && affiliation !== 'NIL' ? 'source' : 'source-nil', rookie, autograph, memorabilia,
		serial_number: null, checklist_name: checklist, confidence: 0.98, raw
	};
}
function finish(cards, sourceKind) {
	const sections=[...new Set(cards.map(c=>c.checklist_name).filter(Boolean))];
	const checklist_meta=Object.fromEntries(sections.map(s=>[s,{card_count_declared:null,parallels:[],notes:[]}]))
	return {cards,sections,checklist_meta,metaSections:sections.length,high:cards.length,review:0,lines:cards.length,sourceKind};
}

export function parseKnownPdfText(source, layout) {
	const lines=String(source||'').split(/\n+/).map(text).filter(Boolean);
	const cards=[];

	if (layout === 'topps-simple-table-pdf') {
		let section='Base';
		for (const line of lines) {
			if (/^(base|autographs?|inserts?)$/i.test(line)) { section=line; continue; }
			const m=line.match(/^(\d{1,4}[A-Z]?)\s+(.+)$/);
			if (!m || /^card no/i.test(line)) continue;
			const rookie=/\(RC\)/i.test(m[2]);
			cards.push(card({number:m[1],subject:m[2].replace(/\s*\(RC\)\s*/i,'').trim(),checklist:section,rookie,raw:line}));
		}
	}

	if (layout === 'topps-rugby-list-pdf') {
		let section='Checklist';
		for (const line of lines) {
			if (/^(numbered inserts|autographs?|base cards?)$/i.test(line)) { section=line; continue; }
			const m=line.match(/^(.+?)\s*-\s*([A-Za-z][A-Za-z .'-]+)$/);
			if (!m) continue;
			cards.push(card({subject:m[1],affiliation:m[2],checklist:section,autograph:/auto/i.test(section),raw:line}));
		}
	}

	if (layout === 'topps-match-attax-pdf') {
		let club='NIL';
		let section='Match Attax';
		for (const line of lines) {
			if (/^[A-ZÀ-ÖØ-Ý0-9 .&'/-]{3,}$/.test(line) && !/^\d/.test(line) && !/CHECKLIST|INFINITY/.test(line)) { club=line; continue; }
			const m=line.match(/^(\d{1,4})\s+(.+?)\s+([GDMF])\s+\d+(?:\.\d+)?M(?:\s+[A-Z]{2})?$/i);
			if (!m) continue;
			cards.push(card({number:m[1],subject:m[2],affiliation:club,checklist:section,raw:line}));
		}
	}

	if (layout === 'topps-entertainment-pdf') {
		let section='Base';
		for (const line of lines) {
			if (/^card # product type/i.test(line) || /checklists provided by topps/i.test(line)) continue;
			const m=line.match(/^([A-Z0-9-]+)\s+(?:Card|Sticker)\s+([^\s]+)\s+(.+?)\s+(?:Puzzle|Coupon|Checklist|Game|Back)\b/i);
			if (!m) continue;
			section=m[2] || section;
			cards.push(card({number:m[1],subject:m[3],checklist:section,raw:line}));
		}
	}

	if (layout === 'topps-soccer-table-pdf') {
		let section='Checklist';
		for (const line of lines) {
			if (/^(base cards|insert cards|autograph cards)$/i.test(line)) { section=line; continue; }
			if (/^card number/i.test(line)) continue;
			const parts=line.split('\t').map(text).filter(Boolean);
			if (parts.length>=4 && /^\d{1,4}[A-Z]?$/.test(parts[0])) {
				cards.push(card({number:parts[0],subject:parts[1],affiliation:parts[2],checklist:parts[3]||section,rookie:/rookie|rc/i.test(parts.slice(4).join(' ')),raw:line}));
			}
		}
	}

	if (!cards.length) throw new Error(`Recognized ${layout} PDF, but its rows did not match the registered parser strategy.`);
	return finish(cards, layout);
}
