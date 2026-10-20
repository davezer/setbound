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
 const tags=[...html.matchAll(/<meta\b[^>]*>/gi)].map(m=>m[0]);
 const value=tags.find(t=>/\bname\s*=\s*["']description["']/i.test(t));
 const raw=value?attr(value,'content'):'';
 // Description is an editable source excerpt; don't append unrelated commerce copy.
 return raw && raw.length>=35&&!/buy now|lowest ask|ebay listings/i.test(raw)?raw.slice(0,650):'';
}
function extractSpecs(html){
 // The site's comparison table is organized in columns, not per-box cards.
 const rows=[];
 for(const table of html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)){
   const tr=[...table[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(r=>[...r[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)].map(c=>strip(c[1]))).filter(x=>x.length>1);
   const header=tr.find(r=>r.slice(1).filter(x=>nameToKey(x)).length>=2);
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
function candidates(html,base){
 const found=new Set();
 for(const m of html.matchAll(/<meta\b[^>]*>/gi)){
   if(!/(?:property|name)\s*=\s*["'](?:og:image|twitter:image)["']/i.test(m[0]))continue;
   const u=imageUrl(attr(m[0],'content'),base);if(u)found.add(u);
 }
 // og:image may be a generic site banner; the admin must review it.
 return [...found].slice(0,4);
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
 const r=await fetchFn(url,{redirect:'manual',headers:{accept:'text/html'}});
 if(!r.ok||!String(r.headers.get('content-type')||'').toLowerCase().includes('text/html'))throw Error('Source returned HTTP '+r.status+' or non-HTML content.');
 if(Number(r.headers.get('content-length')||0)>MAX_HTML)throw Error('Source page too large.');
 const html=await r.text();if(html.length>MAX_HTML)throw Error('Source page too large.');return html;
}
async function getFacts(fetchFn,url){const html=await sourcePage(fetchFn,url);return {overview:description(html),formats:Object.fromEntries(Object.entries(extractSpecs(html)).map(([key,values])=>[key,conciseBoxDetails(values)])),images:candidates(html,url)};}
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
  const wantOverview=body.applyOverview===true&&!p.product_notes&&facts.overview;
  const image=typeof body.imageUrl==='string'&&facts.images.includes(body.imageUrl)&&!p.image_key?body.imageUrl:null;
  const updates=[];
  if(wantOverview)updates.push(database.prepare("UPDATE products SET product_notes=?, updated_at=datetime('now') WHERE id=? AND (product_notes IS NULL OR TRIM(product_notes)='')").bind(facts.overview,id));
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
