export const LAYOUTS = {
	PANINI: 'panini-canonical',
	UPPER_DECK_CI: 'upperdeck-ci',
	UPPER_DECK_SPLIT: 'upperdeck-split-name',
	TOPPS_SECTIONED: 'topps-sectioned',
	TOPPS_STRUCTURED: 'topps-structured',
	TOPPS_ENTERTAINMENT: 'topps-entertainment',
	TOPPS_DUAL: 'topps-dual-subject',
	TOPPS_WILLIAMS_PDF: 'topps-williams-pdf',
	TOPPS_LIGHTS_OUT_PDF: 'topps-lights-out-pdf',
	UPPER_DECK_TIM_PDF: 'upperdeck-tim-hortons-pdf',
	TOPPS_SIMPLE_TABLE_PDF: 'topps-simple-table-pdf',
	TOPPS_SOCCER_TABLE_PDF: 'topps-soccer-table-pdf',
	TOPPS_MATCH_ATTAX_PDF: 'topps-match-attax-pdf',
	TOPPS_RUGBY_LIST_PDF: 'topps-rugby-list-pdf',
	TOPPS_ENTERTAINMENT_PDF: 'topps-entertainment-pdf',
	TOPPS_NUMBERED_LIST_PDF: 'topps-numbered-list-pdf',
	UNKNOWN_SPREADSHEET: 'unknown-spreadsheet',
	UNKNOWN_PDF: 'unknown-pdf'
};

function clean(value) {
	return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function key(value) {
	return clean(value).toLowerCase();
}

function values(row) {
	return new Set((Array.isArray(row) ? row : []).map(key).filter(Boolean));
}

export function detectSpreadsheetLayout(preview = {}, context = {}) {
	const sheets = preview.sheets || [];
	const rows = sheets.flatMap((sheet) => (sheet.rows || []).slice(0, 30));

	for (const row of rows) {
		const set = values(row);

		if (set.has('card set') && set.has('card #') && set.has('athlete')) {
			return detected(LAYOUTS.PANINI, 1, 'Card Set + Card # + Athlete');
		}

		if (
			set.has('set name') &&
			set.has('card #') &&
			set.has('first name') &&
			set.has('teamcity') &&
			set.has('teamname')
		) {
			return detected(LAYOUTS.UPPER_DECK_SPLIT, 1, 'Upper Deck split-name columns');
		}

		if (
			set.has('set name') &&
			(set.has('card') || set.has('card #')) &&
			(set.has('description') || set.has('name') || set.has('player name'))
		) {
			return detected(LAYOUTS.UPPER_DECK_CI, 1, 'Upper Deck / Checklist Insider Set Name export');
		}

		if (
			(set.has('card number') || set.has('card #')) &&
			set.has('player 1') &&
			set.has('player 2')
		) {
			return detected(LAYOUTS.TOPPS_DUAL, 1, 'Topps dual-subject columns');
		}

		if (
			(set.has('card number') || set.has('card #')) &&
			set.has('character')
		) {
			return detected(LAYOUTS.TOPPS_ENTERTAINMENT, 1, 'Topps Character / Property columns');
		}

		if (
			(set.has('card number') || set.has('card #')) &&
			set.has('name') &&
			set.has('subset')
		) {
			return detected(LAYOUTS.TOPPS_STRUCTURED, 1, 'Topps Card Number / Name / Subset columns');
		}
	}

	const manufacturer = key(context.manufacturer);
	const fileName = key(context.fileName || context.name);
	const joined = rows
		.flatMap((row) => row.map(clean))
		.join(' ')
		.toLowerCase();

	if (
		manufacturer === 'topps' ||
		manufacturer === 'bowman' ||
		fileName.includes('topps') ||
		fileName.includes('bowman') ||
		joined.includes('checklists provided by topps') ||
		joined.includes('subject to change')
	) {
		return detected(LAYOUTS.TOPPS_SECTIONED, 0.96, 'Topps/Bowman sectioned workbook');
	}

	return detected(LAYOUTS.UNKNOWN_SPREADSHEET, 0, 'No registered spreadsheet family matched');
}

export function detectPdfLayout(text, context = {}) {
	const source = clean(text).toLowerCase();
	const name = key(context.name || context.fileName);
	const manufacturer = key(context.manufacturer);

	if (manufacturer === 'upper deck' && name.includes('tim hortons')) {
		return detected(LAYOUTS.UPPER_DECK_TIM_PDF, 1, 'Upper Deck Tim Hortons product');
	}

	if (name.includes('atlassian williams')) {
		return detected(LAYOUTS.TOPPS_WILLIAMS_PDF, 1, 'Williams NAME / ROLE / SUBSET table');
	}

	if (name.includes('lights out') && name.includes('formula 1')) {
		return detected(LAYOUTS.TOPPS_LIGHTS_OUT_PDF, 1, 'Lights Out Formula 1 visual table');
	}

	if (source.includes('card no. player name') || source.includes('card no player name')) {
		return detected(LAYOUTS.TOPPS_SIMPLE_TABLE_PDF, 0.99, 'Card No. / Player Name table');
	}

	if (
		source.includes('card number name team subset') ||
		source.includes('card number\tname\tteam\tsubset')
	) {
		return detected(LAYOUTS.TOPPS_SOCCER_TABLE_PDF, 0.99, 'Card Number / Name / Team / Subset table');
	}

	if (name.includes('match attax') || /\b\d+\s+[^\n]+\s+[gdmf]\s+\d+(?:\.\d+)?m\b/i.test(text)) {
		return detected(LAYOUTS.TOPPS_MATCH_ATTAX_PDF, 0.98, 'Match Attax numbered player/value list');
	}

	if (name.includes('rugby legends') || source.includes('numbered inserts') && /\s-\s(?:ireland|australia|wales|england|france|italy|samoa|fiji|argentina)/i.test(text)) {
		return detected(LAYOUTS.TOPPS_RUGBY_LIST_PDF, 0.98, 'Rugby subject - country list');
	}

	if (source.includes('card # product type') || name.includes('wacky packages') || name.includes('garbage pail kids')) {
		return detected(LAYOUTS.TOPPS_ENTERTAINMENT_PDF, 0.98, 'Entertainment Card # / Product Type table');
	}

	if (name.includes('marvel') && /\bcharacters?\b/i.test(text) && /\b1\s+[a-z]/i.test(text)) {
		return detected(LAYOUTS.TOPPS_NUMBERED_LIST_PDF, 0.9, 'Numbered entertainment list');
	}

	return detected(LAYOUTS.UNKNOWN_PDF, 0, 'No registered PDF family matched');
}

function detected(layout, confidence, reason) {
	return { layout, confidence, reason };
}

const BAD_SUBJECT_PATTERNS = [
	/\bcards? per box\b/i,
	/\bpacks? per box\b/i,
	/\bcards? per pack\b/i,
	/\bsubject to change\b/i,
	/^set\.?$/i,
	/^card set\b/i,
	/^checklists? provided by\b/i
];

const BAD_AFFILIATIONS = new Set([
	'legend', 'legends', 'rookie', 'rc', 'auto', 'autograph', 'relic', 'memorabilia', 'set'
]);

export function sanityCheckParsed(parsed, detection = {}, context = {}) {
	const cards = Array.isArray(parsed?.cards) ? parsed.cards : [];
	const sections = Array.isArray(parsed?.sections) ? parsed.sections : [];
	const reasons = [];
	const warnings = [];

	if (!cards.length) reasons.push('Parser returned zero cards.');
	if (cards.length > 7500) reasons.push(`Parser returned ${cards.length.toLocaleString()} cards, above the hard safety ceiling.`);
	if (cards.length > 2500 && sections.length <= 2) reasons.push(`${cards.length.toLocaleString()} cards landed in only ${sections.length} checklist sections.`);

	const badSubjects = cards.filter((card) => BAD_SUBJECT_PATTERNS.some((pattern) => pattern.test(String(card.subject || ''))));
	if (badSubjects.length) {
		reasons.push(`${badSubjects.length} parsed card${badSubjects.length === 1 ? '' : 's'} look like product configuration/header text.`);
	}

	const badAffiliations = cards.filter((card) => BAD_AFFILIATIONS.has(key(card.affiliation)));
	if (badAffiliations.length) {
		reasons.push(`${badAffiliations.length} parsed affiliation${badAffiliations.length === 1 ? '' : 's'} look like classifications rather than teams/organizations.`);
	}

	const unresolved = cards.filter((card) => card.affiliation === 'UNRESOLVED' || card.affiliation_status === 'unresolved').length;
	if (unresolved && unresolved === cards.length && cards.length >= 50) {
		warnings.push('Every parsed card is unresolved; verify whether this source actually carries affiliation data.');
	}

	const generic = detection.layout === LAYOUTS.UNKNOWN_PDF || detection.layout === LAYOUTS.UNKNOWN_SPREADSHEET;
	if (generic) reasons.push(`Unknown layout: ${detection.reason || detection.layout}.`);

	return {
		blocked: reasons.length > 0,
		reasons,
		warnings,
		layout: detection.layout || 'unknown',
		layoutConfidence: Number(detection.confidence || 0)
	};
}
