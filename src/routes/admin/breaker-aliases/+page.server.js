import { db } from '$lib/server/db';
import { fail } from '@sveltejs/kit';
import { cleanName, nameKey, possiblePlainName } from '$lib/server/breaker-aliases.js';

export async function load({platform,locals,url}) {
  if(!locals.isAdmin)return {aliases:[],suggestions:[],query:''};
  const database=db(platform);const query=String(url.searchParams.get('q')||'').trim().slice(0,100);
  const [aliases,subjects]=await Promise.all([
    database.prepare('SELECT alias_key,alias_name,canonical_name,created_at FROM breaker_name_aliases ORDER BY canonical_name,alias_name LIMIT 3000').all(),
    database.prepare(`SELECT DISTINCT s.name FROM subjects s JOIN cards c ON c.subject_id=s.id JOIN products p ON p.id=c.product_id JOIN sports sport ON sport.id=p.sport_id WHERE lower(sport.name) LIKE '%wrestl%' OR lower(sport.name) LIKE '%wwe%' LIMIT 7000`).all()
  ]);
  const all=(subjects.results||[]).map(r=>cleanName(r.name)).filter(Boolean);
  const nameByKey=new Map(all.map(n=>[nameKey(n),n]));
  const known=new Map((aliases.results||[]).map(r=>[r.alias_key,nameKey(r.canonical_name)]));
  const suggestions=[]; const seen=new Set();
  for(const alias of all){const plain=possiblePlainName(alias);if(!plain)continue;const canonical=nameByKey.get(nameKey(plain));if(!canonical)continue;
    if(known.get(nameKey(alias))===nameKey(canonical))continue;
    const key=nameKey(alias)+'|'+nameKey(canonical);if(seen.has(key))continue;seen.add(key);
    if(query&&!`${alias} ${canonical}`.toLowerCase().includes(query.toLowerCase()))continue;
    suggestions.push({alias,canonical});
  }
  return {aliases:aliases.results||[],suggestions:suggestions.slice(0,300),query};
}
export const actions={
  add:async ({request,platform,locals})=>{
    if(!locals.isAdmin)return fail(403,{message:'Admins only.'});
    const body=await request.formData();const alias=cleanName(body.get('alias'));const canonical=cleanName(body.get('canonical'));
    if(!alias||!canonical||alias.length>180||canonical.length>180||nameKey(alias)===nameKey(canonical))return fail(400,{message:'Enter two different, valid names (max 180 characters).'});
    const database=db(platform);
    // Require the canonical person to exist in the checklist database; never synthesize a new identity from a typo.
    const person=await database.prepare('SELECT 1 FROM subjects WHERE lower(name)=lower(?) LIMIT 1').bind(canonical).first();
    if(!person)return fail(400,{message:'Canonical name must already exist in a checklist, with the same spelling.'});
    await database.prepare(`INSERT INTO breaker_name_aliases(alias_key,alias_name,canonical_name,created_at) VALUES(?,?,?,datetime('now')) ON CONFLICT(alias_key) DO UPDATE SET alias_name=excluded.alias_name,canonical_name=excluded.canonical_name`).bind(nameKey(alias),alias,canonical).run();
    return {message:`Saved verified alias: ${alias} → ${canonical}`};
  },
  delete:async ({request,platform,locals})=>{
    if(!locals.isAdmin)return fail(403,{message:'Admins only.'});
    const body=await request.formData();const key=String(body.get('key')||'');
    if(!key||key.length>200)return fail(400,{message:'Invalid alias key.'});
    await db(platform).prepare('DELETE FROM breaker_name_aliases WHERE alias_key=?').bind(key).run();
    return {message:'Alias removed.'};
  }
};
