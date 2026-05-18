const EPSILON_API_URL = process.env.EPSILON_API_URL || process.env.EPSILON_URL || 'http://localhost:8008';
const EPSILON_TOKEN = process.env.EPSILON_TOKEN;

if (!EPSILON_TOKEN) {
  console.warn('[memory-client] EPSILON_TOKEN not set — memory features disabled until env injected');
}

type ChatMessage = { role: string; content: string };

function endpoint(path: string): string {
  // env-injector strips trailing slash from EPSILON_API_URL → base is bare host. Memory routes mount at /v1/router/memory/*.
  return `${EPSILON_API_URL.replace(/\/+$/, '')}/v1/router/memory${path}`;
}

function authHeaders(): Record<string, string> {
  if (!EPSILON_TOKEN) return { 'Content-Type': 'application/json' };
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${EPSILON_TOKEN}`,
  };
}

// F9: cache rendered memory per (userId) for ~30s so repeated messages in the
// same session don't re-hit the backend on every turn. Memory only refreshes
// after extract jobs complete (10min debounce), so 30s staleness is well within
// budget while collapsing N+1 turns into 1 backend call.
type RenderCacheEntry = { rendered: string | null; expiresAt: number };
const renderCache = new Map<string, RenderCacheEntry>();
const RENDER_CACHE_TTL_MS = 30_000;

export async function fetchAccountMemories(userId: string, sessionId: string): Promise<string | null> {
  const now = Date.now();
  const cached = renderCache.get(userId);
  if (cached && cached.expiresAt > now) return cached.rendered;

  try {
    const res = await fetch(endpoint('/render'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ userId, sessionId, maxTokens: 500 }),
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) {
      console.warn(`[memory-client] /render returned ${res.status}`);
      // Cache the null briefly to avoid hammering an unhealthy backend.
      renderCache.set(userId, { rendered: null, expiresAt: now + 5_000 });
      return null;
    }
    const data = await res.json() as { rendered?: string };
    const rendered = data.rendered?.trim() ? data.rendered : null;
    renderCache.set(userId, { rendered, expiresAt: now + RENDER_CACHE_TTL_MS });
    return rendered;
  } catch {
    return null;
  }
}

/** Invalidate the render cache (e.g. after a successful extraction so the next turn sees fresh memory). */
export function invalidateMemoryRenderCache(userId?: string): void {
  if (userId) renderCache.delete(userId);
  else renderCache.clear();
}

export async function triggerExtraction(userId: string, sessionId: string, messages: ChatMessage[]): Promise<void> {
  try {
    const res = await fetch(endpoint('/extract'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ userId, sessionId, messages }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.warn(`[memory-client] /extract returned ${res.status}`);
      return;
    }
    // Extraction succeeded — next render must reflect any new facts.
    invalidateMemoryRenderCache(userId);
  } catch {
    // non-fatal by design
  }
}
