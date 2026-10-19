// Explicit configuration suffixes only. Never trim generic words out of legitimate product names.
const FORMAT_SUFFIX = /-(?:mega-box|jumbo-box|value-box(?:-(?:ea|se|cee))?|hanger-box|blaster-box|hobby-box|hobby-tins?|advent-calendar|retail-box|fat-packs?|breaker-box|breaker-delight|collector-box|super-box|tins?)(?:-[a-z]{2,3})?$/i;
const ALLOWED = new Set(['cardsmithsbreaks.com','www.cardsmithsbreaks.com']);
export function sourceCategory(input) {
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || !ALLOWED.has(url.hostname) || url.port || url.username || url.password) return {kind:'unknown'};
    const match = url.pathname.match(/^\/(full-checklist|csbmaster)\/([^/]+)\/?$/i);
    if (!match) return {kind:'unknown'};
    const slug = match[2];
    if (!FORMAT_SUFFIX.test(slug)) return {kind:'candidate',masterUrl:null};
    const masterSlug = slug.replace(FORMAT_SUFFIX,'');
    if (!masterSlug || masterSlug === slug) return {kind:'unknown'};
    return {kind:'format',masterUrl:`https://cardsmithsbreaks.com/${match[1]}/${masterSlug}/`};
  } catch { return {kind:'unknown'}; }
}
