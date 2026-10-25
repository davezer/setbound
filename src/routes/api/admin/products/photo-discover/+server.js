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
function relevantTile(obj, product) {
  const text = [obj.t, obj.desc, obj.purl, obj.murl].filter(Boolean).join(' ').toLowerCase();
  const host = (() => { try { return new URL(obj.murl).hostname.toLowerCase(); } catch { return ''; } })();
  // 'Panini' alone is a sandwich; never rely on the maker name by itself.
  if (/\b(sandwich|sandwiches|recipe|recipes|grilled cheese|ciabatta|lunch|food|bistro|cafe|café|restaurant|toastie)\b/i.test(text)) return false;
  if (/\b(tasteatlas|allrecipes|foodnetwork|simplyrecipes|eatt[h]?is|sur la table|mambeno|pinterest|pinimg|vecteezy|bemyrecipe|seriouseats|mob\.co)\b/i.test(host+' '+text)) return false;
  const name = String(product.name || '').toLowerCase().replace(/^\s*\d{4}\s+/, '');
  const tokens = name.replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(s => s.length >= 4 && !['panini','topps','upper','deck','cards','trading','football','baseball','hockey','basketball','racing','2022','2023','2024','2025','2026'].includes(s));
  const core = [...new Set(tokens)];
  const matching = core.filter(t => text.includes(t));
  // Require distinctive product wording, not just the maker or a sport.
  if (!matching.length || (core.length>=3 && matching.length < 2)) return false;
  if (!/\b(card|cards|trading|hobby|blaster|booster|wax|collectib|box|pack|chronicles|donruss|prizm|select|optic|bowman|stadium|heritage|finest)\b/i.test(text)) return false;
  const year = String(product.year || '');
  if (/^20\d{2}$/.test(year) && /\b20\d{2}\b/.test(text) && !text.includes(year)) return false;
  return true;
}
function candidatesFromBing(html, product) {
  const list = [], seen = new Set();
  function add(obj) {
    if (!obj || !relevantTile(obj,product)) return;
    const url=cleanImage(obj.murl),thumbnail=cleanImage(obj.turl);
    if (!url || seen.has(url)) return;
    seen.add(url);
    list.push({url,thumbnail:thumbnail||url,source:new URL(url).hostname});
  }
  for (const match of html.matchAll(/\bm\s*=\s*(["'])([\s\S]*?)\1/gi)) {
    try { add(JSON.parse(decode(match[2]))); } catch {}
    if (list.length >= 12) break;
  }
  // Do not use unlabelled murl fallback: without title/page context it can return lunch.
  return list.slice(0,12);
}

export async function POST({request,platform,locals,fetch}) {
  if(!locals.isAdmin)return json({message:'Admin required.'},{status:403});
  const body=await request.json().catch(()=>({})),id=Number(body.productId);
  if(!Number.isSafeInteger(id)||id<=0)return json({message:'Invalid set.'},{status:400});
  const product=await db(platform).prepare('SELECT p.id,p.name,p.year,m.name manufacturer_name FROM products p JOIN manufacturers m ON p.manufacturer_id=m.id WHERE p.id=?').bind(id).first();
  if(!product)return json({message:'Set not found.'},{status:404});
  const title=String(product.name||'').replace(/^\s*20\d{2}\s+/,'').trim();
  const brand=String(product.manufacturer_name||'').trim();
  const query=[product.year, brand.toLowerCase()==='panini'?'"Panini America"':brand, '"'+title+'"', 'trading cards sealed hobby box -sandwich -recipe -food -lunch'].filter(Boolean).join(' ');
  let html='';
  try {
    const r=await fetch('https://www.bing.com/images/search?q='+encodeURIComponent(query)+'&form=HDRSC3',{redirect:'manual',headers:{accept:'text/html'},signal:AbortSignal.timeout(12000)});
    if(!r.ok)return json({ok:true,candidates:[],message:'Image search provider returned HTTP '+r.status+'. Try the external search link.'});
    if(Number(r.headers.get('content-length')||0)>1500000)return json({ok:true,candidates:[],message:'Image search response too large.'});
    html=(await r.text()).slice(0,1500000);
  } catch {return json({ok:true,candidates:[],message:'Image provider temporarily unavailable. Try the external search link.'});}
  const candidates=candidatesFromBing(html, product);
  return json({ok:true,candidates,message:candidates.length?'':'Search returned no parseable image tiles. Bing may have blocked the request or changed its page format.'},{headers:{'cache-control':'no-store'}});
}
