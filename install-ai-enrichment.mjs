import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=process.cwd();
const assets=path.dirname(fileURLToPath(import.meta.url));
const app='src/routes/admin/sets/+page.svelte';
const apply='src/routes/api/admin/source-harvester/apply-enrichment/+server.js';
const modal='src/lib/components/ProductEnrichmentModal.svelte';
const research='src/routes/api/admin/products/ai-research/+server.js';
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const changes=new Map();
function exact(s,old,value,label){if(!s.includes(old))throw Error('Unexpected source code at '+label+'; stopped without writing any files.');return s.replace(old,value);}
try{
  let page=read(app);
  const start=page.indexOf('\t<div class="filter-summary backfill-summary">');
  const end=page.indexOf('\n\t<div class="list">',start);
  if(start<0||end<0)throw Error('Manage Sets backfill panel anchor not found.');
  page=page.slice(0,start)+`\t<div class="filter-summary backfill-summary"><div><strong>{visible.length.toLocaleString()}</strong> <span>of {products.length.toLocaleString()} sets</span></div><span class="topps-ready-summary">Research products individually before saving details.</span></div>\n`+page.slice(end);
  page=exact(page,'class:topps-enrich={product.has_topps_backfill} class="edit" type="button"','class="edit" type="button"','research button');
  page=exact(page,"{product.has_product_details ? 'Review enrichment' : (product.has_topps_backfill ? 'Enrich with Topps' : 'Enrich details')}","{'Research product'}",'research label');
  // Old Topps helpers can remain as unused functions, but remove their UI entirely.
  changes.set(app,page);
  let backend=read(apply);
  const old=`return url.hostname === 'xcdn.checklistinsider.com' ? url : null;`;
  const newer=`const hosts=['topps.com','upperdeck.com','paniniamerica.net','pokemon.com','pokemoncenter.com','fanaticscollect.com','checklistinsider.com','cdn.shopify.com','images.ctfassets.net','cdn11.bigcommerce.com'];\n\tif(url.port || url.username || url.password) return null;\n\treturn hosts.some(host=>url.hostname===host||url.hostname.endsWith('.'+host))?url:null;`;
  backend=exact(backend,old,newer,'image allowlist');
  backend=exact(backend,"'Only Checklist Insider CDN images can be imported.'","'Image host is not on the approved manufacturer/CDN allowlist.'",'image error');
  // Redirects are never followed during image download; avoids redirecting to private infrastructure.
  backend=exact(backend,'fetch(remote.href, { headers:',"fetch(remote.href, { redirect: 'manual', headers:",'image fetch redirects');
  changes.set(apply,backend);
  changes.set(modal,fs.readFileSync(path.join(assets,'src/lib/components/ProductEnrichmentModal.svelte'),'utf8'));
  changes.set(research,fs.readFileSync(path.join(assets,'src/routes/api/admin/products/ai-research/+server.js'),'utf8'));
  for (const [p,s] of changes) {if(!s.trim())throw Error('Empty file '+p);}
  for (const [p,s] of changes){
    const dest=path.join(root,p);fs.mkdirSync(path.dirname(dest),{recursive:true});
    if(fs.existsSync(dest)) fs.copyFileSync(dest,dest+'.before-ai-enrichment.bak');
    fs.writeFileSync(dest,s);
    process.stdout.write('Installed '+p+'\n');
  }
  console.log('Done. Run npm run check && npm run build. Backups use .before-ai-enrichment.bak.');
}catch(e){console.error('Installation aborted: '+e.message);process.exitCode=1;}
