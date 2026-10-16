import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as XLSX from 'xlsx';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { detectSpreadsheetLayout, detectPdfLayout } from '../src/lib/parser-layouts.js';

const folder=path.resolve(process.argv[2] || '.');
if (!fs.existsSync(folder)) {
	console.error(`Folder not found: ${folder}`);
	process.exit(1);
}

function sha256(file) {
	return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function manufacturer(name) {
	const n=name.toLowerCase();
	if (/upper[- ]deck|fleer|skybox/.test(n)) return 'Upper Deck';
	if (/panini|donruss|score/.test(n)) return 'Panini';
	if (/topps|bowman/.test(n)) return 'Topps';
	return 'Unknown';
}
function sport(name) {
	const n=name.toLowerCase();
	for (const [token,label] of [['baseball','Baseball'],['football','Football'],['basketball','Basketball'],['hockey','Hockey'],['soccer','Soccer'],['racing','Racing'],['nascar','Racing'],['wrestling','Wrestling'],['ufc','UFC'],['tennis','Tennis'],['golf','Golf'],['rugby','Rugby']]) if(n.includes(token)) return label;
	return '';
}
async function pdfText(file) {
	const pdf=await getDocument({data:new Uint8Array(fs.readFileSync(file)),disableWorker:true}).promise;
	let out='';
	for(let p=1;p<=Math.min(pdf.numPages,2);p++){
		const page=await pdf.getPage(p); const content=await page.getTextContent();
		out += content.items.map((item)=>item.str||'').join(' ')+'\n';
	}
	return out;
}

const names=fs.readdirSync(folder).filter((name)=>/\.(xlsx|xls|pdf)$/i.test(name));
const records=[];
for(const name of names){
	const file=path.join(folder,name); const ext=path.extname(name).toLowerCase();
	const context={name,manufacturer:manufacturer(name),sport:sport(name),fileName:name};
	let detection;
	try{
		if(ext==='.pdf') detection=detectPdfLayout(await pdfText(file),context);
		else{
			const wb=XLSX.read(fs.readFileSync(file),{type:'buffer',raw:false});
			const preview={sheets:wb.SheetNames.slice(0,8).map((sheetName)=>({name:sheetName,rows:XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{header:1,defval:'',raw:false,blankrows:false}).slice(0,35)}))};
			detection=detectSpreadsheetLayout(preview,context);
		}
	}catch(error){ detection={layout:'audit-error',confidence:0,reason:error.message}; }
	const stat=fs.statSync(file);
	records.push({file:name,sha256:sha256(file),bytes:stat.size,extension:ext,manufacturer:context.manufacturer,sport:context.sport,...detection});
}
const duplicateMap=new Map();
for(const r of records){ if(!duplicateMap.has(r.sha256)) duplicateMap.set(r.sha256,[]); duplicateMap.get(r.sha256).push(r.file); }
const counts={}; for(const r of records) counts[r.layout]=(counts[r.layout]||0)+1;
const unknown=records.filter((r)=>r.layout.startsWith('unknown')||r.layout==='audit-error');
const report={generatedAt:new Date().toISOString(),folder,files:records.length,uniqueFiles:duplicateMap.size,duplicates:[...duplicateMap.values()].filter((g)=>g.length>1),layoutCounts:counts,unknown,records};
const out=path.join(folder,'setbound-parser-audit.json'); fs.writeFileSync(out,JSON.stringify(report,null,2));
console.log(`Setbound parser audit: ${records.length} files · ${duplicateMap.size} unique`);
for(const [layout,count] of Object.entries(counts).sort((a,b)=>b[1]-a[1])) console.log(String(count).padStart(4),layout);
console.log(unknown.length?`\n${unknown.length} unknown/error layouts. See ${out}`:`\nAll files classified. Report: ${out}`);
