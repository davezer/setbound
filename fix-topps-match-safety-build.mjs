import fs from 'node:fs';

const files = [
  'src/routes/api/admin/products/[id]/enrich-draft/+server.js',
  'src/routes/api/admin/topps-launch-backfill/+server.js'
];

let changed = 0;

for (const file of files) {
  if (!fs.existsSync(file)) {
    throw new Error(`Could not find ${file}`);
  }

  const before = fs.readFileSync(file, 'utf8');
  const after = before.replace(/\basync\s+async\s+function\b/g, 'async function');

  if (after !== before) {
    fs.writeFileSync(file, after);
    changed += 1;
    console.log(`Fixed duplicate async in ${file}`);
  } else {
    console.log(`No duplicate async found in ${file}; leaving unchanged.`);
  }
}

console.log(`Done. Repaired ${changed} file${changed === 1 ? '' : 's'}.`);
console.log('Run npm run check && npm run build.');
