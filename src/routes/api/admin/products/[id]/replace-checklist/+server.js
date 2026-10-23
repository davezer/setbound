import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';

const MAX_CARDS = 4500;
const key = (...parts) => parts.map(x => String(x ?? '').trim().toLowerCase()).join('\u001f');
const clean = value => String(value ?? '').trim();
const slugify = s => clean(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,110) || 'checklist';
const sortKey = num => { const m=String(num).match(/^(\D*)(\d+)(.*)$/); return m ? `${m[1]}${String(Number(m[2])).padStart(8,'0')}${m[3]}` : String(num); };
const truthy = value => value === true || value === 1 || value === '1';

export async function POST({ request, params, platform, locals }) {
  if (!locals.isAdmin) throw error(403,'Admin access required.');
  const database=db(platform), id=Number(params.id);
  if (!Number.isSafeInteger(id) || id<=0) return json({message:'Invalid product.'},{status:400});
  let body;
  try { body=await request.json(); } catch {return json({message:'Invalid replacement data.'},{status:400});}
  const mode=body?.mode;
  if(!['preview','apply'].includes(mode))return json({message:'Invalid mode.'},{status:400});
  const cards=body?.cards;
  if(!Array.isArray(cards)||!cards.length||cards.length>MAX_CARDS)return json({message:`Choose 1–${MAX_CARDS} cards.`},{status:400});
  const incoming=[];
  const duplicates=new Set();
  for(const card of cards){
    const section=clean(card.checklist_name),number=clean(card.card_number),subject=clean(card.subject);
    if(!section||!number||!subject)return json({message:'All cards need a checklist, card number and subject.'},{status:400});
    if([section,number,subject].some(s=>s.length>350))return json({message:'A checklist, card number or subject exceeds the limit.'},{status:400});
    if(clean(card.affiliation)==='UNRESOLVED'||card.affiliation_status==='unresolved')return json({message:'Resolve card affiliations before replacement.'},{status:400});
    const unique=key(section,number,subject);
    if(duplicates.has(unique))return json({message:`Ambiguous duplicate ${number} / ${subject} in ${section}; replacement stopped.`},{status:400});
    duplicates.add(unique);
    incoming.push({ section,number,subject,subjectKey:subject.toLowerCase(),affiliation:clean(card.affiliation),rookie:truthy(card.rookie)?1:0,autograph:truthy(card.autograph)?1:0,memorabilia:truthy(card.memorabilia)?1:0,serial:card.serial_number?clean(card.serial_number):null,sort:sortKey(number),raw:clean(card.raw).slice(0,2000),identity:unique });
  }
  const product=await database.prepare('SELECT id,name,year,published,image_key,primary_source_id FROM products WHERE id=?').bind(id).first();
  if(!product)return json({message:'Set not found.'},{status:404});
  // Prevent accidentally replacing a non-Chrome Sapphire product with Chrome
  // Sapphire (or the reverse). Require a meaningful filename for review.
  const replacementFilename=clean(body?.sourceFilename);
  if (!replacementFilename) return json({message:'Replacement filename missing. Reopen Manage Sets and select the file again.'},{status:400});
  const existingName=clean(product.name).toLowerCase();
  const incomingName=replacementFilename.toLowerCase().replace(/[_-]+/g,' ');
  const families=['chrome','sapphire','mega','holiday'];
  const mismatch=families.find(word => new RegExp('\\b'+word+'\\b','i').test(existingName) !== new RegExp('\\b'+word+'\\b','i').test(incomingName));
  if (mismatch) return json({message:`Product mismatch: the filename and existing product disagree on "${mismatch}". Upload the checklist for this exact release. Nothing changed.`},{status:409});

  const [existingResult,sectionResult,trackedResult,oddsResult]=await Promise.all([
    database.prepare(`SELECT c.id,c.card_number,sub.name AS subject,cl.name AS section
      FROM cards c JOIN subjects sub ON sub.id=c.subject_id JOIN checklists cl ON cl.id=c.checklist_id
      WHERE c.product_id=?`).bind(id).all(),
    database.prepare('SELECT id,name FROM checklists WHERE product_id=?').bind(id).all(),
    database.prepare(`SELECT cc.card_id FROM collection_cards cc JOIN cards c ON c.id=cc.card_id WHERE c.product_id=?`).bind(id).all(),
    database.prepare(`SELECT DISTINCT oe.checklist_id FROM odds_entries oe JOIN checklists cl ON cl.id=oe.checklist_id WHERE cl.product_id=? AND oe.checklist_id IS NOT NULL`).bind(id).all()
  ]);
  const old=existingResult.results||[],sections=sectionResult.results||[];
  const existing=new Map();
  for(const row of old){const k=key(row.section,row.card_number,row.subject);if(!existing.has(k))existing.set(k,[]);existing.get(k).push(row.id);}
  const preservedIds=new Set(), matched=[];
  for(const c of incoming){const matches=existing.get(c.identity)||[];c.oldId=matches.length===1?matches[0]:null;if(c.oldId){preservedIds.add(c.oldId);matched.push(c);}}
  const trackedIds=new Set((trackedResult.results||[]).map(x=>Number(x.card_id)));
  const unmatchedTracked=old.filter(row=>trackedIds.has(Number(row.id))&&!preservedIds.has(Number(row.id)));
  const oldSectionNames=new Set(sections.map(x=>x.name));
  const newSectionNames=new Set(incoming.map(x=>x.section));
  const droppedSections=sections.filter(x=>!newSectionNames.has(x.name));
  const oddsSections=new Set((oddsResult.results||[]).map(x=>Number(x.checklist_id)));
  const blockedOdds=droppedSections.filter(x=>oddsSections.has(Number(x.id)));
  const report={existingCards:old.length,replacementCards:incoming.length,existingSections:sections.length,replacementSections:newSectionNames.size,matchedCards:matched.length,removedCards:old.length-matched.length,addedCards:incoming.length-matched.length,trackedCards:trackedIds.size,unmatchedTrackedCards:unmatchedTracked.length,blockedOddsSections:blockedOdds.map(x=>x.name),published:Boolean(product.published)};
  if(mode==='preview')return json({ok:true,report,canApply:!unmatchedTracked.length&&!blockedOdds.length});
  if(unmatchedTracked.length)return json({message:`${unmatchedTracked.length} tracked card(s) cannot be matched safely. No changes made.`,report},{status:409});
  if(blockedOdds.length)return json({message:'Removed sections have linked odds data. No changes made.',report},{status:409});
  if(body?.confirmation!=='REPLACE CHECKLIST')return json({message:'Confirm REPLACE CHECKLIST to apply.'},{status:400});
  // Every statement runs in a D1 atomic batch. Existing stable card IDs and collection links survive.
  const payload=incoming.map(c=>({...c,oldId:c.oldId||null}));
  const encoded=JSON.stringify(payload),newSections=JSON.stringify([...newSectionNames]);
  if(encoded.length>1500000)return json({message:'Replacement too large for one safe transaction. Split the file before importing.'},{status:413});
  const checklists=await database.prepare('SELECT name,slug FROM checklists WHERE product_id=?').bind(id).all();
  const used=new Set((checklists.results||[]).map(x=>x.slug));
  const sectionRows=[];
  for(const name of newSectionNames)if(!oldSectionNames.has(name)){
    const base=slugify(name);let slug=base,n=2;while(used.has(slug)){slug=base+'-'+n++;} used.add(slug);sectionRows.push({name,slug});
  }
  const newSectionPayload=JSON.stringify(sectionRows);
  const keepIds=JSON.stringify([...preservedIds]);
  try {
    const result=await database.batch([
      database.prepare(`INSERT INTO subjects(name,normalized_name,subject_type)
        SELECT DISTINCT json_extract(value,'$.subject'),json_extract(value,'$.subjectKey'),'athlete'
        FROM json_each(?) AS j WHERE NOT EXISTS
        (SELECT 1 FROM subjects s WHERE s.normalized_name=json_extract(j.value,'$.subjectKey'))`).bind(encoded),
      database.prepare(`INSERT INTO checklists(product_id,name,slug,kind,sort_order)
        SELECT ?,json_extract(value,'$.name'),json_extract(value,'$.slug'),'checklist',
        (SELECT COALESCE(MAX(sort_order),-1)+1 FROM checklists WHERE product_id=?) + CAST(j.key AS INTEGER)
        FROM json_each(?) j`).bind(id,id,newSectionPayload),
      database.prepare(`UPDATE cards SET
        checklist_id=(SELECT cl.id FROM checklists cl WHERE cl.product_id=? AND cl.name=json_extract(j.value,'$.section') LIMIT 1),
        subject_id=(SELECT s.id FROM subjects s WHERE s.normalized_name=json_extract(j.value,'$.subjectKey') LIMIT 1),
        affiliation_id=(SELECT a.id FROM affiliations a WHERE lower(trim(a.name))=lower(trim(json_extract(j.value,'$.affiliation'))) LIMIT 1),
        affiliation_label=NULLIF(json_extract(j.value,'$.affiliation'),''),
        card_number=json_extract(j.value,'$.number'),sort_key=json_extract(j.value,'$.sort'),
        rookie=json_extract(j.value,'$.rookie'),autograph=json_extract(j.value,'$.autograph'),
        memorabilia=json_extract(j.value,'$.memorabilia'),serial_number=json_extract(j.value,'$.serial'),
        raw_source=json_extract(j.value,'$.raw')
        FROM json_each(?) j WHERE cards.id=CAST(json_extract(j.value,'$.oldId') AS INTEGER) AND cards.product_id=?`).bind(id,encoded,id),
      // Remove only OLD cards before inserting replacements. Deleting afterwards
      // also deletes every newly inserted row, leaving the product empty.
      database.prepare(`DELETE FROM cards WHERE product_id=? AND id NOT IN (SELECT CAST(value AS INTEGER) FROM json_each(?))`).bind(id,keepIds),
      database.prepare(`INSERT INTO cards(product_id,checklist_id,subject_id,affiliation_id,affiliation_label,card_number,sort_key,rookie,autograph,memorabilia,serial_number,confidence,raw_source)
        SELECT ?,cl.id,s.id,a.id,NULLIF(json_extract(j.value,'$.affiliation'),''),json_extract(j.value,'$.number'),json_extract(j.value,'$.sort'),
          json_extract(j.value,'$.rookie'),json_extract(j.value,'$.autograph'),json_extract(j.value,'$.memorabilia'),
          json_extract(j.value,'$.serial'),0.99,json_extract(j.value,'$.raw')
        FROM json_each(?) j
        JOIN checklists cl ON cl.product_id=? AND cl.name=json_extract(j.value,'$.section')
        JOIN subjects s ON s.normalized_name=json_extract(j.value,'$.subjectKey')
        LEFT JOIN affiliations a ON lower(trim(a.name))=lower(trim(json_extract(j.value,'$.affiliation')))
        WHERE json_extract(j.value,'$.oldId') IS NULL`).bind(id,encoded,id),

      database.prepare(`DELETE FROM checklist_details WHERE checklist_id IN (SELECT id FROM checklists WHERE product_id=? AND name NOT IN (SELECT value FROM json_each(?)))`).bind(id,newSections),
      database.prepare(`DELETE FROM checklists WHERE product_id=? AND name NOT IN (SELECT value FROM json_each(?))`).bind(id,newSections),
      database.prepare(`UPDATE products SET updated_at=datetime('now') WHERE id=?`).bind(id),
      database.prepare('SELECT COUNT(*) AS card_count FROM cards WHERE product_id=?').bind(id)
    ]);
    if(result.some(x=>x.success===false))throw Error('Database rejected one or more changes.');
    const actual=Number(result.at(-1)?.results?.[0]?.card_count ?? -1);
    if(actual!==incoming.length)throw Error(`Verification failed: expected ${incoming.length} cards, found ${actual}. Contact support and do not retry blindly.`);
    return json({ok:true,report,message:'Checklist replaced. Product details and artwork preserved.'});
  }catch(e){console.error('Checklist replacement failed',e);return json({message:'Replacement failed; no change should have been committed. '+(e?.message||'Database error')},{status:500});}
}
