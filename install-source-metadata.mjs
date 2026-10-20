import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const page=path.resolve('src/routes/admin/sets/+page.svelte');
const files=['src/lib/components/CardsmithsMetadataModal.svelte','src/routes/api/admin/products/source-metadata/+server.js'];
const home=path.dirname(fileURLToPath(import.meta.url));
for(const f of files){if(!fs.existsSync(path.resolve(home,f)))throw Error('Missing bundled file: '+f);}
if(!fs.existsSync(page))throw Error('Manage Sets page missing: '+page);
let s=fs.readFileSync(page,'utf8');
if(s.includes('SETBOUND_CARDSMITHS_METADATA_V1')){console.log('Already installed; no changes.');process.exit(0);}
function replaceOnce(needle,replacement){const occurrences=s.split(needle).length-1;if(occurrences!==1)throw Error(`Expected exactly one source anchor (${occurrences}): ${needle.slice(0,70)}. No files changed.`);s=s.replace(needle,replacement);}
replaceOnce("import ProductEnrichmentModal from '$lib/components/ProductEnrichmentModal.svelte';","import ProductEnrichmentModal from '$lib/components/ProductEnrichmentModal.svelte';\n\timport CardsmithsMetadataModal from '$lib/components/CardsmithsMetadataModal.svelte'; // SETBOUND_CARDSMITHS_METADATA_V1");
replaceOnce("let enrichmentProduct = $state(null);","let enrichmentProduct = $state(null);\n\tlet sourceMetadataProduct = $state(null);");
replaceOnce("\t\t\t\t\t<button class=\"edit\" type=\"button\" onclick={() => enrichmentProduct = product}>","\t\t\t\t\t<button class=\"edit\" type=\"button\" onclick={() => sourceMetadataProduct = product}>Source metadata</button>\n\t\t\t\t\t<button class=\"edit\" type=\"button\" onclick={() => enrichmentProduct = product}>");
replaceOnce("{#if enrichmentProduct}\n\t<ProductEnrichmentModal", "{#if sourceMetadataProduct}\n\t<CardsmithsMetadataModal product={sourceMetadataProduct} onclose={() => sourceMetadataProduct = null} onapplied={(result) => { products = products.map(p => Number(p.id) === Number(result.productId) ? { ...p, release_date: result.releaseDate || p.release_date } : p); message = 'Source metadata saved.'; }} />\n{/if}\n{#if enrichmentProduct}\n\t<ProductEnrichmentModal");
fs.writeFileSync(page,s);
console.log('Installed Cardsmiths parent metadata lookup on /admin/sets. No backups generated.');
