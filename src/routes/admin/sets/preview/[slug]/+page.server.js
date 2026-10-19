import { load as loadSet } from '../../../../sets/[slug]/+page.server.js';

export async function load(event) {
  event.setHeaders({ 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' });
  return loadSet(event);
}
