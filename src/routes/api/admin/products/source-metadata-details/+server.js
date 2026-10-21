import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

const HOST='cardsmithsbreaks.com';
const KEYS={hobby:'Hobby',jumbo:'Jumbo',breaker:'Breaker Delight',blaster:'Blaster / Value',mega:'Mega',retail:'Retail',fat_pack:'Fat Pack',hanger:'Hanger',collector:'Collector / Tin'};
const MAX_HTML=3_000_000;

function conciseBoxDetails(value) {
  const text=Array.isArray(value)?value.join(' · '):String(value||'');
  const parts=text.split(/\s*[·\n]\s*/).map(s=>s.trim()).filter(Boolean);
  const count=parts.find(p=>/^Packs\s*[×x]\s*cards\s*:/i.test(p));
  if(!count)return text;
  const match=count.match(/:\s*(\d+)\s*[×x]\s*(\d+)/i);
  if(!match)return text;
  const autos=parts.find(p=>/^Autographs\s*:/i.test(p));
  let hits='Not specified';
  if(autos){
    const v=autos.replace(/^Autographs\s*:\s*/i,'').trim();
    hits=/^(?:none|0)(?:\b|$)/i.test(v)?'None':v.replace(/^(\d+)\s+guaranteed\b/i,(_,n)=>n+' autograph'+(n==='1'?'':'s')+' guaranteed');
  }
  return 'Cards per pack: '+match[2]+'\nPacks per box: '+match[1]+'\nGuaranteed hits: '+hits;
}

function decode(s){return String(s||'').replace(/&(?:amp|#38);/gi,'&').replace(/&(?:quot|#34);/gi,'"').replace(/&#(?:39|0*39);|&apos;/gi,"'").replace(/&nbsp;/gi,' ').replace(/&ndash;/gi,'–').replace(/&mdash;/gi,'—').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)));}
function strip(s){return decode(String(s||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();}
function attr(html,key){const a=String(html).match(new RegExp('\\b'+key+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')','i'));return decode(a?.[1]??a?.[2]??'');}
function approved(raw){try{const u=new URL(raw);return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&[HOST,'www.'+HOST].includes(u.hostname)&&/^\/full-checklist\/[a-z0-9-]+\/$/i.test(u.pathname)?u.href:null;}catch{return null;}}
function imageUrl(raw,base){try{const u=new URL(decode(raw),base);if(u.protocol!=='https:'||u.port||u.username||u.password)return null;const h=u.hostname.toLowerCase();if(!([HOST,'www.'+HOST].includes(h)||h.endsWith('.wp.com')||h==='i0.wp.com'||h==='i1.wp.com'||h==='i2.wp.com'))return null;return u.href;}catch{return null;}}
function nameToKey(s){const v=s.toLowerCase();if(/breaker|delight/.test(v))return 'breaker';if(/jumbo/.test(v))return 'jumbo';if(/hobby/.test(v))return 'hobby';if(/blaster|value/.test(v))return 'blaster';if(/mega/.test(v))return 'mega';if(/retail/.test(v))return 'retail';if(/fat pack/.test(v))return 'fat_pack';if(/hanger/.test(v))return 'hanger';if(/collector|tin/.test(v))return 'collector';return null;}
function description(html){
  const heading=strip(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||'').replace(/\s+Checklist(?:\s*&\s*Odds)?$/i,'').trim();
  if(!heading)return '';
  // Use descriptive release facts in the page's introductory copy; never use the generic SEO checklist tally.
  const intro=strip(html.slice(Math.max(0,html.search(/<h1\b/i)),Math.min(html.length,Math.max(0,html.search(/<h1\b/i))+16000)));
  const chase=intro.match(/(?:Chase|Highlights? include|Features? include)\s+([^.!?]{18,250})[.!?]/i);
  if(chase){
    const fact=chase[0].trim().replace(/\s+/g,' ');
    if(!/filter by|search|ebay|odds and print runs|checklist:/i.test(fact))return heading+' features '+fact.replace(/^Chase\s+/i,'chase ');
  }
  // No meaningful release highlights present: leave blank for editorial review.
  return '';
}

function extractSpecs(html){
 // The site's comparison table is organized in columns, not per-box cards.
 const rows=[];
 for(const table of html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)){
   const tr=[...table[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(r=>[...r[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)].map(c=>strip(c[1]))).filter(x=>x.length>1);
   const header=tr.find(r=>r.slice(1).filter(x=>nameToKey(x)).length>=1);
   if(!header)continue;
   const start=tr.indexOf(header);
   const map=header.slice(1).map(v=>nameToKey(v));
   const properties={};
   for(let i=start+1;i<tr.length;i++){
     const r=tr[i];if(!r.length)continue;
     const label=r[0].toLowerCase();
     if(!/packs|cards per box|boxes per case|autograph|numbered \/ box|parallels \/ box|inserts \/ box/.test(label))continue;
     for(let j=1;j<r.length;j++){const key=map[j-1];if(!key||!r[j]||r[j]==='—')continue;(properties[key]??=[]).push(`${r[0]}: ${r[j]}`);}
   }
   if(Object.keys(properties).length)return properties;
 }
 return {};
}

function singleFormatSpecs(html){
  // Some parent pages only provide a summary instead of a comparison table.
  const head=html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/i);
  const start=head?html.indexOf(head[0])+head[0].length:0;
  const intro=strip(html.slice(start,start+24000));
  const key=nameToKey(intro.slice(0,300))||'hobby';
  let packs=null,cards=null,hits=null;
  for(const pattern of [/(?:Hobby|Jumbo|Blaster|Mega|Value|Retail)?\s*boxes?\s+(?:hold|contain|include|have)\s+(\d+)\s+packs?\s+(?:of|with|at)\s+(\d+)\s+cards?/i,/(\d+)\s+packs?\s+(?:of|with|at)\s+(\d+)\s+cards?\s+(?:per\s+)?(?:box|pack)/i]){
    const found=intro.match(pattern);if(found){packs=found[1];cards=found[2];break;}
  }
  if(!packs){packs=intro.match(/(\d+)\s+Packs\s*\/\s*Box/i)?.[1]||null;}
  if(!cards&&packs){const total=intro.match(/(\d+)\s+Cards\s*\/\s*Box/i)?.[1];if(total&&Number(total)%Number(packs)===0)cards=String(Number(total)/Number(packs));}
  const nearby=intro.slice(0,1200);
  const guarantee=nearby.match(/(?:with|includes?|guarantees?|containing)\s+(\d+)\s+(?:guaranteed\s+)?autographs?\b/i)||nearby.match(/(\d+)\s+Auto\s+Guaranteed/i);
  if(guarantee)hits=guarantee[1]+' autograph'+(guarantee[1]==='1'?'':'s');
  if(!packs&&!cards&&!hits)return {};
  return {[key]:[...(cards?['Cards per pack: '+cards]:[]),...(packs?['Packs per box: '+packs]:[]),...(hits?['Guaranteed hits: '+hits]:[] )].join('\n')};
}

function candidates(html,base){
 const found=new Map();
 for(const m of html.matchAll(/<meta\b[^>]*>/gi)){
   if(!/(?:property|name)\s*=\s*["'](?:og:image|twitter:image)["']/i.test(m[0]))continue;
   const u=imageUrl(attr(m[0],'content'),base);if(u){const parsed=new URL(u);const signature=parsed.pathname.replace(/-\d+x\d+(?=\.[a-z]+$)/i,'').toLowerCase();if(!found.has(signature))found.set(signature,u);}
 }
 // og:image may be a generic site banner; the admin must review it.
 return [...found.values()].slice(0,4);
}
async function productAndParent(database,id){
 const p=await database.prepare(`SELECT p.id,p.slug,p.name,p.product_notes,p.image_key,p.primary_source_id,s.source_url,s.original_filename FROM products p LEFT JOIN sources s ON s.id=p.primary_source_id WHERE p.id=?`).bind(id).first();
 if(!p)throw Error('Product not found.');
 const records=await database.prepare(`SELECT entry_json FROM source_harvester_cache WHERE source='cardsmithsbreaks' AND json_extract(entry_json,'$.archiveParent')=1 LIMIT 3000`).all();
 const slug=String(p.original_filename||'').replace(/\.csv$/i,'').toLowerCase();
 const matches=[];
 for(const row of records.results||[]){let e;try{e=JSON.parse(row.entry_json)}catch{continue}const u=approved(e.pageUrl);if(!u)continue;const sourceSlug=new URL(u).pathname.split('/').filter(Boolean).at(-1);if(approved(p.source_url)===u||slug===sourceSlug||p.slug===sourceSlug)matches.push(u);}
 const unique=[...new Set(matches)];if(unique.length!==1)throw Error(unique.length?'Multiple parent source matches. Review manually.':'No exact parent checklist matched this product.');
 return {product:p,url:unique[0]};
}
async function sourcePage(fetchFn,url){
 const r=await fetchFn(url,{redirect:'manual',headers:{accept:'text/html'},signal: AbortSignal.timeout(12000)});
 if(!r.ok||!String(r.headers.get('content-type')||'').toLowerCase().includes('text/html'))throw Error('Source returned HTTP '+r.status+' or non-HTML content.');
 if(Number(r.headers.get('content-length')||0)>MAX_HTML)throw Error('Source page too large.');
 const html=await r.text();if(html.length>MAX_HTML)throw Error('Source page too large.');return html;
}
async function getFacts(fetchFn,url){const html=await sourcePage(fetchFn,url);return {overview:description(html),formats:Object.fromEntries(Object.entries(Object.keys(extractSpecs(html)).length?extractSpecs(html):singleFormatSpecs(html)).map(([key,values])=>[key,conciseBoxDetails(values)])),images:candidates(html,url)};}
async function getImage(fetchFn,url){
 const r=await fetchFn(url,{redirect:'manual',headers:{accept:'image/webp,image/png,image/jpeg,image/avif'}});
 if(!r.ok)throw Error('Selected image unavailable (HTTP '+r.status+').');
 const type=String(r.headers.get('content-type')||'').split(';')[0].toLowerCase();const exts={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/avif':'avif'};
 if(!exts[type])throw Error('Selected URL did not return a supported image.');
 if(Number(r.headers.get('content-length')||0)>6_000_000)throw Error('Image too large.');
 const bytes=new Uint8Array(await r.arrayBuffer());if(bytes.length<100||bytes.length>6_000_000)throw Error('Invalid image size.');
 const signature=type==='image/jpeg'?bytes[0]===255&&bytes[1]===216:type==='image/png'?bytes[0]===137&&bytes[1]===80:type==='image/webp'?String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP':String.fromCharCode(...bytes.slice(4,8))==='ftyp'&&/avif|avis/.test(String.fromCharCode(...bytes.slice(8,20)));
 if(!signature)throw Error('Image data does not match content type.');return {bytes,type,ext:exts[type]};
}
export async function POST({request,platform,fetch}){
 const body=await request.json().catch(()=>({}));const id=Number(body.productId);
 if(!Number.isSafeInteger(id)||id<=0)return json({message:'Invalid product ID.'},{status:400});
 try{
  const database=db(platform);const {product:p,url}=await productAndParent(database,id);const facts=await getFacts(fetch,url);
  if(body.mode==='preview'){
    const result=await database.prepare('SELECT format_key,details FROM product_formats WHERE product_id=?').bind(id).all();
    return json({ok:true,sourceUrl:url,...facts,existingOverview:p.product_notes||'',hasImage:!!p.image_key,existingFormats:Object.fromEntries((result.results||[]).map(x=>[x.format_key,x.details]))});
  }
  if(body.mode!=='apply')return json({message:'Invalid operation.'},{status:400});
  const selected=Array.isArray(body.formats)?[...new Set(body.formats.filter(x=>typeof x==='string'&&KEYS[x]&&facts.formats[x]))]:[];
  const editedOverview=String(body.overview||facts.overview||'').replace(/<[^>]*>/g,'').trim().slice(0,650);
  const wantOverview=body.applyOverview===true&&!p.product_notes&&!!facts.overview&&!!editedOverview;
  const image=typeof body.imageUrl==='string'&&facts.images.includes(body.imageUrl)&&!p.image_key?body.imageUrl:null;
  const updates=[];
  if(wantOverview)updates.push(database.prepare("UPDATE products SET product_notes=?, updated_at=datetime('now') WHERE id=? AND (product_notes IS NULL OR TRIM(product_notes)='')").bind(editedOverview,id));
  for(const key of selected){updates.push(database.prepare("INSERT INTO product_formats (product_id,format_key,label,details,sort_order,updated_at) VALUES (?,?,?,?,100,datetime('now')) ON CONFLICT(product_id,format_key) DO UPDATE SET details=excluded.details, updated_at=datetime('now') WHERE substr(product_formats.details, 1, 12) = 'Listed as a '").bind(id,key,KEYS[key]+' Box Breakdown',facts.formats[key]));}
  if(!updates.length&&!image)return json({message:'No eligible empty metadata selected.'},{status:409});
  // Read and validate the approved image before changing database state.
  let img=null;if(image){if(!platform?.env?.SET_IMAGES)throw Error('Image storage unavailable.');img=await getImage(fetch,image);}
  if(updates.length)await database.batch(updates);
  let imageKey=null;
  if(img){const key=`sets/${p.slug}-${crypto.randomUUID()}.${img.ext}`;await platform.env.SET_IMAGES.put(key,img.bytes,{httpMetadata:{contentType:img.type,cacheControl:'public, max-age=31536000, immutable'}});const result=await database.prepare("UPDATE products SET image_key=?,updated_at=datetime('now') WHERE id=? AND (image_key IS NULL OR image_key='')").bind(key,id).run();if(Number(result.meta?.changes||0))imageKey=key;else await platform.env.SET_IMAGES.delete(key);}
  return json({ok:true,productId:id,overviewSaved:!!wantOverview,formatsAdded:selected.length,imageKey});
 }catch(e){return json({message:e?.message||'Source metadata lookup failed.'},{status:502});}
}
