import {json} from '@sveltejs/kit';
import {db} from '$lib/server/db';
const MAX_BYTES=5*1024*1024;
// SETBOUND_PUBLIC_IMAGE_HOSTS_V2
// Reviewable remote images may use any publicly hosted HTTPS domain.
// Keep public-network validation and existing file type/size/magic checks.
function safeUrl(value) {
  try {
    const u = new URL(String(value || ''));
    if (u.protocol !== 'https:' || u.port || u.username || u.password || u.href.length > 4096) return null;
    const host = u.hostname.toLowerCase().replace(/\.$/, '');
    if (!host || !host.includes('.') || host.length > 253) return null;
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.test') || host.endsWith('.invalid')) return null;
    // Reject IP literals altogether (including IPv4, IPv6 and their alternative encodings).
    if (/^[\d.]+$/.test(host) || host.startsWith('[') || host.includes(':')) return null;
    if (host === 'metadata.google.internal' || host === 'metadata.azure.internal') return null;
    return u;
  } catch { return null; }
}
export async function POST({request,platform,locals}){
  if(!locals.isAdmin)return json({message:'Admin access required.'},{status:403});
  const body=await request.json().catch(()=>({}));
  const id=Number(body.productId),u=safeUrl(body.imageUrl);
  if(!Number.isSafeInteger(id)||id<1||!u)return json({message:'Use a direct HTTPS image URL from a public image host.'},{status:400});
  const database=db(platform);
  const product=await database.prepare('SELECT id, slug, image_key FROM products WHERE id=?').bind(id).first();
  if(!product)return json({message:'Set not found.'},{status:404});
  let response;
  try{response=await fetch(u.href,{redirect:'manual',headers:{accept:'image/avif,image/webp,image/png,image/jpeg'},signal:AbortSignal.timeout(12000)});}catch{return json({message:'Source did not respond. Download the authorized image and use manual upload.'},{status:502});}
  if(!response.ok)return json({message:'Source refused the image (HTTP '+response.status+'). Try manual upload.'},{status:422});
  const type=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/avif':'avif'}[type];
  if(!ext)return json({message:'Source did not return a supported image.'},{status:422});
  if(Number(response.headers.get('content-length')||0)>MAX_BYTES)return json({message:'Image is over 5 MB.'},{status:413});
  const reader=response.body?.getReader();if(!reader)return json({message:'Empty image response.'},{status:422});
  const pieces=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();return json({message:'Image is over 5 MB.'},{status:413});}pieces.push(value);}}catch{return json({message:'Source image download failed.'},{status:502});}
  if(!size)return json({message:'Image is empty.'},{status:422});
  const bytes=new Uint8Array(size);let off=0;for(const part of pieces){bytes.set(part,off);off+=part.length;}
  // Check actual file magic as well as the declared MIME.
  const valid=type==='image/jpeg'?bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff:
    type==='image/png'?bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47:
    type==='image/webp'?String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP':
    String.fromCharCode(...bytes.slice(4,12)).includes('ftypavif')||String.fromCharCode(...bytes.slice(4,12)).includes('ftypavis');
  if(!valid)return json({message:'Downloaded content is not a valid image of the declared type.'},{status:422});
  const key='sets/'+product.slug+'-'+crypto.randomUUID()+'.'+ext;
  await platform.env.SET_IMAGES.put(key,bytes,{httpMetadata:{contentType:type,cacheControl:'public, max-age=31536000, immutable'}});
  try{await database.prepare("UPDATE products SET image_key=?,updated_at=datetime('now') WHERE id=?").bind(key,id).run();}
  catch(e){await platform.env.SET_IMAGES.delete(key);throw e;}
  if(product.image_key&&product.image_key!==key)await platform.env.SET_IMAGES.delete(product.image_key).catch(()=>{});
  return json({ok:true,productId:id,imageKey:key});
}
