import fs from 'node:fs';
import path from 'node:path';

const changes = [
  {
    file: 'src/routes/api/admin/source-library/discover/+server.js',
    replacements: [
      [
        "const year=Number(body.year);\n    if(!Number.isInteger(year)||year<2000||year>new Date().getFullYear()+1)",
        "const year=String(body.year);\n    if(!['2026','2025','2024','2023','older'].includes(year))"
      ]
    ]
  },
  {
    file: 'src/routes/admin/source-library/+page.svelte',
    replacements: [
      [
        'let archiveFeedYear = $state(2026);',
        "let archiveFeedYear = $state('2026');"
      ],
      [
        '{#each Array.from({length:27},(_,i)=>2026-i) as y}<option value={y}>{y}</option>{/each}',
        '<option value="2026">2026</option><option value="2025">2025</option><option value="2024">2024</option><option value="2023">2023</option><option value="older">Older (2022 and earlier)</option>'
      ],
      [
        'Cache this year',
        'Cache selected archive'
      ]
    ]
  }
];

// Check all expected anchors across both current files before writing anything.
const prepared=[];
for(const {file,replacements} of changes){
  const full=path.resolve(process.cwd(),file);
  if(!fs.existsSync(full))throw Error('Missing source file: '+file);
  let content=fs.readFileSync(full,'utf8');
  for(const [before,after] of replacements){
    const occurrences=content.split(before).length-1;
    if(occurrences!==1)throw Error(`Expected exactly one matching anchor in ${file}; found ${occurrences}: ${before.slice(0,80)}`);
    content=content.replace(before,after);
  }
  prepared.push({full,content});
}
for(const {full,content} of prepared)fs.writeFileSync(full,content);
console.log('Done. Archive picker now supports 2026, 2025, 2024, 2023, and Older. No backups created.');
