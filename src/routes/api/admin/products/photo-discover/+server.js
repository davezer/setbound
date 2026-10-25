import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

// Best-effort public image index discovery. Fail closed and return zero candidates
// rather than substituting an unrelated photo. No result is automatically saved.
function cleanImage(value) {
  try {
    const u = new URL(String(value || '').replace(/&amp;/g, '&'));
    if (u.protocol !== 'https:' || u.port || u.username || u.password) return null;
    if (/^(?:localhost|.*\.local|\d+\.\d+\.\d+\.\d+|\[.*\])$/i.test(u.hostname)) return null;
    if (u.href.length > 1900) return null;
    return u.href;
  } catch { return null; }
}
function decode(value){return String(value||'').replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/\\u0026/g,'&').replace(/\\\//g,'/');}
function candidatesFromBing(html) {
  const list=[],seen=new Set();
  // Bing encodes the source image URL and thumbnail in the 'm' attribute on image tiles.
  const attrs=[...html.matchAll(/\bm\s*=\s*(?:&quot;|\")((?:[^\"]|&quot;)*?)(?:&quot;|\")/g)];
  for(const hit of attrs){
    let obj;try{obj=JSON.parse(decode(hit[1]));}catch{continue;}
    const url=cleanImage(obj.murl),thumbnail=cleanImage(obj.turl);
    if(!url||seen.has(url))continue;
    seen.add(url);
    list.push({url,thumbnail:thumbnail||url,source:new URL(url).hostname});
    if(list.length>=12)break;
  }
  return list;
}
export async function POST({request,platform,locals,fetch}) {
  if(!locals.isAdmin)return json({message:'Admin required.'},{status:403});
  const body=await request.json().catch(()=>({})),id=Number(body.productId);
  if(!Number.isSafeInteger(id)||id<=0)return json({message:'Invalid set.'},{status:400});
  const product=await db(platform).prepare('SELECT p.id,p.name,p.year,m.name manufacturer_name FROM products p JOIN manufacturers m ON p.manufacturer_id=m.id WHERE p.id=?').bind(id).first();
  if(!product)return json({message:'Set not found.'},{status:404});
  const query=[product.year,product.manufacturer_name,product.name,'trading cards box'].join(' ');
  let html='';
  try {
    const r=await fetch('https://www.bing.com/images/search?q='+encodeURIComponent(query)+'&form=HDRSC3',{redirect:'manual',headers:{accept:'text/html'},signal:AbortSignal.timeout(12000)});
    if(!r.ok)return json({ok:true,candidates:[],message:'Image search provider returned HTTP '+r.status+'. Try the external search link.'});
    if(Number(r.headers.get('content-length')||0)>1500000)return json({ok:true,candidates:[],message:'Image search response too large.'});
    html=(await r.text()).slice(0,1500000);
  } catch {return json({ok:true,candidates:[],message:'Image provider temporarily unavailable. Try the external search link.'});}
  const candidates=candidatesFromBing(html);
  return json({ok:true,candidates,message:candidates.length?'':'No indexed image candidates returned for this query.'},{headers:{'cache-control':'no-store'}});
}
