import { extractPdfText, extractTimHortonsChecklist } from '$lib/client/pdf.js';
import { extractSpreadsheetChecklist } from '$lib/client/spreadsheet.js';
import { extractToppsRacingChecklist } from '$lib/client/topps-racing.js';
import { parseStructuredSpreadsheet } from '$lib/client/structured-spreadsheet.js';
import { parseKnownPdfSource, parseToppsModernChecklistPdf } from '$lib/client/known-pdf.js';
import { detectSpreadsheetLayout, detectPdfLayout, sanityCheckParsed, LAYOUTS } from '$lib/parser-layouts.js';

function ext(file, context) {
	return String(context.extension || file.name?.split('.').pop() || '').toLowerCase();
}

async function spreadsheetPreview(file) {
	const XLSX = await import('xlsx');
	const workbook = XLSX.read(await file.arrayBuffer(), {
		type: 'array',
		cellText: true,
		raw: false
	});

	return {
		sheets: workbook.SheetNames.slice(0, 8).map((name) => ({
			name,
			rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], {
				header: 1,
				defval: '',
				raw: false,
				blankrows: false
			}).slice(0, 35)
		}))
	};
}

function cardIdentity(card) {
	return [
		String(card.checklist_name || ''),
		String(card.subject || ''),
		String(card.affiliation || ''),
		String(card.card_number || ''),
		card.rookie ? '1' : '0',
		card.autograph ? '1' : '0',
		card.memorabilia ? '1' : '0',
		String(card.serial_number ?? ''),
		String(card.variation ?? '')
	].map((value) => value.trim().toLowerCase()).join('|');
}

function dedupeParsed(parsed) {
	const cards = Array.isArray(parsed?.cards) ? parsed.cards : [];
	const seen = new Set();
	const deduped = [];

	for (const card of cards) {
		const identity = cardIdentity(card);
		if (seen.has(identity)) continue;
		seen.add(identity);
		deduped.push(card);
	}

	if (deduped.length === cards.length) return parsed;

	const sections = [...new Set(deduped.map((card) => card.checklist_name).filter(Boolean))];
	const checklist_meta = { ...(parsed.checklist_meta || {}) };

	for (const section of sections) {
		checklist_meta[section] = {
			...(checklist_meta[section] || {}),
			card_count_declared: deduped.filter((card) => card.checklist_name === section).length,
			parallels: checklist_meta[section]?.parallels || [],
			notes: checklist_meta[section]?.notes || []
		};
	}

	return {
		...parsed,
		cards: deduped,
		sections,
		checklist_meta,
		high: deduped.filter((card) => Number(card.confidence || 0) >= 0.85).length,
		review: deduped.filter((card) => Number(card.confidence || 0) < 0.85).length,
		dedupeStats: {
			...(parsed.dedupeStats || {}),
			exactCardsRemoved: cards.length - deduped.length
		}
	};
}

function mergeSafety(parsed, detection, context) {
	const normalized = dedupeParsed(parsed);
	const audit = sanityCheckParsed(normalized, detection, context);
	const old = normalized.safety || { blocked: false, reasons: [] };

	return {
		...normalized,
		layoutDetection: detection,
		safety: {
			blocked: Boolean(old.blocked || audit.blocked),
			reasons: [...new Set([...(old.reasons || []), ...(audit.reasons || [])])],
			warnings: [...new Set([...(old.warnings || []), ...(audit.warnings || [])])],
			layout: audit.layout,
			layoutConfidence: audit.layoutConfidence
		}
	};
}

export async function parseChecklistSource(file, context = {}) {
	const extension = ext(file, context);
	const fullContext = { ...context, fileName: file.name };
	let parsed;
	let detection;

	if (extension === 'xls' || extension === 'xlsx') {
		const preview = await spreadsheetPreview(file);
		detection = detectSpreadsheetLayout(preview, fullContext);

		if (detection.layout === LAYOUTS.UNKNOWN_SPREADSHEET) {
			throw new Error(
				`Unknown spreadsheet layout. ${detection.reason}. Import blocked instead of guessing.`
			);
		}

		const isToppsRacing =
			String(context.manufacturer || '').toLowerCase() === 'topps' &&
			String(context.sport || '').toLowerCase() === 'racing';

		if (isToppsRacing) {
			parsed = await extractToppsRacingChecklist(file, context.name);
		}

		if (
			!parsed &&
			[
				LAYOUTS.TOPPS_STRUCTURED,
				LAYOUTS.TOPPS_ENTERTAINMENT,
				LAYOUTS.TOPPS_DUAL,
				LAYOUTS.TOPPS_SPLIT_NAME_NO_HEADER,
				LAYOUTS.TOPPS_NONSPORT_SECTIONED
			].includes(detection.layout)
		) {
			parsed = await parseStructuredSpreadsheet(file, detection.layout);
		}

		if (!parsed) parsed = await extractSpreadsheetChecklist(file);

		return mergeSafety(parsed, detection, fullContext);
	}

	if (extension === 'pdf') {
		const source = await extractPdfText(file);
		detection = detectPdfLayout(source, fullContext);

		if (detection.layout === LAYOUTS.UPPER_DECK_TIM_PDF) {
			parsed = await extractTimHortonsChecklist(file);
		} else if (
			[
				LAYOUTS.TOPPS_WILLIAMS_PDF,
				LAYOUTS.TOPPS_LIGHTS_OUT_PDF
			].includes(detection.layout)
		) {
			parsed = await extractToppsRacingChecklist(file, context.name);
		} else if (detection.layout === LAYOUTS.TOPPS_MODERN_CHECKLIST_PDF) {
			parsed = await parseToppsModernChecklistPdf(file);
		} else if (
			[
				LAYOUTS.TOPPS_SIMPLE_TABLE_PDF,
				LAYOUTS.TOPPS_SOCCER_TABLE_PDF,
				LAYOUTS.TOPPS_MATCH_ATTAX_PDF,
				LAYOUTS.TOPPS_RUGBY_LIST_PDF,
				LAYOUTS.TOPPS_ENTERTAINMENT_PDF,
				LAYOUTS.TOPPS_NUMBERED_LIST_PDF
			].includes(detection.layout)
		) {
			parsed = await parseKnownPdfSource(file, source, detection.layout);
		} else {
			throw new Error(
				`Unknown PDF layout. ${detection.reason}. Import blocked instead of falling back to the generic parser.`
			);
		}

		return mergeSafety(parsed, detection, fullContext);
	}

	throw new Error(`Unsupported checklist type: ${extension || 'unknown'}`);
}
