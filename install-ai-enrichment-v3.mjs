import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const file=(p)=>path.join(root,...p.split('/'));
const updates=[];
function edit(p,fn){const f=file(p);if(!fs.existsSync(f))throw new Error(`Missing ${p}`);const old=fs.readFileSync(f,'utf8');const neu=fn(old);if(neu===old)throw new Error(`Expected V2 anchors missing in ${p}. No files changed.`);updates.push({f,old,neu});}
function replaceOnce(s,needle,replacement){if(!s.includes(needle))throw new Error(`Expected code missing: ${needle.slice(0,70)}`);return s.replace(needle,replacement)}
try{
 edit('src/routes/api/admin/products/ai-research/+server.js',s=>{
   s=replaceOnce(s,"const IMAGE_HOSTS = [...SOURCE_HOSTS,'cdn.shopify.com','images.ctfassets.net','cdn11.bigcommerce.com','xcdn.checklistinsider.com','cdn.shopifycdn.net','images.squarespace-cdn.com','shopify.com'];", "const IMAGE_HOSTS = [...SOURCE_HOSTS,'cdn.shopify.com','images.ctfassets.net','cdn11.bigcommerce.com','xcdn.checklistinsider.com','cdn.shopifycdn.net','images.squarespace-cdn.com','shopify.com','fanatics.com','fanaticsauthentic.com','fanaticsassets.com','static.fanatics.com','media.fanatics.com','images.fanatics.com','images.footballfanatics.com','cloudfront.net','imgix.net','akamaihd.net','scene7.com'];");
   const start=s.indexOf('function cleanCopy(raw) {');const end=s.indexOf('\nfunction readImages(',start);
   if(start<0||end<0)throw new Error('Missing cleanCopy function');
   s=s.slice(0,start)+`function cleanCopy(raw) {
  return String(raw || '')
    .replace(/\\[\\s*(?:https?:\\/\\/[^\\]]+|(?:www\\.)?[\\w.-]+\\.(?:com|net|org|app)[^\\]]*)\\s*\\]/gi, '')
    .replace(/\\(\\s*https?:\\/\\/[^)]+\\)/gi, '')
    .replace(/https?:\\/\\/[^\\s)]+/gi, '')
    .replace(/【[^】]+】|\\[\\s*\\d+\\s*\\]/g, '')
    .replace(/\\s*\\((?:\\s|\\d|[,.;])*\\)/g, '')
    .replace(/\\b(?:Hobby|Hanger|Mega|Jumbo|Blaster|Retail|Value|Mania|Sapphire)?\\s*(?:boxes|packs|products|items)\\s+are available for purchase[^.!?]*[.!?]/gi, '')
    .replace(/\\b(?:available for purchase|shop now|buy now|order today|purchase on the official)[^.!?]*[.!?]?/gi, '')
    .replace(/\\b(?:source|via|reference)\\s*:\\s*[^\\n]+/gi, '')
    .replace(/\\s+([,.;!?])/g, '$1')
    .replace(/[ \\t]{2,}/g, ' ')
    .replace(/\\s+\\.(?=\\s|$)/g, '.')
    .trim();
}
`+s.slice(end);
   const a=s.indexOf('async function verifiedImage(fetch, url) {');const b=s.indexOf('\nexport async function POST(',a);
   if(a<0||b<0)throw new Error('Missing verifiedImage function');
   s=s.slice(0,a)+`async function verifiedImage(fetch, url) {
  try {
    let target=url;
    for(let redirect=0;redirect<4;redirect++) {
      if(!allowed(target,IMAGE_HOSTS))return null;
      const response=await fetch(target,{method:'GET',redirect:'manual',headers:{accept:'image/avif,image/webp,image/png,image/jpeg,*/*','user-agent':'Mozilla/5.0'}});
      if([301,302,303,307,308].includes(response.status)) {
        const location=response.headers.get('location');
        if(!location)return null;
        target=new URL(location,target).href;
        continue;
      }
      const type=String(response.headers.get('content-type')||'').split(';')[0].toLowerCase();
      if(!response.ok||!['image/jpeg','image/png','image/webp','image/avif'].includes(type))return null;
      const size=Number(response.headers.get('content-length')||0);
      if(size>8*1024*1024)return null;
      await response.body?.cancel();
      return target;
    }
    return null;
  }catch{return null;}
}
`+s.slice(b);
   s=replaceOnce(s,"if(await verifiedImage(fetch,candidate.url))images.push(candidate);", "const verified=await verifiedImage(fetch,candidate.url); if(verified && !images.some(x=>x.url===verified))images.push({...candidate,url:verified});");
   return s;
 });
 edit('src/lib/components/ProductEnrichmentModal.svelte',s=>{
   s=replaceOnce(s,"  let selectedImage = $state('');", "  let selectedImage = $state('');\n  let manualImage = $state('');");
   s=replaceOnce(s,"    selectedImage='';", "    selectedImage=''; manualImage='';");
   s=replaceOnce(s,"imageUrl:selectedImage,", "imageUrl:(manualImage.trim() || selectedImage),");
   s=replaceOnce(s,"applyImage:applyImage&&Boolean(selectedImage)","applyImage:applyImage&&Boolean(manualImage.trim() || selectedImage)");
   s=replaceOnce(s,"{#if !images.length}<small>No verified supported image URL was found. You can still upload artwork manually from Manage Sets.</small>{/if}","{#if !images.length}<small>No verified image found automatically. You can paste an exact product image URL from a supported manufacturer or retailer below, or upload a local image from Manage Sets.</small>{/if}\n          <label class=\"field\"><span>Verified product image URL (optional)</span><input class=\"input\" type=\"url\" bind:value={manualImage} placeholder=\"https://.../product-image.jpg\" oninput={()=>{selectedImage='';applyImage=Boolean(manualImage.trim());}} /></label>");
   return s;
 });
 edit('src/routes/api/admin/source-harvester/apply-enrichment/+server.js',s=>{
   s=replaceOnce(s,"'shopify.com'];", "'shopify.com','fanatics.com','fanaticsauthentic.com','fanaticsassets.com','static.fanatics.com','media.fanatics.com','images.fanatics.com','images.footballfanatics.com','cloudfront.net','imgix.net','akamaihd.net','scene7.com'];");
   s=replaceOnce(s,"const details = String(format?.details || '').trim();", "const details = cleanCollectorCopy(format?.details);");
   s=replaceOnce(s,"const overview = String(body.overview || '').trim() || null;", "const overview = cleanCollectorCopy(body.overview) || null;");
   s=replaceOnce(s,"const response = await fetch(remote.href, { redirect: 'manual', headers: { accept: 'image/avif,image/webp,image/png,image/jpeg,*/*', 'user-agent': 'Mozilla/5.0 Setbound/1.0' } });", `let target = remote.href;
            let response;
            for (let hop = 0; hop < 4; hop++) {
                const safe = allowedImageUrl(target);
                if (!safe) return json({ message: 'Image redirected to an unapproved host.' }, { status: 400 });
                response = await fetch(safe.href, { redirect: 'manual', headers: { accept: 'image/avif,image/webp,image/png,image/jpeg,*/*', 'user-agent': 'Mozilla/5.0 Setbound/1.0' } });
                if (![301,302,303,307,308].includes(response.status)) break;
                const next = response.headers.get('location');
                if (!next) break;
                target = new URL(next, target).href;
            }`);
   s=replaceOnce(s,"function extensionForType(type) {", `function cleanCollectorCopy(value) {
  return String(value || '')
    .replace(/\\[\\s*(?:https?:\\/\\/[^\\]]+|(?:www\\.)?[\\w.-]+\\.(?:com|net|org|app)[^\\]]*)\\s*\\]/gi,'')
    .replace(/\\(\\s*https?:\\/\\/[^)]+\\)/gi,'')
    .replace(/https?:\\/\\/[^\\s)]+/gi,'')
    .replace(/【[^】]+】|\\[\\s*\\d+\\s*\\]/g,'')
    .replace(/\\b(?:Hobby|Hanger|Mega|Jumbo|Blaster|Retail|Value|Mania|Sapphire)?\\s*(?:boxes|packs|products|items)\\s+are available for purchase[^.!?]*[.!?]/gi,'')
    .replace(/\\b(?:available for purchase|shop now|buy now|order today|purchase on the official)[^.!?]*[.!?]?/gi,'')
    .replace(/\\s+([,.;!?])/g,'$1')
    .replace(/[ \\t]{2,}/g,' ').trim();
}
function extensionForType(type) {`);
   return s;
 });
 // Validate all patches before making any changes.
 for(const x of updates)fs.copyFileSync(x.f,x.f+'.before-ai-enrichment-v3.bak');
 for(const x of updates)fs.writeFileSync(x.f,x.neu);
 console.log('Installed AI Enrichment V3: cleaned collector copy, improved artwork verification, optional manual image URL. Backups saved.');
}catch(err){console.error('Installation aborted: '+err.message);process.exitCode=1;}
