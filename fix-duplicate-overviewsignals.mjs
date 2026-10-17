import fs from 'node:fs';

const path = 'src/lib/server/checklist-insider-enrichment.js';

if (!fs.existsSync(path)) {
  throw new Error(`Could not find ${path}`);
}

let source = fs.readFileSync(path, 'utf8');

const marker = 'function overviewSignals(sourceFacts = []) {';
const positions = [];
let from = 0;
while (true) {
  const index = source.indexOf(marker, from);
  if (index === -1) break;
  positions.push(index);
  from = index + marker.length;
}

if (positions.length < 2) {
  console.log(`Found ${positions.length} overviewSignals() declaration(s). Nothing to fix.`);
  process.exit(0);
}

function findFunctionEnd(text, start) {
  const open = text.indexOf('{', start);
  if (open === -1) throw new Error('Could not find function opening brace.');
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  throw new Error('Could not find function closing brace.');
}

// Keep the LAST declaration because that is the newer variety-pass version.
// Remove all earlier duplicates from right-to-left so indexes stay valid.
for (let i = positions.length - 2; i >= 0; i--) {
  const start = positions[i];
  let end = findFunctionEnd(source, start);
  while (end < source.length && (source[end] === '\n' || source[end] === '\r')) end++;
  source = source.slice(0, start) + source.slice(end);
}

fs.writeFileSync(path, source);
console.log('Removed duplicate overviewSignals() declaration(s); kept the newest version.');
