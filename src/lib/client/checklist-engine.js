import { extractPdfText, extractTimHortonsChecklist } from '$lib/client/pdf.js';
import { extractSpreadsheetChecklist } from '$lib/client/spreadsheet.js';
import { parseChecklistText } from '$lib/client/checklist-parser.js';
import { extractToppsRacingChecklist } from '$lib/client/topps-racing.js';
import { parseStructuredSpreadsheet } from '$lib/client/structured-spreadsheet.js';
import { parseKnownPdfText } from '$lib/client/known-pdf.js';
import { detectSpreadsheetLayout, detectPdfLayout, sanityCheckParsed, LAYOUTS } from '$lib/parser-layouts.js';

function ext(file, context) {
	return String(context.extension || file.name?.split('.').pop() || '').toLowerCase();
}

async function spreadsheetPreview(file) {
	const XLSX=await import('xlsx');
	const workbook=XLSX.read(await file.arrayBuffer(),{type:'array',cellText:true,raw:false});
	return {
		sheets: workbook.SheetNames.slice(0,8).map((name)=>({
			name,
			rows: XLSX.utils.sheet_to_json(workbook.Sheets[name],{header:1,defval:'',raw:false,blankrows:false}).slice(0,35)
		}))
	};
}

function mergeSafety(parsed, detection, context) {
	const audit=sanityCheckParsed(parsed,detection,context);
	const old=parsed.safety || {blocked:false,reasons:[]};
	return {
		...parsed,
		layoutDetection:detection,
		safety:{
			blocked:Boolean(old.blocked || audit.blocked),
			reasons:[...new Set([...(old.reasons||[]),...(audit.reasons||[])])],
			warnings:[...new Set([...(old.warnings||[]),...(audit.warnings||[])])],
			layout:audit.layout,
			layoutConfidence:audit.layoutConfidence
		}
	};
}

export async function parseChecklistSource(file, context={}) {
	const extension=ext(file,context);
	const fullContext={...context,fileName:file.name};
	let parsed;
	let detection;

	if (extension==='xls' || extension==='xlsx') {
		const preview=await spreadsheetPreview(file);
		detection=detectSpreadsheetLayout(preview,fullContext);

		if (detection.layout===LAYOUTS.UNKNOWN_SPREADSHEET) {
			throw new Error(`Unknown spreadsheet layout. ${detection.reason}. Import blocked instead of guessing.`);
		}

		const isToppsRacing=String(context.manufacturer||'').toLowerCase()==='topps' && String(context.sport||'').toLowerCase()==='racing';
		if (isToppsRacing) {
			parsed=await extractToppsRacingChecklist(file,context.name);
		}

		if (!parsed && [LAYOUTS.TOPPS_STRUCTURED,LAYOUTS.TOPPS_ENTERTAINMENT,LAYOUTS.TOPPS_DUAL].includes(detection.layout)) {
			parsed=await parseStructuredSpreadsheet(file,detection.layout);
		}

		if (!parsed) parsed=await extractSpreadsheetChecklist(file);
		return mergeSafety(parsed,detection,fullContext);
	}

	if (extension==='pdf') {
		const source=await extractPdfText(file);
		detection=detectPdfLayout(source,fullContext);

		if (detection.layout===LAYOUTS.UPPER_DECK_TIM_PDF) {
			parsed=await extractTimHortonsChecklist(file);
		} else if ([LAYOUTS.TOPPS_WILLIAMS_PDF,LAYOUTS.TOPPS_LIGHTS_OUT_PDF].includes(detection.layout)) {
			parsed=await extractToppsRacingChecklist(file,context.name);
		} else if ([LAYOUTS.TOPPS_SIMPLE_TABLE_PDF,LAYOUTS.TOPPS_SOCCER_TABLE_PDF,LAYOUTS.TOPPS_MATCH_ATTAX_PDF,LAYOUTS.TOPPS_RUGBY_LIST_PDF,LAYOUTS.TOPPS_ENTERTAINMENT_PDF].includes(detection.layout)) {
			parsed=parseKnownPdfText(source,detection.layout);
		} else if (detection.layout===LAYOUTS.TOPPS_NUMBERED_LIST_PDF) {
			// Known 2026 family, but still intentionally blocked until a safe numbered-list
			// parser is registered. Better an explicit block than another invented checklist.
			throw new Error('Recognized Topps numbered-list PDF layout, but its dedicated parser is not enabled yet. Import blocked safely.');
		} else {
			throw new Error(`Unknown PDF layout. ${detection.reason}. Import blocked instead of falling back to the generic parser.`);
		}

		return mergeSafety(parsed,detection,fullContext);
	}

	throw new Error(`Unsupported checklist type: ${extension || 'unknown'}`);
}
