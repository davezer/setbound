import fs from 'node:fs';
import path from 'node:path';

const target = path.join(process.cwd(), 'src/routes/admin/sets/+page.svelte');
if (!fs.existsSync(target)) throw Error('Manage Sets page not found. Run from the Setbound project root.');
let source = fs.readFileSync(target, 'utf8');
if (source.includes('SETBOUND_BULK_DELETE_V1')) {
  console.log('Bulk delete is already installed. Nothing changed.');
  process.exit(0);
}
const modifications = [
  [
    '\tlet deleting = $state(null);',
    `\tlet deleting = $state(null);
\t// SETBOUND_BULK_DELETE_V1
\tlet selectedDeleteIds = $state([]);
\tlet bulkDeleteBusy = $state(false);
\tlet bulkDeleteProgress = $state('');
\tconst selectedDeleteProducts = $derived(products.filter(p => selectedDeleteIds.includes(Number(p.id))));
\tconst visibleDeleteIds = $derived(visible.map(p => Number(p.id)));
\tfunction changeDeleteSelection(id, checked) {
\t\tconst next = new Set(selectedDeleteIds);
\t\tif (checked) next.add(id); else next.delete(id);
\t\tselectedDeleteIds = [...next];
\t}
\tfunction selectVisibleForDelete() {
\t\tselectedDeleteIds = [...new Set([...selectedDeleteIds, ...visibleDeleteIds])];
\t}
\tasync function deleteSelectedImports() {
\t\tif (bulkDeleteBusy || deleting !== null) return;
\t\tconst selected = [...selectedDeleteProducts];
\t\tif (!selected.length) return;
\t\tconst live = selected.filter(p => Boolean(p.published)).length;
\t\tconst cardCount = selected.reduce((sum,p) => sum + Number(p.card_count || 0), 0);
\t\tconst confirmed = prompt(
\t\t\t'DELETE ' + selected.length + ' IMPORTS PERMANENTLY?\\n\\n' +
\t\t\tselected.length + ' products, ' + cardCount.toLocaleString() + ' cards, and their checklists, sources and artwork will be deleted.\\n' +
\t\t\t(live ? 'WARNING: ' + live + ' selected sets are LIVE.\\n' : '') +
\t\t\t'Collection records associated with these sets may also be lost.\\n' +
\t\t\t'This cannot be undone. Type DELETE ' + selected.length + ' to proceed.'
\t\t);
\t\tif (confirmed !== 'DELETE ' + selected.length) return;
\t\tbulkDeleteBusy = true;
\t\tmessage = '';
\t\tlet completed = 0;
\t\ttry {
\t\t\tfor (const item of selected) {
\t\t\t\tbulkDeleteProgress = 'Deleting ' + (completed + 1) + ' of ' + selected.length + ': ' + item.name;
\t\t\t\tconst response = await fetch('/api/admin/products/' + encodeURIComponent(item.id), { method: 'DELETE' });
\t\t\t\tconst result = await response.json().catch(() => ({}));
\t\t\t\tif (!response.ok || result.ok !== true || Number(result.deleted?.id) !== Number(item.id)) {
\t\t\t\t\tthrow Error((result.message || 'Delete failed') + ' (' + item.name + ').');
\t\t\t\t}
\t\t\t\tproducts = products.filter(p => Number(p.id) !== Number(item.id));
\t\t\t\tselectedDeleteIds = selectedDeleteIds.filter(id => id !== Number(item.id));
\t\t\t\tselectedOfflineIds = selectedOfflineIds.filter(id => id !== Number(item.id));
\t\t\t\tcompleted++;
\t\t\t}
\t\t\tmessage = 'Deleted ' + completed + ' selected import(s).';
\t\t} catch (error) {
\t\t\tmessage = 'Deleted ' + completed + ' of ' + selected.length + ' before stopping. ' + (error?.message || 'Unknown error') + ' Remaining selections were preserved.';
\t\t} finally {
\t\t\tbulkDeleteBusy = false;
\t\t\tbulkDeleteProgress = '';
\t\t}
\t}`
  ],
  [
    '\t<div class="list">\n\t\t{#each visible as product (product.id)}',
    `\t<div class="bulk-delete-tools" aria-label="Bulk delete imports">
\t\t<div><strong>Bulk delete imports</strong><span>{selectedDeleteProducts.length} selected · {selectedDeleteProducts.filter(p => p.published).length} live</span></div>
\t\t<div class="bulk-delete-actions">
\t\t\t<button type="button" onclick={selectVisibleForDelete} disabled={bulkDeleteBusy || !visible.length}>Select visible ({visible.length})</button>
\t\t\t<button type="button" onclick={() => selectedDeleteIds = []} disabled={bulkDeleteBusy || !selectedDeleteIds.length}>Clear selection</button>
\t\t\t<button type="button" class="delete-selected" onclick={deleteSelectedImports} disabled={bulkDeleteBusy || deleting !== null || !selectedDeleteProducts.length}>{bulkDeleteBusy ? 'Deleting…' : 'Delete selected (' + selectedDeleteProducts.length + ')'}</button>
\t\t</div>
\t\t<p>Only checked imports will be deleted. Selection is separate from bulk visibility. Deletion is permanent and requires typed confirmation.</p>
\t\t{#if bulkDeleteProgress}<p role="status">{bulkDeleteProgress}</p>{/if}
\t</div>
\t<div class="list">
\t\t{#each visible as product (product.id)}`
  ],
  [
    '\t\t\t<article class="row">\n\t\t\t\t<div class="bulk-choice">',
    `\t\t\t<article class="row">
\t\t\t\t<div class="bulk-choice bulk-delete-choice">
\t\t\t\t\t<label title="Select for permanent deletion"><input type="checkbox" aria-label={'Select ' + product.name + ' for permanent deletion'} checked={selectedDeleteIds.includes(Number(product.id))} disabled={bulkDeleteBusy} onchange={(event) => changeDeleteSelection(Number(product.id), event.currentTarget.checked)} /></label>
\t\t\t\t</div>
\t\t\t\t<div class="bulk-choice">`
  ],
  [
    '\t.row{display:grid;grid-template-columns:22px 130px minmax(300px,1fr) auto;',
    '\t.row{display:grid;grid-template-columns:22px 22px 130px minmax(300px,1fr) auto;'
  ],
  [
    '\t\t.row{grid-template-columns:22px 100px 1fr}',
    '\t\t.row{grid-template-columns:22px 22px 100px 1fr}'
  ],
  [
    '\t\t.row{grid-template-columns:22px 80px 1fr}',
    '\t\t.row{grid-template-columns:22px 22px 80px 1fr}'
  ],
  [
    '\t.bulk-choice{display:flex;justify-content:center;align-items:center}',
    `\t.bulk-delete-tools{display:grid;gap:.65rem;border:1px solid #e3bbb6;border-radius:.85rem;padding:1rem;margin:1rem 0 1.25rem;background:#fff9f8}
\t.bulk-delete-tools>div:first-child,.bulk-delete-actions{display:flex;align-items:center;flex-wrap:wrap;gap:.65rem}
\t.bulk-delete-tools>div:first-child span{font-size:.75rem;color:var(--muted)}
\t.bulk-delete-actions button{border:1px solid var(--line-strong);background:white;border-radius:.55rem;padding:.52rem .68rem;font:inherit;font-size:.72rem;font-weight:850;cursor:pointer}
\t.bulk-delete-actions .delete-selected{background:#8d3028;border-color:#8d3028;color:white}
\t.bulk-delete-actions button:disabled{opacity:.45;cursor:not-allowed}
\t.bulk-delete-tools p{font-size:.72rem;color:var(--muted);margin:0}
\t.bulk-delete-choice input{accent-color:#8d3028}
\t.bulk-choice{display:flex;justify-content:center;align-items:center}`
  ]
];
// Validate every change before touching a single file.
for (const [before] of modifications) {
  if (source.split(before).length !== 2) throw Error('Expected exactly one source anchor, found ' + (source.split(before).length - 1) + ': ' + before.slice(0, 75));
}
let updated = source;
for (const [before, after] of modifications) updated = updated.replace(before, after);
const backup = target + '.bulk-delete-backup-' + Date.now();
fs.copyFileSync(target, backup);
fs.writeFileSync(target, updated);
console.log('Bulk delete installed in Manage Sets. Backup: ' + backup);
console.log('Run npm run check and npm run build before deployment.');
