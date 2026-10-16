import fs from 'node:fs';

function patchHarvester(){
	const path='src/routes/admin/source-harvester/+page.svelte';
	let source=fs.readFileSync(path,'utf8');
	const imports=[
		"\timport { extractPdfText, extractTimHortonsChecklist } from '$lib/client/pdf.js';\n",
		"\timport { extractSpreadsheetChecklist } from '$lib/client/spreadsheet.js';\n",
		"\timport { parseChecklistText } from '$lib/client/checklist-parser.js';\n",
		"\timport { extractToppsRacingChecklist } from '$lib/client/topps-racing.js';\n"
	];
	for(const line of imports) source=source.replace(line,'');
	if(!source.includes("import { parseChecklistSource } from '$lib/client/checklist-engine.js';")){
		source=source.replace("<script>\n", "<script>\n\timport { parseChecklistSource } from '$lib/client/checklist-engine.js';\n");
	}
	const start=source.indexOf('\t\t\tconst isToppsRacing =');
	const end=source.indexOf('\n\t\t\tparsed = applyProductContextAffiliation(row, parsed);',start);
	if(start<0||end<0) throw new Error('Could not locate current prepareItem parser branch.');
	const replacement=`\t\t\tparsed = await parseChecklistSource(file, {\n\t\t\t\tname: row.name,\n\t\t\t\tmanufacturer: row.manufacturer,\n\t\t\t\tsport: row.sport,\n\t\t\t\textension: ext,\n\t\t\t\taffiliations: data.affiliations\n\t\t\t});`;
	source=source.slice(0,start)+replacement+source.slice(end);
	source=source.replace("statusText: 'Suspicious spreadsheet parse'","statusText: 'Parser review required'");
	fs.writeFileSync(path,source);
}

function patchSpreadsheet(){
	const path='src/lib/client/spreadsheet.js';
	let source=fs.readFileSync(path,'utf8');
	if(!source.includes("'character'")) source=source.replace("\t'athlete'\n];","\t'athlete',\n\t'character',\n\t'description',\n\t'player name'\n];");
	if(!source.includes("'property'")) source=source.replace("\t'league'\n];","\t'league',\n\t'property',\n\t'club',\n\t'country'\n];");
	const old="\tconst description = find(['description']);";
	if(source.includes(old)) source=source.replace(old,"\tconst description = find(['description', 'name', 'player name']);");
	fs.writeFileSync(path,source);
}

function patchPackage(){
	const path='package.json'; const pkg=JSON.parse(fs.readFileSync(path,'utf8'));
	pkg.scripts ||= {}; pkg.scripts['parser:audit']='node tools/parser-corpus-audit.mjs';
	fs.writeFileSync(path,JSON.stringify(pkg,null,2)+'\n');
}

patchHarvester(); patchSpreadsheet(); patchPackage();
console.log('Setbound parser engine installed. New/unknown layouts now block instead of guessing.');
