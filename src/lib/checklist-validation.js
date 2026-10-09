function keyPart(value) {
  return String(value ?? '').trim().toLowerCase();
}

function makeIssue({ severity = 'review', type, checklist = null, message, cardIndexes = [] }) {
  return { severity, type, checklist, message, cardIndexes };
}

export function validateChecklistImport(cards = [], checklistMeta = {}, sections = []) {
  const issues = [];
  const byChecklist = {};

  const ensureSection = (name) => {
    const section = name || 'Uncategorized';

    if (!byChecklist[section]) {
      byChecklist[section] = {
        cards: 0,
        highConfidence: 0,
        lowConfidence: 0,
        nil: 0,
        issues: 0,
        blockers: 0
      };
    }

    return byChecklist[section];
  };

  const numberMap = new Map();
  const exactMap = new Map();
  const rawMap = new Map();

  cards.forEach((card, index) => {
    const checklist = card.checklist_name || 'Uncategorized';
    const stats = ensureSection(checklist);

    stats.cards += 1;

    if ((card.confidence ?? 0) >= 0.85) stats.highConfidence += 1;
    else stats.lowConfidence += 1;

    if (!card.affiliation || card.affiliation === 'NIL') stats.nil += 1;

    // A blank subject can be legitimate. Some official checklists contain object,
    // trophy, team, or concept cards without a named person/subject.
    // Flag it for review, but never block the import solely for this reason.
    if (!String(card.subject || '').trim()) {
      issues.push(makeIssue({
        severity: 'review',
        type: 'missing-subject',
        checklist,
        message: `Card ${card.card_number || '(no number)'} has no subject. Setbound will use the checklist name as its display subject.`,
        cardIndexes: [index]
      }));
    }

    if (!String(card.card_number || '').trim()) {
      issues.push(makeIssue({
        severity: 'review',
        type: 'missing-number',
        checklist,
        message: `${card.subject || 'A card'} has no printed card number. Verify that this is intentional.`,
        cardIndexes: [index]
      }));
    }

    if ((card.confidence ?? 0) < 0.85) {
      issues.push(makeIssue({
        severity: 'review',
        type: 'low-confidence',
        checklist,
        message: `${card.card_number || '(no number)'} ${card.subject || ''} parsed at ${Math.round((card.confidence ?? 0) * 100)}% confidence.`.trim(),
        cardIndexes: [index]
      }));
    }

    const numberKey = `${keyPart(checklist)}|${keyPart(card.card_number)}`;

    if (!numberMap.has(numberKey)) numberMap.set(numberKey, []);
    numberMap.get(numberKey).push(index);

    const exactKey = `${numberKey}|${keyPart(card.subject)}`;

    if (!exactMap.has(exactKey)) exactMap.set(exactKey, []);
    exactMap.get(exactKey).push(index);

    const rawKey = `${keyPart(checklist)}|${keyPart(card.raw)}`;

    if (card.raw) {
      if (!rawMap.has(rawKey)) rawMap.set(rawKey, []);
      rawMap.get(rawKey).push(index);
    }
  });

  for (const indexes of numberMap.values()) {
    if (indexes.length < 2) continue;

    const uniqueSubjects = new Set(indexes.map((i) => keyPart(cards[i]?.subject)));
    const sample = cards[indexes[0]];

    if (uniqueSubjects.size > 1) {
      issues.push(makeIssue({
        severity: 'review',
        type: 'shared-card-number',
        checklist: sample.checklist_name,
        message: `Card number ${sample.card_number || '(blank)'} is used by ${uniqueSubjects.size} different subjects in this checklist. This may be intentional.`,
        cardIndexes: indexes
      }));
    }
  }

  for (const indexes of exactMap.values()) {
    if (indexes.length < 2) continue;

    const sample = cards[indexes[0]];

    issues.push(makeIssue({
      severity: 'review',
      type: 'duplicate-card',
      checklist: sample.checklist_name,
      message: `${sample.card_number || '(no number)'} ${sample.subject || ''} appears ${indexes.length} times in the same checklist. Verify that the source really contains each entry.`.trim(),
      cardIndexes: indexes
    }));
  }

  for (const indexes of rawMap.values()) {
    if (indexes.length < 2) continue;

    const sample = cards[indexes[0]];

    issues.push(makeIssue({
      severity: 'review',
      type: 'duplicate-source-row',
      checklist: sample.checklist_name,
      message: `The same source row was parsed ${indexes.length} times in ${sample.checklist_name}.`,
      cardIndexes: indexes
    }));
  }

  const knownSections = new Set([
    ...sections,
    ...Object.keys(checklistMeta || {}),
    ...cards.map((card) => card.checklist_name || 'Uncategorized')
  ].filter(Boolean));

  for (const checklist of knownSections) {
    const stats = ensureSection(checklist);
    const meta = checklistMeta?.[checklist] || {};
    const declared = Number(meta.card_count_declared || 0);

    if (stats.cards === 0) {
      issues.push(makeIssue({
        severity: 'review',
        type: 'empty-section',
        checklist,
        message: `${checklist} was detected as a section but no card rows were parsed.`
      }));
    }

    if (declared > 0 && declared !== stats.cards) {
      const delta = stats.cards - declared;

      issues.push(makeIssue({
        severity: 'review',
        type: 'count-mismatch',
        checklist,
        message: `${checklist} declares ${declared.toLocaleString()} cards but ${stats.cards.toLocaleString()} were parsed (${delta > 0 ? '+' : ''}${delta}).`
      }));
    }
  }

  for (const issue of issues) {
    if (!issue.checklist) continue;

    const stats = ensureSection(issue.checklist);
    stats.issues += 1;

    if (issue.severity === 'blocker') stats.blockers += 1;
  }

  // Validation is advisory. Manufacturer checklists are weird enough that
  // content anomalies should not prevent an admin from importing a known-good source.
  const blockers = [];
  const review = issues;
  const nilCards = cards.filter((card) => !card.affiliation || card.affiliation === 'NIL').length;

  return {
    issues,
    blockers,
    review,
    byChecklist,
    totals: {
      cards: cards.length,
      sections: knownSections.size,
      blockers: 0,
      review: review.length,
      nilCards,
      lowConfidence: cards.filter((card) => (card.confidence ?? 0) < 0.85).length
    },
    canImport: cards.length > 0
  };
}
