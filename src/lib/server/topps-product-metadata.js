const TOPPS_HOSTS = new Set(['www.topps.com', 'topps.com']);

function decodeHtml(value = '') {
  return String(value)
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function cleanHtmlText(value = '') {
  return decodeHtml(
    String(value)
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeToppsProduct(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/®|™/g, '')
    .replace(/^\s*\d{4}\s+/, '')
    .replace(/\b(checklist|guide|details|cards?|trading cards?)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function toppsProductScore(left, right) {
  const a = normalizeToppsProduct(left);
  const b = normalizeToppsProduct(right);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 92;
  const aTokens = new Set(a.split(' ').filter(Boolean));
  const bTokens = new Set(b.split(' ').filter(Boolean));
  let shared = 0;
  for (const token of aTokens) if (bTokens.has(token)) shared += 1;
  const union = new Set([...aTokens, ...bTokens]).size || 1;
  return Math.round((shared / union) * 100);
}

function slugify(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/®|™/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function toppsPageCandidates(name = '', year = null) {
  let base = String(name || '').trim();
  if (year) base = base.replace(new RegExp(`^${year}\\s+`, 'i'), '').trim();

  const variants = new Set([
    base,
    base.replace(/\bUniversity\b/gi, 'U'),
    base.replace(/\bU\b/gi, 'University'),
    base.replace(/\s+Edition\b/gi, ''),
    base.replace(/\s+Mega Box\b/gi, ''),
    base.replace(/\s+Sapphire Edition\b/gi, ' Sapphire')
  ]);

  return [...new Set([...variants]
    .map((variant) => slugify(variant))
    .filter(Boolean)
    .map((slug) => `https://www.topps.com/pages/${slug}`))];
}

function isoDateFromText(value, year) {
  const text = String(value || '').trim();
  if (!text) return null;
  const withYear = /\b\d{4}\b/.test(text) ? text : `${text}, ${year || new Date().getFullYear()}`;
  const parsed = new Date(`${withYear} 12:00:00 UTC`);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(parsed.getUTCDate()).padStart(2, '0')}`;
}

export function parseToppsProductMetadata(html, pageUrl, requestedName = '', requestedYear = null) {
  const source = String(html || '');
  const h1 = source.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const title = cleanHtmlText(h1?.[1] || requestedName);

  let aboutRelease = '';
  const marker = source.search(/About\s+the\s+release/i);
  if (marker >= 0) {
    const after = source.slice(marker, marker + 18000);
    const paragraph = after.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
    aboutRelease = cleanHtmlText(paragraph?.[1] || '');
  }

  if (!aboutRelease) {
    const loose = source.match(/About\s+the\s+release[\s\S]{0,5000}?<p\b[^>]*>([\s\S]*?)<\/p>/i);
    aboutRelease = cleanHtmlText(loose?.[1] || '');
  }

  const availability = cleanHtmlText(source).match(/\bAvailable\s+(?:for|on)\s+([A-Za-z]+\s+\d{1,2}(?:,\s*\d{4})?)/i)?.[1] || '';
  const releaseDate = isoDateFromText(availability, requestedYear);
  const score = toppsProductScore(requestedName, title);

  if (requestedName && title && score < 65) {
    return { ok: false, reason: `Topps page title did not safely match the requested product (${score}% match).`, title, score };
  }
  if (!aboutRelease) {
    return { ok: false, reason: 'Topps page loaded, but no About the release paragraph was found.', title, score };
  }

  return {
    ok: true,
    source: 'Topps',
    pageUrl,
    name: title || requestedName,
    year: requestedYear || null,
    releaseDate,
    aboutRelease,
    images: [],
    score
  };
}

function safeJson(value) {
  try { return JSON.parse(value || '{}'); }
  catch { return null; }
}

export async function findCachedToppsMetadata(database, { name = '', year = null, checklistUrl = '' } = {}) {
  try {
    const rows = year
      ? await database.prepare(`SELECT page_url, title, entry_json, scanned_at FROM source_harvester_cache WHERE source = 'topps-metadata' AND (year = ? OR year IS NULL)`).bind(Number(year)).all()
      : await database.prepare(`SELECT page_url, title, entry_json, scanned_at FROM source_harvester_cache WHERE source = 'topps-metadata'`).all();

    let best = null;
    for (const row of rows.results || []) {
      const entry = safeJson(row.entry_json);
      if (!entry?.aboutRelease) continue;
      if (checklistUrl && entry.checklistUrl === checklistUrl) return { ...entry, cachedAt: row.scanned_at };
      const score = toppsProductScore(name, entry.name || row.title || '');
      if (!best || score > best.score) best = { score, entry: { ...entry, cachedAt: row.scanned_at } };
    }
    return best?.score >= 65 ? best.entry : null;
  } catch {
    return null;
  }
}

export async function fetchAndCacheToppsMetadata(database, fetch, { name = '', year = null, checklistUrl = '' } = {}) {
  const cached = await findCachedToppsMetadata(database, { name, year, checklistUrl });
  if (cached) return { metadata: cached, cached: true };

  const attempts = [];
  for (const pageUrl of toppsPageCandidates(name, year)) {
    try {
      const parsedUrl = new URL(pageUrl);
      if (parsedUrl.protocol !== 'https:' || !TOPPS_HOSTS.has(parsedUrl.hostname)) continue;

      const response = await fetch(parsedUrl.href, {
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'en-US,en;q=0.9',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/155.0.0.0 Safari/537.36'
        }
      });

      if (!response.ok) {
        attempts.push(`${parsedUrl.pathname}: HTTP ${response.status}`);
        continue;
      }

      const html = await response.text();
      const metadata = parseToppsProductMetadata(html, parsedUrl.href, name, year);
      if (!metadata.ok) {
        attempts.push(`${parsedUrl.pathname}: ${metadata.reason}`);
        continue;
      }

      const entry = { ...metadata, checklistUrl: checklistUrl || null };
      await database.prepare(`
        INSERT INTO source_harvester_cache (page_url, source, year, title, entry_json, scanned_at, updated_at)
        VALUES (?, 'topps-metadata', ?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(page_url) DO UPDATE SET
          source = excluded.source,
          year = excluded.year,
          title = excluded.title,
          entry_json = excluded.entry_json,
          scanned_at = datetime('now'),
          updated_at = datetime('now')
      `).bind(entry.pageUrl, entry.year || year || null, entry.name || name || '', JSON.stringify(entry)).run();

      return { metadata: entry, cached: false };
    } catch (error) {
      attempts.push(error?.message || 'fetch failed');
    }
  }

  return { metadata: null, cached: false, error: attempts.length ? attempts.join(' · ') : 'No safe Topps product-page candidate could be generated.' };
}

export function toppsMetadataToEnrichment(metadata) {
  return {
    source: 'Topps',
    sourceUrl: metadata.pageUrl,
    releaseDate: metadata.releaseDate || '',
    overview: metadata.aboutRelease || '',
    formats: [],
    images: []
  };
}
