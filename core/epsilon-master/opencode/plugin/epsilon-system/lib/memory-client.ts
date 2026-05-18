const EPSILON_API_URL = process.env.EPSILON_API_URL || process.env.EPSILON_URL || 'http://localhost:8008/v1';
const EPSILON_TOKEN = process.env.EPSILON_TOKEN;

type ChatMessage = { role: string; content: string };

function endpoint(path: string): string {
  return `${EPSILON_API_URL.replace(/\/+$/, '')}/memory${path}`;
}

function authHeaders(): Record<string, string> {
  if (!EPSILON_TOKEN) return { 'Content-Type': 'application/json' };
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${EPSILON_TOKEN}`,
  };
}

export async function fetchAccountMemories(userId: string, sessionId: string): Promise<string | null> {
  try {
    const res = await fetch(endpoint('/render'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ userId, sessionId, maxTokens: 500 }),
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    const data = await res.json() as { rendered?: string };
    return data.rendered?.trim() ? data.rendered : null;
  } catch {
    return null;
  }
}

export async function triggerExtraction(userId: string, sessionId: string, messages: ChatMessage[]): Promise<void> {
  try {
    await fetch(endpoint('/extract'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ userId, sessionId, messages }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    // non-fatal by design
  }
}
