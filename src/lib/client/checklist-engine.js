import { extractPdfText, extractTimHortonsChecklist } from '$lib/client/pdf.js';
import { extractSpreadsheetChecklist } from '$lib/client/spreadsheet.js';
import { extractToppsRacingChecklist } from '$lib/client/topps-racing.js';
import { parseStructuredSpreadsheet } from '$lib/client/structured-spreadsheet.js';
import { parseKnownPdfSource, parseToppsModernChecklistPdf } from '$lib/client/known-pdf.js';
import { parseUniversalPdfText, parseUniversalDelimited } from '$lib/client/universal-checklist.js';
import { detectSpreadsheetLayout, detectPdfLayout, sanityCheckParsed, LAYOUTS } from '$lib/parser-layouts.js';

function ext(file, context) {
  return String(context.extension || file.name?.split('.').pop() || '').toLowerCase().replace(/^\./, '');
}
async function workbook(file) {
  const XLSX = await import('xlsx');
  const book = XLSX.read(await file.arrayBuffer(), {type:'array',cellText:true,raw:false});
  return {XLSX,book};
}
function workbookPreview(XLSX, book) {
  return {sheets:book.SheetNames.slice(0,8).map(name=>({name,rows:XLSX.utils.sheet_to_json(book.Sheets[name], {header:1,defval:'',raw:false,blankrows:false}).slice(0,35)}))};
}
function cardIdentity(card) {
  return [card.checklist_name, card.subject, card.affiliation, card.card_number,
    card.rookie?'1':'0', card.autograph?'1':'0', card.memorabilia?'1':'0',card.serial_number,card.variation]
    .map(value=>String(value??'').trim().toLowerCase()).join('|');
}
function dedupeParsed(parsed) {
  const cards=Array.isArray(parsed?.cards)?parsed.cards:[];
  const seen=new Set(),deduped=[];
  for(const c of cards){const id=cardIdentity(c);if(seen.has(id))continue;seen.add(id);deduped.push(c);}
  if(deduped.length===cards.length)return parsed;
  const sections=[...new Set(deduped.map(c=>c.checklist_name).filter(Boolean))];
  const checklist_meta={...(parsed.checklist_meta||{})};
  for(const section of sections){checklist_meta[section]={...(checklist_meta[section]||{}),
    card_count_declared:deduped.filter(c=>c.checklist_name===section).length,
    parallels:checklist_meta[section]?.parallels||[],notes:checklist_meta[section]?.notes||[]};}
  return {...parsed,cards:deduped,sections,checklist_meta,
    high:deduped.filter(c=>Number(c.confidence||0)>=.85).length,
    review:deduped.filter(c=>Number(c.confidence||0)<.85).length,
    dedupeStats:{...(parsed.dedupeStats||{}),exactCardsRemoved:cards.length-deduped.length}};
}
function mergeSafety(parsed,detection,context){
  const normalized=dedupeParsed(parsed);
  const audit=sanityCheckParsed(normalized,detection,context);
  const old=normalized.safety||{blocked:false,reasons:[]};
  return {...normalized,layoutDetection:detection,safety:{blocked:Boolean(old.blocked||audit.blocked),
    reasons:[...new Set([...(old.reasons||[]),...(audit.reasons||[])])],
    warnings:[...new Set([...(old.warnings||[]),...(audit.warnings||[])])],
    layout:audit.layout,layoutConfidence:audit.layoutConfidence}};
}
function universalDetection(type){return {layout:`universal-${type}-fallback`,confidence:.7,reason:'Generic document structure detection; review parsed rows'};}
function preferFallback(current,fallback){
  if(!current)return fallback;
  if(current.safety?.blocked&&!fallback.safety?.blocked&&fallback.cards.length>=current.cards.length)return fallback;
  return current;
}
async function universalWorkbook(XLSX,book){
  const results=[];
  for(const name of book.SheetNames){
    const csv=XLSX.utils.sheet_to_csv(book.Sheets[name]);
    const parsed=parseUniversalDelimited(csv);
    if(parsed.cards.length){
      // Preserve distinct worksheet identities when the worksheet has no subset column.
      parsed.cards=parsed.cards.map(c=>({...c,checklist_name:c.checklist_name==='Base'?name:c.checklist_name}));
      results.push(parsed);
    }
  }
  const cards=results.flatMap(r=>r.cards);
  const sections=[...new Set(cards.map(c=>c.checklist_name))];
  return {cards,sections,checklist_meta:Object.fromEntries(sections.map(s=>[s,{card_count_declared:cards.filter(c=>c.checklist_name===s).length,parallels:[],notes:[]}])) ,
    safety:{blocked:cards.length===0,reasons:cards.length?[]:['No recognizable card-number/subject header in workbook.'],
      warnings:results.flatMap(r=>r.safety.warnings)}};
}
export async function parseChecklistSource(file,context={}){
  const extension=ext(file,context);
  const fullContext={...context,fileName:file.name};
  let parsed,detection;
  if(extension==='csv'||extension==='tsv'||extension==='txt'){
    const source=await file.text();
    const delimiter=extension==='tsv'?'\t':extension==='csv'?',':source.includes('\t')?'\t':',';
    parsed=parseUniversalDelimited(source,delimiter);
    return mergeSafety(parsed,universalDetection('delimited'),fullContext);
  }
  if(extension==='xls'||extension==='xlsx'){
    const {XLSX,book}=await workbook(file);
    detection=detectSpreadsheetLayout(workbookPreview(XLSX,book),fullContext);
    if(detection.layout===LAYOUTS.UNKNOWN_SPREADSHEET){
      return mergeSafety(await universalWorkbook(XLSX,book),universalDetection('spreadsheet'),fullContext);
    }
    const racing=String(context.manufacturer||'').toLowerCase()==='topps'&&String(context.sport||'').toLowerCase()==='racing';
    if(racing)parsed=await extractToppsRacingChecklist(file,context.name);
    if(!parsed&&[LAYOUTS.TOPPS_STRUCTURED,LAYOUTS.TOPPS_ENTERTAINMENT,LAYOUTS.TOPPS_DUAL,
      LAYOUTS.TOPPS_SPLIT_NAME_NO_HEADER,LAYOUTS.TOPPS_NONSPORT_SECTIONED].includes(detection.layout)){
      parsed=await parseStructuredSpreadsheet(file,detection.layout);
    }
    if(!parsed)parsed=await extractSpreadsheetChecklist(file);
    let result=mergeSafety(parsed,detection,fullContext);
    if(result.safety.blocked){
      const fallback=mergeSafety(await universalWorkbook(XLSX,book),universalDetection('spreadsheet'),fullContext);
      result=preferFallback(result,fallback);
    }
    return result;
  }
  if(extension==='pdf'){
    const source=await extractPdfText(file);
    detection=detectPdfLayout(source,fullContext);
    if(detection.layout===LAYOUTS.UNKNOWN_PDF){
      return mergeSafety(parseUniversalPdfText(source),universalDetection('pdf'),fullContext);
    }
    try{
      if(detection.layout===LAYOUTS.UPPER_DECK_TIM_PDF){
        parsed=await extractTimHortonsChecklist(file);
      }else if([LAYOUTS.TOPPS_WILLIAMS_PDF,LAYOUTS.TOPPS_LIGHTS_OUT_PDF].includes(detection.layout)){
        parsed=await extractToppsRacingChecklist(file,context.name);
      }else if(detection.layout===LAYOUTS.TOPPS_MODERN_CHECKLIST_PDF){
        parsed=await parseToppsModernChecklistPdf(file);
      }else if([LAYOUTS.TOPPS_SIMPLE_TABLE_PDF,LAYOUTS.TOPPS_SOCCER_TABLE_PDF,
        LAYOUTS.TOPPS_MATCH_ATTAX_PDF,LAYOUTS.TOPPS_RUGBY_LIST_PDF,
        LAYOUTS.TOPPS_ENTERTAINMENT_PDF,LAYOUTS.TOPPS_NUMBERED_LIST_PDF].includes(detection.layout)){
        parsed=await parseKnownPdfSource(file,source,detection.layout);
      }
    }catch(error){
      // Known-layout extraction failures may try the same generic fallback.
      // Preserve the original error in review metadata; do not invent rows.
      const generic=parseUniversalPdfText(source);
      generic.safety.warnings.push(`Primary parser failed: ${error.message}`);
      return mergeSafety(generic,universalDetection('pdf'),fullContext);
    }
    let result=mergeSafety(parsed,detection,fullContext);
    if(result.safety.blocked){
      const fallback=mergeSafety(parseUniversalPdfText(source),universalDetection('pdf'),fullContext);
      result=preferFallback(result,fallback);
    }
    return result;
  }
  throw new Error(`Unsupported checklist type: ${extension||'unknown'}. Supported: PDF, XLS, XLSX, CSV, TSV.`);
}
