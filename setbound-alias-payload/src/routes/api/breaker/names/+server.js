import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { resolveSubjects } from '$lib/server/breaker-aliases.js';

const NO_STORE = { 'cache-control': 'no-store' };
export async function POST({request, platform, locals}) {
  if(!locals.user)return json({message:'Sign in with an approved Breaker account.'},{status:401,headers:NO_STORE});
  const database=db(platform);
  const user=await database.prepare('SELECT is_admin,is_breaker FROM users WHERE id=?').bind(locals.user.id).first();
  if(!user || !(user.is_admin || user.is_breaker))return json({message:'Breaker access is required.'},{status:403,headers:NO_STORE});
  const payload=await request.json().catch(()=>({}));
  if(!Array.isArray(payload.slugs)||payload.slugs.length<1||payload.slugs.length>10||payload.slugs.some(s=>typeof s!=='string'||s.length>180||!/^[a-z0-9-]+$/.test(s)))return json({message:'Choose 1–10 valid products.'},{status:400,headers:NO_STORE});
  const slugs=[...new Set(payload.slugs)];const marks=slugs.map(()=>'?').join(',');
  const products=await database.prepare(`SELECT slug FROM products WHERE published=1 AND slug IN (${marks})`).bind(...slugs).all();
  if((products.results||[]).length!==slugs.length)return json({message:'One or more products are unavailable.'},{status:404,headers:NO_STORE});
  const rows=await database.prepare(`SELECT DISTINCT TRIM(s.name) AS name FROM cards c JOIN products p ON p.id=c.product_id JOIN subjects s ON s.id=c.subject_id WHERE p.published=1 AND p.slug IN (${marks}) AND TRIM(s.name)!='' LIMIT 10001`).bind(...slugs).all();
  if((rows.results||[]).length>10000)return json({message:'Too many distinct subjects; reduce selected products.'},{status:413,headers:NO_STORE});
  const aliases=await database.prepare('SELECT alias_key, canonical_name FROM breaker_name_aliases').all();
  const {names,warnings}=resolveSubjects((rows.results||[]).map(r=>r.name),aliases.results||[]);
  if(warnings.length)return json({message:`${warnings.length} possible duplicate wrestler identity pair(s) need admin review before this list can be copied.`,reviewRequired:true,warnings:warnings.slice(0,30),count:warnings.length},{status:409,headers:NO_STORE});
  return json({names,count:names.length,productCount:slugs.length,verifiedAgainstAliases:true},{headers:NO_STORE});
}
