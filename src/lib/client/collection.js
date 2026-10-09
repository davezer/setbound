const KEY = 'setbound:owned';

export function getOwned() {
  if (typeof localStorage === 'undefined') return new Set();
  try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]').map(String)); }
  catch { return new Set(); }
}

export function setOwned(ids) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify([...ids]));
}

export function toggleOwned(id) {
  const owned = getOwned();
  const key = String(id);
  if (owned.has(key)) owned.delete(key); else owned.add(key);
  setOwned(owned);
  return owned;
}
