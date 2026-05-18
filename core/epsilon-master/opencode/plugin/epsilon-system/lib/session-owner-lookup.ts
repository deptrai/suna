import { Database } from 'bun:sqlite';
import { resolveEpsilonDir } from './paths';

type CacheEntry = { userId: string | null; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60 * 1000;

export function lookupSessionOwner(sessionId: string): string | null {
  const now = Date.now();
  const hit = cache.get(sessionId);
  if (hit && hit.expiresAt > now) return hit.userId;

  const dbPath = `${resolveEpsilonDir(import.meta.dir)}/epsilon.db`;
  let userId: string | null = null;
  try {
    const db = new Database(dbPath, { readonly: true });
    try {
      const row = db.query('SELECT user_id FROM session_owners WHERE session_id = ? LIMIT 1').get(sessionId) as { user_id?: string } | null;
      userId = row?.user_id ?? null;
    } finally {
      db.close();
    }
  } catch {
    userId = null;
  }

  cache.set(sessionId, { userId, expiresAt: now + TTL_MS });
  return userId;
}
