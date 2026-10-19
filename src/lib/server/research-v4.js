export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const PAGE_HOSTS = ['topps.com', 'checklistinsider.com'];
const IMAGE_HOSTS = [
  ...PAGE_HOSTS, 'xcdn.checklistinsider.com', 'cdn.shopify.com',
  'images.ctfassets.net', 'cdn11.bigcommerce.com', 'fanaticsassets.com',
  'static.fanatics.com', 'media.fanatics.com', 'images.fanatics.com'
];
export function allowedHost(raw, hosts) {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && !u.port && !u.username && !u.password &&
      hosts.some(h => u.hostname === h || u.hostname.endsWith('.' + h));
  } catch { return false; }
}
export function allowedPage(url) { return allowedHost(url, PAGE_HOSTS); }
export function allowedImage(url) { return allowedHost(url, IMAGE_HOSTS); }
export function researchCacheKey(id) { return `research-v4/artwork/${Number(id)}.json`; }
export async function readArtworkCache(bucket, id) {
  if (!bucket) return [];
  try {
    const object = await bucket.get(researchCacheKey(id));
    if (!object) return [];
    const value = JSON.parse(await object.text());
    return Array.isArray(value.images) ? value.images.filter(x => allowedImage(x.url) && allowedPage(x.sourceUrl)) : [];
  } catch { return []; }
}
export async function writeArtworkCache(bucket, id, images) {
  if (!bucket) return;
  await bucket.put(researchCacheKey(id), JSON.stringify({images, savedAt: new Date().toISOString()}),
    { httpMetadata: { contentType: 'application/json' } });
}
// No prices, retailer pitches or source citations belong in published collector copy.
export function cleanResearchCopy(raw) {
  return String(raw || '')
    .replace(/\[[^\]]*(?:https?:\/\/|www\.|\.(?:com|net|org))[^\]]*\]/gi, '')
    .replace(/\(\s*https?:\/\/[^)]*\)/gi, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/【[^】]+】|\[\s*\d+\s*\]/g, '')
    .split(/(?<=[.!?])\s+|\n+/)
    .filter(line => !/(?:\$|USD\s*|MSRP|retail price|list price|presale|pre-sale|priced at|sale price|price of|costs?\s+\d|buy now|shop now|available for purchase|order now|add to cart|purchase on|discount|shipping|free delivery)/i.test(line))
    .join(' ')
    .replace(/(?:\$|USD\s*)\s*[\d,.]+(?:\s*(?:USD|dollars))?/gi, '')
    .replace(/\s+([,.;!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}
export async function fetchImage(fetchFn, url) {
  let current = url;
  for (let n = 0; n < 5; n++) {
    if (!allowedImage(current)) return null;
    let response;
    try { response = await fetchFn(current, { redirect:'manual', headers:{accept:'image/jpeg,image/png,image/webp,image/avif,*/*', 'user-agent':'Mozilla/5.0 Setbound/1.0'} }); }
    catch { return null; }
    if ([301,302,303,307,308].includes(response.status)) {
      const next = response.headers.get('location');
      if (!next) return null;
      current = new URL(next, current).href;
      await response.body?.cancel();
      continue;
    }
    const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!response.ok || !['image/jpeg','image/png','image/webp','image/avif'].includes(type)) { await response.body?.cancel(); return null; }
    if (Number(response.headers.get('content-length') || 0) > MAX_IMAGE_BYTES) { await response.body?.cancel(); return null; }
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength < 1000 || bytes.byteLength > MAX_IMAGE_BYTES) return null;
    return {url: current, type, bytes};
  }
  return null;
}
export function extractCandidateImages(html, base) {
  const found=[];
  const add=(raw)=>{
    if (!raw) return;
    try {
      const url=new URL(String(raw).replace(/&amp;/g,'&'),base).href;
      if (allowedImage(url) && !found.includes(url) && !/sprite|logo|avatar|payment|placeholder|newsletter|tracking|favicon|badge|banner|promo|advert/i.test(url)) found.push(url);
    } catch {}
  };
  for (const tag of String(html).match(/<meta\b[^>]*>/gi) || []) {
    if (!/(?:og:image|twitter:image|image_src)/i.test(tag)) continue;
    add(tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1]);
  }
  for (const tag of String(html).match(/<img\b[^>]*>/gi) || []) {
    const attr=tag.match(/\b(?:data-src|src)\s*=\s*["']([^"']+)["']/i)?.[1];
    add(attr);
  }
  for (const match of String(html).matchAll(/"image"\s*:\s*(?:"([^"]+)"|\[\s*"([^"]+)")/gi)) add(match[1]||match[2]);
  return found.slice(0,18);
}
