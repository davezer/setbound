import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const relative={
  research:'src/routes/api/admin/products/ai-research/+server.js',
  modal:'src/lib/components/ProductEnrichmentModal.svelte',
  save:'src/routes/api/admin/source-harvester/apply-enrichment/+server.js',
  helper:'src/lib/server/research-v4.js',
  artwork:'src/routes/api/admin/products/official-artwork/+server.js'
};
const filename=k=>path.join(root,relative[k]);
const read=k=>fs.readFileSync(filename(k),'utf8');
const requireMatch=(condition,label)=>{if(!condition) throw new Error('Expected code missing: '+label+'. No files changed.');};
function replaceOnce(value, oldValue, newValue, label) {
  requireMatch(value.includes(oldValue),label);
  return value.replace(oldValue,newValue);
}
try {
  const originals={research:read('research'),modal:read('modal'),save:read('save')};
  requireMatch(fs.existsSync(filename('helper')) && fs.existsSync(filename('artwork')),'V4 src/ files (extract ZIP into project root)');
  requireMatch(!originals.research.includes('research-v4.js'),'V4 is already installed; do not run again');
  const modified={...originals};
  // Existing research endpoint handles factual text only. Artwork is now separately requested.
  modified.research=replaceOnce(modified.research,
    "import { db } from '$lib/server/db';",
    "import { db } from '$lib/server/db';\nimport { cleanResearchCopy } from '$lib/server/research-v4.js';",'research imports');
  requireMatch(modified.research.includes('function cleanCopy(raw) {'),'cleanCopy');
  const cleanStart=modified.research.indexOf('function cleanCopy(raw) {');
  const cleanEnd=modified.research.indexOf('\nfunction readImages(',cleanStart);
  requireMatch(cleanEnd>cleanStart,'research cleanCopy function boundary');
  modified.research=modified.research.slice(0,cleanStart)+"function cleanCopy(raw) { return cleanResearchCopy(raw); }\n"+modified.research.slice(cleanEnd+1);
  // Do not run image scraping when user clicks Research with AI.
  const scrapeStart=modified.research.indexOf('  const candidates=[];');
  const scrapeEnd=modified.research.indexOf('  const releaseDate=',scrapeStart);
  requireMatch(scrapeStart>=0 && scrapeEnd>scrapeStart,'research image pipeline');
  modified.research=modified.research.slice(0,scrapeStart)+"  const images=[]; // Artwork is retrieved independently from approved source pages.\n"+modified.research.slice(scrapeEnd);
  modified.research=modified.research.replace('and "product box image"','');
  modified.research=modified.research.replace('no citations/links','no citations, no links, no prices, no MSRP or purchase information');
  modified.research=modified.research.replace('clear plain-English box breakdown, no links/citations','clear factual box breakdown only; no links, citations, prices, MSRP, or purchasing language');
  modified.research=modified.research.replace("warning:images.length?'Research is unverified. Confirm that artwork and specs match the exact product.':'No verified product image was retrieved. Artwork can be uploaded manually; do not use unrelated artwork.'", "warning:'Review all source-backed descriptions before saving. Use Find official artwork for product images.'");
  // UI keeps the previous draft during re-research and handles artwork separately.
  modified.modal=replaceOnce(modified.modal,"  let images = $state([]);", "  let images = $state([]);\n  let artworkBusy = $state(false);\n  let artworkMessage = $state('');",'modal artwork state');
  modified.modal=replaceOnce(modified.modal,"busy=true; error=''; warning=''; draft=null;", "busy=true; error=''; warning='';",'modal research state');
  modified.modal=replaceOnce(modified.modal,"busy=true;error='';warning='';draft=null;", "busy=true;error='';warning='';",'modal existing sources state');
  modified.modal=replaceOnce(modified.modal,"    images=value.images||[];", "    // Do not discard previously verified artwork during unrelated text research.\n    if ((value.images || []).length) images=value.images;",'modal candidate retention');
  modified.modal=replaceOnce(modified.modal,"    selectedImage=''; manualImage='';", "    if (!images.some(x=>x.url===selectedImage)) { selectedImage=''; applyImage=false; }",'modal selected image retention');
  modified.modal=replaceOnce(modified.modal,"    applyImage=false;\n  }\n  async function apply()", "  }\n  async function findArtwork(cachedOnly=false) {\n    artworkBusy=true; artworkMessage='';\n    try {\n      const response=await fetch('/api/admin/products/official-artwork',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({productId:product.id,cachedOnly})});\n      const result=await response.json();\n      if(!response.ok) throw new Error(result.message||'Could not find official artwork.');\n      images=result.images||[];\n      artworkMessage=result.warning|| (images.length+' candidate image(s) available.');\n      if(!images.some(x=>x.url===selectedImage)) { selectedImage=''; applyImage=false; }\n    } catch(e) { artworkMessage=e?.message||'Artwork search failed.'; }\n    finally { artworkBusy=false; }\n  }\n  async function apply()",'modal artwork request');
  modified.modal=replaceOnce(modified.modal,
    '<button type="button" class="secondary" onclick={existingSources} disabled={busy||applying}>Try existing sources</button>',
    '<button type="button" class="secondary" onclick={existingSources} disabled={busy||applying}>Try existing sources</button><button type="button" class="secondary" onclick={()=>findArtwork(false)} disabled={artworkBusy||applying}>{artworkBusy?\'Finding artwork…\':\'Find official artwork\'}</button>', 'modal artwork button');
  modified.modal=replaceOnce(modified.modal,
    '<p class="note">AI research uses OpenAI web search and may incur API charges. Source links and box specifications must be checked before approval.</p>',
    '<p class="note">Research details and official artwork separately. Only Topps or Checklist Insider pages are searched for Topps artwork. All fields require approval.</p>{#if artworkMessage}<p class="note" role="status">{artworkMessage}</p>{/if}', 'modal artwork message');
  // Remove manually pasted image URLs, which cannot establish approved source provenance.
  modified.modal=modified.modal.replace(/<label class="field"><span>Verified product image URL \(optional\)<\/span><input[^>]*\/><\/label>/g,'');

  modified.modal=modified.modal.replaceAll('manualImage.trim() || selectedImage','selectedImage');
  modified.modal=modified.modal.replace(/\s*let manualImage = \$state\(''\);/, '');
  // The save endpoint must reject anything that was not retained in the official artwork cache.
  modified.save=replaceOnce(modified.save,"import { db } from '$lib/server/db';",
    "import { db } from '$lib/server/db';\nimport { cleanResearchCopy, readArtworkCache, fetchImage } from '$lib/server/research-v4.js';",'save imports');
  modified.save=modified.save.replace('const overview = cleanCollectorCopy(body.overview) || null;', 'const overview = cleanResearchCopy(body.overview) || null;');
  modified.save=modified.save.replace('const details = cleanCollectorCopy(format?.details);','const details = cleanResearchCopy(format?.details);');
  // Some repo revisions use a different details declaration; handle both safely.
  modified.save=modified.save.replace("const details = String(format?.details || '').trim();", "const details = cleanResearchCopy(format?.details);");
  const start=modified.save.indexOf('function allowedImageUrl(value) {');
  const end=modified.save.indexOf('\nfunction cleanCollectorCopy(',start);
  requireMatch(start>=0 && end>start,'save image host validator');
  modified.save=modified.save.slice(0,start)+modified.save.slice(end+1);
  const blockStart=modified.save.indexOf('\t\tif (applyImage) {');
  const blockEnd=modified.save.indexOf('\n\t\treturn json({ ok: true, productId:',blockStart);
  requireMatch(blockStart>=0 && blockEnd>blockStart,'save artwork block');
  modified.save=modified.save.slice(0,blockStart)+`\t\tif (applyImage) {
      const approved=await readArtworkCache(platform?.env?.SET_IMAGES,product.id);
      if (!approved.some(x => x.url === imageUrl)) return json({message:'Artwork must be selected from verified official research results. Run Find official artwork again.'},{status:400});
      const image=await fetchImage(fetch,imageUrl);
      if (!image) return json({message:'The approved product image is no longer reachable.'},{status:502});
      const key=\`sets/\${product.slug}-\${crypto.randomUUID()}.\${extensionForType(image.type)}\`;
      await platform.env.SET_IMAGES.put(key,image.bytes,{httpMetadata:{contentType:image.type,cacheControl:'public, max-age=31536000, immutable'}});
      await database.prepare(\`UPDATE products SET image_key = ?, updated_at = datetime('now') WHERE id = ?\`).bind(key,product.id).run();
      if (product.image_key && product.image_key !== key) await platform.env.SET_IMAGES.delete(product.image_key);
      imageKey=key;
    }
`+modified.save.slice(blockEnd);
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const backup=path.join(root,`.setbound-v4-backup-${stamp}`);
  fs.mkdirSync(backup,{recursive:true});
  for(const [k,original] of Object.entries(originals)) {
    const destination=path.join(backup,relative[k]);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,original);
  }
  try {
    for(const [k,content] of Object.entries(modified)) fs.writeFileSync(filename(k),content);
  } catch(e) {
    for(const [k,original] of Object.entries(originals)) fs.writeFileSync(filename(k),original);
    throw e;
  }
  console.log('Setbound AI Enrichment V4 installed. Backups: '+backup);
  console.log('Run: npm run check && npm run build');
} catch(e) { console.error('Installation aborted: '+e.message); process.exitCode=1; }
