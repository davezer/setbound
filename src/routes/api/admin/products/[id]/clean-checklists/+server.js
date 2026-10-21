import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
const decode=s=>String(s||'').replace(/&ndash;/gi,'–').replace(/&mdash;/gi,'—').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&hellip;/gi,'…').replace(/&nbsp;/gi,' ');
function suggestion(kind,value){
 const s=decode(value);
 if(s!==value)return {value:s,reason:'Decode HTML entities'};
 if(kind!=='subject')return null;
 // These specific suffixes were observed in scraped card names. Never strip ordinary II, RC, Base, etc. alone.
 const suffixes=[/\s+Base\s+(?:NFL|NBA|MLB|NHL|MLS|WNBA)$/i,/\s+RC\s+Rookies$/i,/\s+RC\s+Rookie\s+Debut$/i,/\s+Veterans\s+(?:I|II|III|IV)$/i];
 for(const re of suffixes)if(re.test(s)){const cleaned=s.replace(re,'').trim();if(cleaned.length>2)return {value:cleaned,reason:'Possible checklist descriptor attached to subject — review carefully'};}
 return null;
}
async function collect(database,id){
 const product=await database.prepare('SELECT id,name FROM products WHERE id=?').bind(id).first();
 if(!product)return null;
 const sections=await database.prepare('SELECT id,name FROM checklists WHERE product_id=? ORDER BY id').bind(id).all();
 const subjects=await database.prepare(`SELECT DISTINCT s.id,s.name FROM subjects s JOIN cards c ON c.subject_id=s.id WHERE c.product_id=? ORDER BY s.id`).bind(id).all();
 const proposals=[];
 for(const item of sections.results||[]){const x=suggestion('checklist',item.name);if(x)proposals.push({key:'checklist:'+item.id,kind:'checklist',id:item.id,before:item.name,after:x.value,reason:x.reason});}
 for(const item of subjects.results||[]){const x=suggestion('subject',item.name);if(x)proposals.push({key:'subject:'+item.id,kind:'subject',id:item.id,before:item.name,after:x.value,reason:x.reason});}
 return {product,proposals};
}
export async function GET({platform,params}){
 const id=Number(params.id);if(!Number.isSafeInteger(id)||id<1)return json({message:'Invalid product'},{status:400});
 try{const data=await collect(db(platform),id);return data?json({ok:true,...data}):json({message:'Product not found'},{status:404});}catch(e){return json({message:e?.message||'Review failed'},{status:500});}
}
export async function POST({platform,params,request}){
 const id=Number(params.id);if(!Number.isSafeInteger(id)||id<1)return json({message:'Invalid product'},{status:400});
 const body=await request.json().catch(()=>({}));
 const keys=Array.isArray(body.keys)?body.keys:[];
 if(!keys.length||keys.length>100||keys.some(x=>typeof x!=='string'))return json({message:'Select 1–100 proposed fixes.'},{status:400});
 const database=db(platform);
 try{
  const data=await collect(database,id);if(!data)return json({message:'Product not found'},{status:404});
  const byKey=new Map(data.proposals.map(p=>[p.key,p]));
  if(new Set(keys).size!==keys.length||keys.some(k=>!byKey.has(k)))return json({message:'Preview is out of date. Refresh and review again.'},{status:409});
  const operations=[];
  for(const key of keys){
   const p=byKey.get(key);
   if(p.kind==='checklist'){
    const collision=await database.prepare('SELECT id FROM checklists WHERE product_id=? AND name=? AND id<>?').bind(id,p.after,p.id).first();
    if(collision)return json({message:'Checklist name collision: '+p.after+'. Nothing changed.'},{status:409});
    operations.push(database.prepare('UPDATE checklists SET name=? WHERE id=? AND product_id=? AND name=?').bind(p.after,p.id,id,p.before));
   }else{
    const norm=p.after.toLowerCase();
    let target=await database.prepare('SELECT id FROM subjects WHERE normalized_name=? LIMIT 1').bind(norm).first();
    // If absent, create one new canonical subject without globally renaming any shared subject.
    if(!target){
      const original=await database.prepare('SELECT subject_type FROM subjects WHERE id=?').bind(p.id).first();
      await database.prepare('INSERT OR IGNORE INTO subjects (name,normalized_name,subject_type) VALUES (?,?,?)').bind(p.after,norm,original?.subject_type||'athlete').run();
      target=await database.prepare('SELECT id FROM subjects WHERE normalized_name=? LIMIT 1').bind(norm).first();
    }
    if(!target?.id)throw Error('Could not resolve corrected subject: '+p.after);
    operations.push(database.prepare('UPDATE cards SET subject_id=? WHERE product_id=? AND subject_id=?').bind(target.id,id,p.id));
   }
  }
  if(operations.length)await database.batch(operations);
  return json({ok:true,updated:keys.length});
 }catch(e){return json({message:e?.message||'Cleanup failed'},{status:500});}
}
