import { Hono } from 'hono';
import { logger } from 'hono/logger';

const app = new Hono();

app.use('*', logger());

const UPSTREAM_BASE_URL = (process.env.UPSTREAM_BASE_URL || 'https://v98store.com/v1').replace(/\/$/, '');
const UPSTREAM_API_KEY = process.env.UPSTREAM_API_KEY || '';
const PORT = Number(process.env.PORT || 3002);

app.get('/', (c) => c.text('Chainlens MaaS Proxy Gateway is running!'));
app.get('/health', (c) => c.json({ ok: true, upstream: UPSTREAM_BASE_URL }));

// OpenAI-compatible passthrough. Forwards body 1:1, including streaming.
// BYOK: caller's `Authorization: Bearer ...` is forwarded if present;
// otherwise fall back to UPSTREAM_API_KEY (server-side managed key).
async function passthrough(c: any, subPath: string) {
  const incomingAuth = c.req.header('Authorization');
  const apiKey = incomingAuth?.startsWith('Bearer ')
    ? incomingAuth.slice(7)
    : UPSTREAM_API_KEY;

  if (!apiKey) {
    return c.json({ error: 'Missing API key (set UPSTREAM_API_KEY or send Authorization header)' }, 401);
  }

  const url = `${UPSTREAM_BASE_URL}${subPath}`;
  const body = await c.req.text();

  const upstream = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body,
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
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

console.log(`[chainlens-proxy] listening on :${PORT}, upstream=${UPSTREAM_BASE_URL}`);

export default {
  port: PORT,
  fetch: app.fetch,
};
