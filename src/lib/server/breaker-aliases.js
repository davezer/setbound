// Breaker identity matching. Does not alter imported checklist subjects.
export function nameKey(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
    .toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
export function cleanName(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
// A quoted epithet followed by a complete name is a *candidate*, never an automatic alias.
export function possiblePlainName(value) {
  const text=cleanName(value);
  const match=text.match(/^["“][^"”]{2,65}["”]\s+(.+)$/u);
  return match && match[1].split(/\s+/).length >= 2 ? cleanName(match[1]) : null;
}
export function resolveSubjects(subjects, rows) {
  const aliasMap=new Map(rows.map(r=>[r.alias_key, cleanName(r.canonical_name)]));
  const names=[...new Set(subjects.map(cleanName).filter(Boolean))];
  const byKey=new Map(names.map(n=>[nameKey(n), n]));
  const resolved=new Map();
  for(const name of names) {
    const identity=aliasMap.get(nameKey(name)) || name;
    const key=nameKey(identity);
    if(key && !resolved.has(key))resolved.set(key, identity);
  }
  const warnings=[]; const seen=new Set();
  // Compare all observed subjects against their plain-name identity, including
  // multiple different quoted titles even if the plain name is not present.
  const grouped=new Map();
  for(const name of names){
    const plain=possiblePlainName(name);
    const key=nameKey(plain||name);
    if(!key)continue;
    if(!grouped.has(key))grouped.set(key,[]);
    grouped.get(key).push(name);
  }
  for(const variants of grouped.values()) {
    if(variants.length<2)continue;
    for(let i=0;i<variants.length;i++)for(let j=i+1;j<variants.length;j++){
      const leftName=variants[i], rightName=variants[j];
      const left=nameKey(aliasMap.get(nameKey(leftName))||leftName);
      const right=nameKey(aliasMap.get(nameKey(rightName))||rightName);
      if(left===right)continue;
      const signature=[nameKey(leftName),nameKey(rightName)].sort().join('|');
      if(!seen.has(signature)){warnings.push({alias:leftName,possibleCanonical:rightName,reason:'Possible nickname variants for the same person'});seen.add(signature);}
    }
  }
  return {names:[...resolved.values()].sort((a,b)=>a.localeCompare(b,'en',{sensitivity:'base'})),warnings};
}
