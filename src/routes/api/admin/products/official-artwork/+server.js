import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { allowedPage, readArtworkCache, writeArtworkCache, extractCandidateImages, fetchImage } from '$lib/server/research-v4.js';

function outputText(data) {
  return typeof data.output_text === 'string' ? data.output_text :
    (data.output || []).filter(x => x.type === 'message').flatMap(x => x.content || [])
      .filter(x => x.type === 'output_text').map(x => x.text).join('\n');
}
function extractPages(text) {
  const urls = String(text).match(/https:\/\/[^\s"'<>\\]+/g) || [];
  return [...new Set(urls.map(x => x.replace(/[),.;]+$/, '')))].filter(allowedPage).slice(0,10);
}
function matchPage(html, product) {
  const match=String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
  const title=match.replace(/<[^>]*>/g,' ').toLowerCase();
  const tokens=String(product.name).toLowerCase().replace(/(?:19|20)\d\d/g,' ').replace(/[^a-z0-9]+/g,' ').split(/\s+/).filter(x=>x.length>3 && !['topps','cards','baseball','basketball','soccer','hockey','trading','major','league'].includes(x));
  return tokens.length === 0 || tokens.some(x => title.includes(x));
}
export async function POST({ request, platform, fetch }) {
  const body=await request.json().catch(()=>({}));
  const productId=Number(body.productId);
  if (!Number.isSafeInteger(productId) || productId<=0) return json({message:'Invalid product ID.'},{status:400});
  const database=db(platform);
  const product=await database.prepare(`SELECT p.id,p.name,p.year,m.name AS manufacturer_name FROM products p JOIN manufacturers m ON m.id=p.manufacturer_id WHERE p.id = ?`).bind(productId).first();
  if (!product) return json({message:'Product not found.'},{status:404});
  const bucket=platform?.env?.SET_IMAGES;
  const cached=await readArtworkCache(bucket,productId);
  if (body.cachedOnly) return json({images:cached, cached:true});
  const key=platform?.env?.OPENAI_API_KEY;
  if (!key) return json({message:'OPENAI_API_KEY is not configured.',images:cached},{status:503});
  if (!/topps/i.test(product.manufacturer_name)) return json({images:cached,warning:'Official artwork discovery currently supports Topps products only.'});
  let pages=[];
  try {
    const response=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},
      body:JSON.stringify({model:platform?.env?.SETBOUND_AI_RESEARCH_MODEL || 'gpt-4.1-mini',tools:[{type:'web_search_preview'}],
        input:[{role:'system',content:'Locate exact official product pages. Return actual web page URLs only. Never invent URLs.'},
          {role:'user',content:`Find official Topps product pages or Checklist Insider pages displaying a sealed box or product artwork for ${product.year} ${product.name}. Only topps.com or checklistinsider.com pages. Exclude other years, separate editions, and articles unrelated to this exact product. Return up to 8 fully qualified URLs, one per line.`}],max_output_tokens:750})
    });
    const data=await response.json();
    if (!response.ok) throw new Error(data?.error?.message || `OpenAI HTTP ${response.status}`);
    pages=extractPages(outputText(data));
  } catch (e) {
    return json({images:cached,warning:`Artwork search failed; retained ${cached.length} cached candidate(s). ${e.message}`});
  }
  const found=[];
  for (const page of pages) {
    try {
      const response=await fetch(page,{redirect:'manual',headers:{accept:'text/html','user-agent':'Mozilla/5.0'}});
      if(!response.ok || !String(response.headers.get('content-type')||'').includes('text/html')) continue;
      const html=(await response.text()).slice(0,500000);
      if(!matchPage(html,product)) continue;
      for (const url of extractCandidateImages(html,page)) {
        if(!found.some(x=>x.url===url)) found.push({url,sourceUrl:page});
      }
    } catch {}
    if (found.length>=30) break;
  }
  const verified=[];
  for (const candidate of found.slice(0,20)) {
    const file=await fetchImage(fetch,candidate.url);
    if(file && !verified.some(x=>x.url===file.url)) verified.push({url:file.url,sourceUrl:candidate.sourceUrl});
    if (verified.length>=6) break;
  }
  // Keep earlier good candidates when research finds nothing. Even when results are found,
  // don't throw away older verified candidates until a human chooses artwork.
  const images=[...verified,...cached].filter((x,i,a)=>a.findIndex(y=>y.url===x.url)===i).slice(0,12);
  if (verified.length) await writeArtworkCache(bucket,productId,images);
  return json({images, cached:!verified.length,warning:verified.length?'Review each image to confirm it is the exact product.':`No new official artwork confirmed; ${cached.length} prior candidate(s) retained.`});
}
