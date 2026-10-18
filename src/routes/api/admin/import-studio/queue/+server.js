import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

const MAX_BYTES = 6_000_000;
const allowedStatuses = new Set(['Prepared', 'Needs review', 'Failed']);
function idFor(value) { return /^[a-f0-9]{64}$/.test(String(value || '')) ? String(value) : null; }
function bucket(platform) { return platform?.env?.SET_IMAGES; }

export async function GET({ platform, url }) {
  const database = db(platform);
  const id = idFor(url.searchParams.get('id'));
  if (id) {
    const row = await database.prepare('SELECT * FROM studio_intake_queue WHERE id=?').bind(id).first();
    if (!row) return json({ message: 'Queue record not found.' }, { status: 404 });
    if (!bucket(platform)) return json({ message: 'R2 SET_IMAGES binding unavailable.' }, { status: 503 });
    const object = await bucket(platform).get(row.blob_key);
    if (!object) return json({ message: 'Queue snapshot missing in R2.' }, { status: 404 });
    return json({ row: JSON.parse(await object.text()) });
  }
  const result = await database.prepare('SELECT id,product_name,year,source_url,source,status,card_count,issue_count,updated_at FROM studio_intake_queue ORDER BY updated_at DESC LIMIT 250').all();
  return json({ rows: result.results || [] });
}

export async function POST({ platform, request }) {
  if (!bucket(platform)) return json({ message: 'R2 SET_IMAGES binding unavailable.' }, { status: 503 });
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BYTES) return json({ message: 'Prepared snapshot exceeds the 6 MB limit. Split or import manually.' }, { status: 413 });
  let body; try { body = JSON.parse(text); } catch { return json({message:'Invalid JSON.'},{status:400}); }
  const id = idFor(body?.id);
  const row = body?.row;
  if (!id || !row || !row.checklistUrl || !row.name || !Number.isInteger(Number(row.year)) || !allowedStatuses.has(row.status)) return json({ message: 'Invalid queue record.' }, { status: 400 });
  if (row.status !== 'Failed' && (!Array.isArray(row.cards) || !row.parsed?.checklist_meta)) return json({message:'Missing parsed snapshot.'},{status:400});
  const dbi = db(platform);
  const key = `studio-queue/${id}.json`;
  await bucket(platform).put(key, text.replace(/^/, ''), { httpMetadata: { contentType: 'application/json' } });
  await dbi.prepare(`INSERT INTO studio_intake_queue (id,product_name,year,source_url,source,status,card_count,issue_count,blob_key,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(id) DO UPDATE SET product_name=excluded.product_name,year=excluded.year,source_url=excluded.source_url,source=excluded.source,status=excluded.status,card_count=excluded.card_count,issue_count=excluded.issue_count,blob_key=excluded.blob_key,updated_at=datetime('now')`)
    .bind(id,String(row.name),Number(row.year),String(row.checklistUrl),String(row.source||''),row.status,Array.isArray(row.cards)?row.cards.length:0,Array.isArray(row.issues)?row.issues.length:0,key).run();
  return json({ok:true,id});
}

export async function DELETE({ platform, url }) {
  const id = idFor(url.searchParams.get('id'));
  if (!id) return json({message:'Invalid queue ID.'},{status:400});
  const database = db(platform);
  const row = await database.prepare('SELECT blob_key FROM studio_intake_queue WHERE id=?').bind(id).first();
  if (!row) return json({ok:true});
  await database.prepare('DELETE FROM studio_intake_queue WHERE id=?').bind(id).run();
  if (bucket(platform)) await bucket(platform).delete(row.blob_key);
  return json({ok:true});
}
