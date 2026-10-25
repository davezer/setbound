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
// SETBOUND_IMAGE_DISCOVERY_PARSER_V2
function decode(value) {
  return String(value || '')
    .replace(/&quot;|&#34;|&#x22;/gi, '"')
    .replace(/&#39;|&#x27;|&apos;/gi, "'")
    .replace(/&amp;|&#38;|&#x26;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/\\u0026/gi, '&').replace(/\\\//g, '/');
}
function candidatesFromBing(html) {
  const list = [], seen = new Set();
  function add(rawUrl, rawThumb) {
    const url=cleanImage(rawUrl), thumbnail=cleanImage(rawThumb);
    if (!url || seen.has(url)) return;
    seen.add(url);
    list.push({url,thumbnail:thumbnail||url,source:new URL(url).hostname});
  }
  // Bing's tile metadata is an HTML attribute containing entity-escaped JSON.
  // Do not stop an attribute at &quot;: those entities occur INSIDE the value.
  for(const match of html.matchAll(/\bm\s*=\s*(["'])([\s\S]*?)\1/gi)) {
    try {
      const obj=JSON.parse(decode(match[2]));
      add(obj.murl,obj.turl);
    } catch {}
    if(list.length>=12) break;
  }
  // Support other page layouts that embed metadata as JSON rather than attributes.
  if(list.length<12) {
    const decoded=decode(html);
    const matches=[...decoded.matchAll(/"murl"\s*:\s*"((?:\\.|[^"\\])+)"[\s\S]{0,1000}?"turl"\s*:\s*"((?:\\.|[^"\\])+)"/gi)];
    for(const match of matches) {
      try{add(JSON.parse('"'+match[1]+'"'),JSON.parse('"'+match[2]+'"'));}catch{}
      if(list.length>=12)break;
    }
    // Some Bing layouts put the thumbnail before the full-size URL.
    for(const match of decoded.matchAll(/"murl"\s*:\s*"((?:\\.|[^"\\])+)"/gi)) {
      if(list.length>=12)break;
      try{add(JSON.parse('"'+match[1]+'"'),null);}catch{}
    }
  }
  return list.slice(0,12);
}
export async function POST({request,platform,locals,fetch}) {
  if(!locals.isAdmin)return json({message:'Admin required.'},{status:403});
  const body=await request.json().catch(()=>({})),id=Number(body.productId);
  if(!Number.isSafeInteger(id)||id<=0)return json({message:'Invalid set.'},{status:400});
  const product=await db(platform).prepare('SELECT p.id,p.name,p.year,m.name manufacturer_name FROM products p JOIN manufacturers m ON p.manufacturer_id=m.id WHERE p.id=?').bind(id).first();
  if(!product)return json({message:'Set not found.'},{status:404});
  const query=[String(product.name).includes(String(product.year))?'':product.year,product.manufacturer_name,product.name,'trading cards box'].filter(Boolean).join(' ');
  let html='';
  try {
    const r=await fetch('https://www.bing.com/images/search?q='+encodeURIComponent(query)+'&form=HDRSC3',{redirect:'manual',headers:{accept:'text/html'},signal:AbortSignal.timeout(12000)});
    if(!r.ok)return json({ok:true,candidates:[],message:'Image search provider returned HTTP '+r.status+'. Try the external search link.'});
    if(Number(r.headers.get('content-length')||0)>1500000)return json({ok:true,candidates:[],message:'Image search response too large.'});
    html=(await r.text()).slice(0,1500000);
  } catch {return json({ok:true,candidates:[],message:'Image provider temporarily unavailable. Try the external search link.'});}
  const candidates=candidatesFromBing(html);
  return json({ok:true,candidates,message:candidates.length?'':'Search returned no parseable image tiles. Bing may have blocked the request or changed its page format.'},{headers:{'cache-control':'no-store'}});
}
