import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const bundleRoot = dirname(fileURLToPath(import.meta.url));
const target = join(root, 'src/routes/api/admin/source-harvester/apply-enrichment/+server.js');
const source = join(root, 'src/routes/api/admin/products/ai-research/+server.js');
const modal = join(root, 'src/lib/components/ProductEnrichmentModal.svelte');
const bundled = join(bundleRoot, 'src/routes/api/admin/products/ai-research/+server.js');

function assert(ok, message) { if (!ok) throw new Error(message); }

function patchApply(text) {
  // Accept both the original V1 and previously edited versions of this endpoint.
  assert(text.includes('const FORMAT_META = new Map(['), 'Format metadata map not found');
  for (const [key, label, order] of [
    ['mania', 'Mania Box Breakdown', 110],
    ['sapphire', 'Sapphire Edition Box Breakdown', 120]
  ]) {
    if (!new RegExp('\\[\\s*[\x27\x22]' + key + '[\x27\x22]\\s*,').test(text)) {
      const marker = "['inserts', ['Notable Inserts', 100]]";
      assert(text.includes(marker), 'Cannot find format insertion anchor');
      text = text.replace(marker, `${marker},\n\t['${key}', ['${label}', ${order}]]`);
    }
  }
  // Change only this function, rather than relying on one outdated return statement.
  const start = text.indexOf('function allowedImageUrl(value) {');
  const end = text.indexOf('function extensionForType(', start);
  assert(start >= 0 && end > start, 'Could not safely locate image URL validation function');
  const replacement = `function allowedImageUrl(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return null;
  const hosts = ['topps.com','upperdeck.com','paniniamerica.net','pokemon.com','pokemoncenter.com','fanaticscollect.com','checklistinsider.com','dacardworld.com','blowoutcards.com','steelcitycollectibles.com','cdn.shopify.com','images.ctfassets.net','cdn11.bigcommerce.com','xcdn.checklistinsider.com','cdn.shopifycdn.net','images.squarespace-cdn.com','shopify.com'];
  return hosts.some(host => url.hostname === host || url.hostname.endsWith('.' + host)) ? url : null;
}

`;
  return text.slice(0, start) + replacement + text.slice(end);
}

try {
  assert(existsSync(join(root, 'package.json')), 'Run this command from the Setbound project root');
  assert(existsSync(bundled), 'Extract the complete ZIP, including src/, to your project root');
  assert(existsSync(target) && existsSync(modal), 'Existing enrichment files not found');
  assert(readFileSync(modal, 'utf8').includes('Research with AI'), 'AI Research modal missing; install V1 first');
  const updated = patchApply(readFileSync(target, 'utf8'));
  const newResearch = readFileSync(bundled);
  assert(newResearch.toString('utf8').includes('IMAGE_HOSTS'), 'Bundled research endpoint was invalid');
  // No writes until all validations pass.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const file of [target, source]) {
    if (existsSync(file)) copyFileSync(file, file + '.bak-' + stamp);
  }
  mkdirSync(dirname(source), { recursive: true });
  writeFileSync(target, updated);
  writeFileSync(source, newResearch);
  console.log('AI Enrichment V2 installed. Run npm run check && npm run build.');
} catch (error) {
  console.error('Installation aborted: ' + error.message);
  process.exitCode = 1;
}
