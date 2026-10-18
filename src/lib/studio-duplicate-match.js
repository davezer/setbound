// Discovery-side identity screening. This is deliberately not an automatic merge.
// A possible duplicate is held for review, never imported as new.
const IGNORABLE = new Set(['edition','trading','cards','card','checklist','guide','download','downloads','the']);
const BRANDS = new Set(['topps','bowman','panini','upper deck','leaf','fanatics']);
const FAMILY_VARIANTS = [
  'chrome black','sapphire','logofractor','cosmic','galaxy','pristine','finest',
  'sterling','midnight','definitive','dynasty','museum','heritage','inception',
  'tribute','gilded','chrome','platinum','anniversary','first edition',
  'topps now','bowman best','bowman u','best','update','series 1','series 2',
  'flagship','mega box','jumbo','blaster','breaker','value box','hobby box',
  'retail','hanger','collector tin','black','hoops','three'
];
const DISTINCT_PACKAGES = new Set(['mega box','jumbo','blaster','breaker','value box','hobby box','retail','hanger','collector tin']);
function norm(value) {
  return String(value || '').toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'').replace(/®|™/g,'')
    .replace(/&/g,' and ').replace(/\bbowman university\b/g,'bowman u')
    .replace(/\b(collector'?s|collectors)\b/g,'collector')
    .replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}
function stripYear(value) {
  return norm(value).replace(/^(?:19|20)\d{2}(?:\s+(?:19|20)?\d{2})?\s+/,'').trim();
}
function tokens(value) {return stripYear(value).split(' ').filter(Boolean);}
function phrase(text, label) {return (` ${stripYear(text)} `).includes(` ${label} `);}
function signatures(name) {
  const n=stripYear(name);
  const found=new Set();
  for(const v of FAMILY_VARIANTS) if(phrase(n,v)) found.add(v);
  if(found.has('chrome black')) {found.delete('chrome');found.delete('black');}
  if(found.has('platinum') && found.has('anniversary')) {found.delete('anniversary');}
  return found;
}
function hasDistinctVariantDifference(a,b) {
  const x=signatures(a),y=signatures(b);
  // Every edition marker must agree; absent markers are not inferred.
  return [...new Set([...x,...y])].some(v=>!DISTINCT_PACKAGES.has(v) && x.has(v)!==y.has(v));
}
function brandMatch(a,b) {
  const x=norm(a),y=norm(b);
  if(!x || !y)return true;
  return x===y || (x==='topps'&&y==='bowman') || (x==='bowman'&&y==='topps');
}
function sportMatch(a,b) {
  const x=norm(a),y=norm(b);
  return !x || !y || x==='unknown sport' || y==='unknown sport' || x===y;
}
function wordSet(name) {
  return new Set(tokens(name).filter(w=>!IGNORABLE.has(w)));
}
function overlap(a,b) {
  const x=wordSet(a), y=wordSet(b);
  const intersect=[...x].filter(w=>y.has(w)).length;
  return {count:intersect,coverage:intersect / Math.max(1,Math.min(x.size,y.size)),similarity:2*intersect/Math.max(1,x.size+y.size)};
}
function yearMatch(a,b) {return Number(a)===Number(b);}
function sourceMatch(a,b) {
  try {
    const x=new URL(a),y=new URL(b);
    return x.hostname===y.hostname && decodeURIComponent(x.pathname).replace(/\/$/,'').toLowerCase()===decodeURIComponent(y.pathname).replace(/\/$/,'').toLowerCase();
  } catch{return false;}
}
/** @returns {{status:'imported'|'possible'|'new', match?:object, reason?:string}} */
export function classifyDiscovery(item, products) {
  const candidates=[];
  for(const p of products||[]) {
    if(!yearMatch(item.year,p.year) || !brandMatch(item.manufacturer,p.manufacturer_name) || !sportMatch(item.sport,p.sport_name))continue;
    const sameSource=sourceMatch(item.checklistUrl,p.source_url||p.checklist_url);
    const variantDifferent=hasDistinctVariantDifference(item.name,p.name);
    if(variantDifferent && !sameSource) continue; // Chrome Black ≠ Chrome, Sapphire ≠ regular Chrome.
    const i=stripYear(item.name),e=stripYear(p.name);
    const cleanKey=(value)=>tokens(value).filter(w=>!IGNORABLE.has(w)).join(' ');
    const packageDifferent=[...DISTINCT_PACKAGES].some(v=>phrase(item.name,v)!==phrase(p.name,v));
    if(!packageDifferent && (sameSource || i===e || cleanKey(item.name)===cleanKey(p.name))) candidates.push({status:'imported',match:p,reason:sameSource?'Same checklist source':'Matching product identity',score:100});
    else {
      const s=overlap(item.name,p.name);
      if(s.count>=2 && s.coverage>=0.72 && s.similarity>=0.62) candidates.push({status:'possible',match:p,reason:'Similar product name; verify edition',score:s.similarity*100});
    }
  }
  candidates.sort((a,b)=> (a.status==='imported'?1:0)===(b.status==='imported'?1:0)?b.score-a.score:(a.status==='imported'?-1:1));
  if(!candidates.length)return {status:'new'};
  if(candidates.length>1 && candidates[0].status==='possible' && Math.abs(candidates[0].score-candidates[1].score)<5)return {...candidates[0],reason:'Multiple similar imported products; verify identity'};
  return candidates[0];
}
