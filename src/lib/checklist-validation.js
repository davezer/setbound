function keyPart(value) {
	return String(value ?? '').trim().toLowerCase();
}

function makeIssue({ type, checklist = null, message, cardIndexes = [] }) {
	return { severity: 'review', type, checklist, message, cardIndexes };
}

export function validateChecklistImport(cards = [], checklistMeta = {}, sections = []) {
	const issues = [];
	const byChecklist = {};
	const exactMap = new Map();
	const rawMap = new Map();

	const ensureSection = (name) => {
		const section = name || 'Uncategorized';

		if (!byChecklist[section]) {
			byChecklist[section] = {
				cards: 0,
				highConfidence: 0,
				lowConfidence: 0,
				nil: 0,
				unresolved: 0,
				issues: 0,
				blockers: 0
			};
		}

		return byChecklist[section];
	};

	cards.forEach((card, index) => {
		const checklist = card.checklist_name || 'Uncategorized';
		const stats = ensureSection(checklist);

		stats.cards += 1;

		if ((card.confidence ?? 0) >= 0.85) stats.highConfidence += 1;
		else stats.lowConfidence += 1;

		if (!card.affiliation || card.affiliation === 'NIL') stats.nil += 1;

		if (card.affiliation === 'UNRESOLVED' || card.affiliation_status === 'unresolved') {
			stats.unresolved += 1;
			issues.push(makeIssue({
				type: 'unresolved-affiliation',
				checklist,
				message: `${card.card_number || '(no number)'} ${card.subject || ''} has no verified affiliation. Check the source row before importing.`.trim(),
				cardIndexes: [index]
			}));
		}

		if (!String(card.subject || '').trim()) {
			issues.push(makeIssue({
				type: 'missing-subject',
				checklist,
				message: `Card ${card.card_number || '(no number)'} has no subject. Verify that this is intentional.`,
				cardIndexes: [index]
			}));
		}

		if (!String(card.card_number || '').trim()) {
			issues.push(makeIssue({
				type: 'missing-number',
				checklist,
				message: `${card.subject || 'A card'} has no printed card number. Verify that this is intentional.`,
				cardIndexes: [index]
			}));
		}

		if ((card.confidence ?? 0) < 0.85 && card.affiliation_status !== 'unresolved') {
			issues.push(makeIssue({
				type: 'low-confidence',
				checklist,
				message: `${card.card_number || '(no number)'} ${card.subject || ''} parsed at ${Math.round((card.confidence ?? 0) * 100)}% confidence.`.trim(),
				cardIndexes: [index]
			}));
		}

		const exactKey = [
			keyPart(checklist),
			keyPart(card.card_number),
			keyPart(card.subject),
			keyPart(card.affiliation)
		].join('|');

		if (!exactMap.has(exactKey)) exactMap.set(exactKey, []);
		exactMap.get(exactKey).push(index);

		if (card.raw) {
			const rawKey = `${keyPart(checklist)}|${keyPart(card.raw)}`;
			if (!rawMap.has(rawKey)) rawMap.set(rawKey, []);
			rawMap.get(rawKey).push(index);
		}
	});

	for (const indexes of exactMap.values()) {
		if (indexes.length < 2) continue;
		const sample = cards[indexes[0]];

		issues.push(makeIssue({
			type: 'duplicate-card',
			checklist: sample.checklist_name,
			message: `${sample.card_number || '(no number)'} ${sample.subject || ''} appears ${indexes.length} times with the same affiliation. Verify the source contains each row.`.trim(),
			cardIndexes: indexes
		}));
	}

	for (const indexes of rawMap.values()) {
		if (indexes.length < 2) continue;
		const sample = cards[indexes[0]];

		issues.push(makeIssue({
			type: 'duplicate-source-row',
			checklist: sample.checklist_name,
			message: `The same source row was parsed ${indexes.length} times in ${sample.checklist_name}.`,
			cardIndexes: indexes
		}));
	}

	const knownSections = new Set(
		cards.map((card) => card.checklist_name || 'Uncategorized').filter(Boolean)
	);

	for (const checklist of knownSections) {
		const stats = ensureSection(checklist);
		const meta = checklistMeta?.[checklist] || {};
		const declared = Number(meta.card_count_declared || 0);

		if (declared > 0 && declared !== stats.cards) {
			const delta = stats.cards - declared;

			issues.push(makeIssue({
				type: 'count-mismatch',
				checklist,
				message: `${checklist} declares ${declared.toLocaleString()} cards but ${stats.cards.toLocaleString()} were parsed (${delta > 0 ? '+' : ''}${delta}).`
			}));
		}
	}

	for (const issue of issues) {
		if (!issue.checklist) continue;
		ensureSection(issue.checklist).issues += 1;
	}

	const unresolvedCards = cards.filter(
		(card) => card.affiliation === 'UNRESOLVED' || card.affiliation_status === 'unresolved'
	).length;

	return {
		issues,
		blockers: [],
		review: issues,
		byChecklist,
		totals: {
			cards: cards.length,
			sections: knownSections.size,
			blockers: 0,
			review: issues.length,
			nilCards: cards.filter((card) => !card.affiliation || card.affiliation === 'NIL').length,
			unresolvedCards,
			lowConfidence: cards.filter((card) => (card.confidence ?? 0) < 0.85).length
		},
		canImport: cards.length > 0
	};
}
