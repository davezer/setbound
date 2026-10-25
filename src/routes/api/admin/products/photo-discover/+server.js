// SETBOUND_PHOTO_PAGE_DISCOVERY_V1
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

// Scan product/article pages for actual image metadata. Never auto-publish.
const SOURCE_DOMAINS = ['topps.com','paniniamerica.net','upperdeck.com','beckett.com','checklistinsider.com','cardsmithsbreaks.com','cardboardconnection.com','dacardworld.com','steelcitycollectibles.com','blowoutcards.com','sportscardpro.com'];
function allowed(host) { return SOURCE_DOMAINS.some(d => host === d || host.endsWith('.' + d)); }
function urlOf(value, base, page = false) {
  try {
    const u = new URL(String(value || '').replace(/&amp;/g, '&').trim(), base);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.href.length > 1800 || /^(localhost|.*\.local|\d+\.\d+\.\d+\.\d+)$/i.test(u.hostname)) return null;
    if (page && !allowed(u.hostname.toLowerCase())) return null;
    return u.href;
  } catch { return null; }
}
function entities(s) {return String(s||'').replace(/&amp;/gi,'&').replace(/&quot;|&#34;/gi,'"').replace(/&#39;|&#x27;/gi,"'").replace(/&#x2f;/gi,'/');}
function attr(tag,key) {const m = tag.match(new RegExp('\\b'+key+'\\s*=\\s*(?:"([^"]*)"|\\x27([^\\x27]*)\\x27)','i'));return entities(m?.[1]||m?.[2]||'');}
function tokenize(value) {return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').split(' ').filter(Boolean);}
function productTokens(p) {return [...new Set(tokenize(p.name).filter(t=>t.length>3 && !['panini','topps','upper','deck','trading','cards','football','baseball','basketball','hockey','2022','2023','2024','2025','2026'].includes(t)))];}
function likelyPage(title,p) {
  const text=tokenize(title).join(' '), tokens=productTokens(p);
  const matched=tokens.filter(t=>text.includes(t)).length;
  return matched >= Math.min(2,tokens.length) && (text.includes(String(p.year)) || !/\b20\d{2}\b/.test(text));
}
function discoverSearchLinks(html,base) {
  const found=[];
  for(const m of html.matchAll(/<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)')/gi)) {
    let raw=entities(m[1]||m[2]);
    try {const u=new URL(raw,base);if(u.searchParams.has('uddg')) raw=u.searchParams.get('uddg'); else if(u.searchParams.has('url') && /bing\.com/.test(u.hostname)) raw=u.searchParams.get('url');}catch{}
    const u=urlOf(raw,base,true);if(u && !found.includes(u)) found.push(u);
    if(found.length>=35)break;
  }
  return found;
}
function candidateImages(html,page,p) {
  const title=(html.match(/<title[^>]*>([\s\S]{0,250}?)<\/title>/i)||[])[1]||'';
  const ogTitle=(html.match(/<meta\s+[^>]*(?:property|name)=["']og:title["'][^>]*>/i)||[])[0];
  const pageTitle=entities(ogTitle?attr(ogTitle,'content'):title).replace(/<[^>]+>/g,' ');
  if(!likelyPage(pageTitle,p)) return [];
  const result=[], seen=new Set();
  function add(raw,rank,label) {
    const u=urlOf(entities(raw),page);if(!u||seen.has(u))return;
    if(/(?:logo|avatar|favicon|icon|sprite|placeholder|watermark|banner|masthead|header)/i.test(new URL(u).pathname))return;
    if(!/\.(?:jpe?g|png|webp|avif)(?:$|[?#])|\/image\/|\/images\/|\/media\/|imgix|shopify/i.test(u))return;
    seen.add(u);result.push({url:u,thumbnail:u,source:new URL(page).hostname,rank,label});
  }
  for(const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag=m[0],prop=(attr(tag,'property')||attr(tag,'name')).toLowerCase();
    if(['og:image','og:image:secure_url','twitter:image','twitter:image:src'].includes(prop)) add(attr(tag,'content'),0,'Page product image');
  }
  for(const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag=m[0],desc=[attr(tag,'alt'),attr(tag,'title'),attr(tag,'class')].join(' ');
    const text=tokenize(desc).join(' ');
    const matches=productTokens(p).filter(t=>text.includes(t)).length;
    if(matches>=Math.min(2,productTokens(p).length) && /box|hobby|product|pack|sealed|chronicles|donruss|prizm|optic/i.test(desc+' '+p.name)) add(attr(tag,'data-src')||attr(tag,'src'),1,'Product image');
  }
  return result.slice(0,6);
}
async function fetchPage(fetcher,url) {
  try {
    const res=await fetcher(url,{redirect:'manual',headers:{accept:'text/html'},signal:AbortSignal.timeout(5500)});
    if(!res.ok || !/text\/html/i.test(res.headers.get('content-type')||''))return null;
    if(Number(res.headers.get('content-length')||0)>1200000)return null;
    return (await res.text()).slice(0,1200000);
  }catch{return null;}
}
async function searchPages(fetcher,query) {
  const urls=[];
  const searches=[
    'https://www.bing.com/search?q='+encodeURIComponent(query),
    'https://www.google.com/search?q='+encodeURIComponent(query),
    'https://www.bing.com/search?q='+encodeURIComponent(query+' site:beckett.com/news')
  ];
  for(const target of searches){
    const html=await fetchPage(fetcher,target);if(!html)continue;
    for(const u of discoverSearchLinks(html,target))if(!urls.includes(u))urls.push(u);
    if(urls.length>=6)break;
  }
  return urls.slice(0,8);
}
export async function POST({request,platform,locals,fetch}) {
  if(!locals.isAdmin)return json({message:'Admin access required.'},{status:403});
  const body=await request.json().catch(()=>({}));const id=Number(body.productId);
  if(!Number.isSafeInteger(id)||id<1)return json({message:'Invalid product.'},{status:400});
  const database=db(platform);
  const p=await database.prepare(`SELECT p.id,p.name,p.year,m.name manufacturer_name,s.source_url FROM products p JOIN manufacturers m ON m.id=p.manufacturer_id LEFT JOIN sources s ON s.id=p.primary_source_id WHERE p.id=?`).bind(id).first();
  if(!p)return json({message:'Set not found.'},{status:404});
  const title=String(p.name||'').replace(/^20\d{2}\s+/,'').trim();
  const query='"'+p.year+' '+title+'" '+p.manufacturer_name+' trading cards hobby box';
  const pages=[];
  const source=urlOf(p.source_url,undefined,true);
  if(source)pages.push(source);
  for(const page of await searchPages(fetch,query))if(!pages.includes(page))pages.push(page);
  const results=[],seen=new Set();let inspected=0;
  for(const page of pages.slice(0,8)) {
    const html=await fetchPage(fetch,page);if(!html)continue;inspected++;
    for(const candidate of candidateImages(html,page,p)){
      if(seen.has(candidate.url))continue;seen.add(candidate.url);results.push(candidate);
      if(results.length>=12)break;
    }
    if(results.length>=12)break;
  }
  results.sort((a,b)=>a.rank-b.rank);
  return json({ok:true,candidates:results.map(({rank,label,...rest})=>({...rest,label})),message:results.length?'':inspected?'Found product pages, but no confidently matched product images.':'No accessible matching product pages found; search engines may restrict server requests.',pagesChecked:inspected,backend:'product-pages'}, {headers:{'cache-control':'no-store'}});
}
