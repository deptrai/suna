import { Hono } from 'hono';
import { logger } from 'hono/logger';

const app = new Hono();
app.use('*', logger());

const UPSTREAM_BASE_URL = (process.env.UPSTREAM_BASE_URL || 'https://v98store.com/v1').replace(/\/$/, '');
const UPSTREAM_API_KEY = process.env.UPSTREAM_API_KEY || '';
const FALLBACK_BASE_URL = (process.env.FALLBACK_BASE_URL || '').replace(/\/$/, '');
const FALLBACK_API_KEY = process.env.FALLBACK_API_KEY || '';
const PORT = Number(process.env.PORT || 3002);

const CLAUDE_FALLBACK_MODELS = new Set([
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
  'claude-haiku-4-5-20251001',
]);
const FALLBACK_HEADER = 'X-Fallback-Source';
const SOURCE_TAG = 'chainlens-proxy';

app.get('/', (c) => c.text('Chainlens MaaS Proxy Gateway is running!'));
app.get('/health', (c) => c.json({
  ok: true,
  upstream: UPSTREAM_BASE_URL,
  fallback: FALLBACK_BASE_URL || null,
}));

function isFallbackEligibleModel(rawBody: string): { eligible: boolean; model: string | null } {
  try {
    const parsed = JSON.parse(rawBody);
    const model = typeof parsed?.model === 'string' ? parsed.model : null;
    return { eligible: !!model && CLAUDE_FALLBACK_MODELS.has(model), model };
  } catch {
    return { eligible: false, model: null };
  }
}

async function callUpstream(
  url: string,
  apiKey: string,
  body: string,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body,
  });
}

async function passthrough(c: any, subPath: string) {
  const incomingAuth = c.req.header('Authorization');
  const apiKey = incomingAuth?.startsWith('Bearer ')
    ? incomingAuth.slice(7)
    : UPSTREAM_API_KEY;
  const fallbackSource = c.req.header(FALLBACK_HEADER);

  if (!apiKey) {
    return c.json({ error: 'Missing API key (set UPSTREAM_API_KEY or send Authorization header)' }, 401);
  }

  const body = await c.req.text();
  const primaryUrl = `${UPSTREAM_BASE_URL}${subPath}`;

  let primaryRes: Response | null = null;
  let primaryError: unknown = null;
  try {
    primaryRes = await callUpstream(primaryUrl, apiKey, body);
  } catch (err) {
    primaryError = err;
  }

  // Fallback eligibility:
  // - Have a configured fallback target
  // - Model is in the claude whitelist
  // - This request was NOT itself a fallback retry (loop guard)
  // - Primary either threw or returned >=500
  const { eligible, model } = isFallbackEligibleModel(body);
  const primaryStatus = primaryRes?.status ?? 0;
  const shouldFallback =
    !!FALLBACK_BASE_URL &&
    !!FALLBACK_API_KEY &&
    eligible &&
    !fallbackSource &&
    (primaryError !== null || primaryStatus >= 500);

  if (shouldFallback) {
    console.log(
      `[fallback] primary=${UPSTREAM_BASE_URL} status=${primaryStatus} err=${
        primaryError ? String((primaryError as Error).message ?? primaryError) : 'none'
      } → retry ${FALLBACK_BASE_URL} model=${model}`,
    );
    try {
      const fallbackRes = await callUpstream(
        `${FALLBACK_BASE_URL}${subPath}`,
        FALLBACK_API_KEY,
        body,
        { [FALLBACK_HEADER]: SOURCE_TAG },
      );
      return new Response(fallbackRes.body, {
        status: fallbackRes.status,
        headers: {
          'Content-Type': fallbackRes.headers.get('Content-Type') || 'application/json',
          'Cache-Control': 'no-cache',
        },
      });
    } catch (fbErr) {
      console.error(`[fallback] secondary also failed: ${(fbErr as Error).message}`);
      return c.json({ error: 'Both primary and fallback upstreams failed', detail: String((fbErr as Error).message) }, 502);
    }
  }

  if (primaryError !== null) {
    return c.json({ error: 'Upstream fetch failed', detail: String((primaryError as Error).message) }, 502);
  }

  return new Response(primaryRes!.body, {
    status: primaryRes!.status,
    headers: {
      'Content-Type': primaryRes!.headers.get('Content-Type') || 'application/json',
      'Cache-Control': 'no-cache',
    },
  });
}

app.post('/v1/chat/completions', (c) => passthrough(c, '/chat/completions'));
app.post('/v1/messages', (c) => passthrough(c, '/messages'));

app.get('/v1/models', async (c) => {
  const upstream = await fetch(`${UPSTREAM_BASE_URL}/models`, {
    headers: UPSTREAM_API_KEY ? { Authorization: `Bearer ${UPSTREAM_API_KEY}` } : {},
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') || 'application/json' },
  });
});

console.log(`[chainlens-proxy] listening on :${PORT}, upstream=${UPSTREAM_BASE_URL}, fallback=${FALLBACK_BASE_URL || '<none>'}`);

export default {
  port: PORT,
  fetch: app.fetch,
};
