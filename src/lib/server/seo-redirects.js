// Follow only same-site, absolute paths stored in the seo_redirects table.
// Used only when a product or subject would otherwise return 404.
export async function lookupLegacyRedirect(database, originalPath) {
  if (!/^\/(?:sets\/[a-z0-9-]+|subjects\/[0-9]+)$/.test(originalPath)) return null;

  let path = originalPath;
  const seen = new Set([path]);
  for (let hop = 0; hop < 8; hop++) {
    const row = await database.prepare(
      'SELECT new_path FROM seo_redirects WHERE old_path = ? LIMIT 1'
    ).bind(path).first();
    if (!row) return path === originalPath ? null : path;
    const next = String(row.new_path || '');
    if (!/^\/(?:sets\/[a-z0-9-]+|subjects\/[0-9]+)$/.test(next) || seen.has(next)) {
      return null; // Malformed or cyclic mapping; avoid an open redirect or loop.
    }
    seen.add(next);
    path = next;
  }
  return null;
}
