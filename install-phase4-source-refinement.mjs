import fs from 'node:fs';
const route = 'src/routes/api/admin/import-studio/facts/+server.js';
const component = 'src/lib/components/StudioFactsGatherer.svelte';
if (!fs.existsSync(route) || !fs.existsSync(component)) throw new Error('Run from Setbound project root after installing Phase 4.');
const source = fs.readFileSync(route, 'utf8');
const start = source.indexOf('  // Exact checklist URL is the only automatic cross-site identity bridge.');
const end = source.indexOf('  return {id,product:p.name', start);
if (start < 0 || end < start) throw new Error('Phase 4 source bridge differs from the expected version. No files changed.');
const bridge = fs.readFileSync('phase4-source-patches/ci-link-bridge.txt', 'utf8');
let updated = source.slice(0,start) + bridge + '\n' + source.slice(end);
updated = updated.replace("m.name manufacturer_name,s.source_url checklist_url", "m.name manufacturer_name, sp.name sport_name, s.source_url checklist_url")
  .replace('FROM products p JOIN manufacturers m ON m.id=p.manufacturer_id',
    'FROM products p JOIN manufacturers m ON m.id=p.manufacturer_id JOIN sports sp ON sp.id=p.sport_id');
updated = updated.replace("'topps-launch-metadata','topps-metadata','checklistinsider') AND (year=? OR year IS NULL)\n    LIMIT 1200", "'topps-launch-metadata','topps-metadata','checklistinsider') AND (year=? OR year IS NULL)\n    LIMIT 5000");
let ui = fs.readFileSync(component, 'utf8');
const old = 'Existing Topps metadata is read from cache first. Only an exact checklist-file URL permits cross-source matching.';
const fresh = 'Checklist Insider is preferred when product identity is verified, even for official Topps imports. Official metadata fills missing fields; ambiguous matches are blocked.';
if (!ui.includes(old)) throw new Error('Phase 4 UI copy differs from expected version. No files changed.');
ui=ui.replace(old,fresh);
// Check all expected patches before touching disk.
if (!updated.includes('sp.name sport_name') || !updated.includes("source:'Checklist Insider'") || !updated.includes('JOIN sports sp')) throw new Error('Refinement patch validation failed.');
fs.writeFileSync(route,updated);
fs.writeFileSync(component,ui);
console.log('Installed CI-first, verified product identity source bridge.');
