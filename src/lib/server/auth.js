import { db } from '$lib/server/db';

const SESSION_COOKIE = 'setbound_session';
const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 100000;

function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  if (!hex || hex.length % 2) return new Uint8Array();
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export async function hashPassword(password, saltHex = null) {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    key,
    256
  );
  return { hash: bytesToHex(new Uint8Array(bits)), salt: bytesToHex(salt) };
}

export async function verifyPassword(password, storedHash, storedSalt) {
  const result = await hashPassword(password, storedSalt);
  if (result.hash.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < result.hash.length; i++) diff |= result.hash.charCodeAt(i) ^ storedHash.charCodeAt(i);
  return diff === 0;
}

export async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export async function createSession(event, userId) {
  const database = db(event.platform);
  const rawToken = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256(rawToken);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);

  await database.prepare(
    'INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)'
  ).bind(userId, tokenHash, expires.toISOString()).run();

  event.cookies.set(SESSION_COOKIE, rawToken, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: event.url.protocol === 'https:',
    maxAge: SESSION_DAYS * 86400
  });
}

export async function destroySession(event) {
  const rawToken = event.cookies.get(SESSION_COOKIE);
  if (rawToken) {
    try {
      const tokenHash = await sha256(rawToken);
      await db(event.platform).prepare('DELETE FROM user_sessions WHERE token_hash = ?').bind(tokenHash).run();
    } catch {}
  }
  event.cookies.delete(SESSION_COOKIE, { path: '/' });
}

export async function getSessionUser(event) {
  const rawToken = event.cookies.get(SESSION_COOKIE);
  if (!rawToken) return null;

  try {
    const tokenHash = await sha256(rawToken);
    const user = await db(event.platform).prepare(`
      SELECT u.id, u.email, u.display_name, u.created_at
      FROM user_sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > datetime('now')
    `).bind(tokenHash).first();

    if (!user) event.cookies.delete(SESSION_COOKIE, { path: '/' });
    return user || null;
  } catch {
    return null;
  }
}
