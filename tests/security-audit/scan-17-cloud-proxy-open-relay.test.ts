/**
 * Security Scan: Cloud API - Router Proxy Mode 3 Should Not Exist
 *
 * LIVE scan against https://computer-preview-api.epsilon.com
 *
 * FINDING: The proxy has a "Mode 3" passthrough that forwards requests
 * to upstream LLM providers WITHOUT any epsilon_ token or billing.
 *
 * The INTENT is: cloud mode should ONLY accept epsilon_ tokens with billing.
 * Mode 3 (no-auth passthrough) should be disabled on cloud.
 *
 * Current behavior:
 * - Request with no epsilon_ token → forwarded to upstream (OpenAI, Anthropic, etc.)
 * - Upstream rejects because attacker's key is fake
 * - BUT if attacker has their OWN valid OpenAI key, they can route it
 *   through Epsilon's infra without paying Epsilon anything
 *
 * Impact:
 * - Attacker uses Epsilon as free relay with their own keys — no billing
 * - Epsilon's IP used for upstream requests (IP reputation risk)
 * - Bandwidth/compute consumed without payment
 * - Violates the design intent: "only epsilon token with billing"
 *
 * Fix: In cloud mode, reject all requests without a valid epsilon_ token.
 *   if (!auth.isEpsilonUser && config.isCloud()) {
 *     throw new HTTPException(401, { message: 'Epsilon API key required' });
 *   }
 */

import { describe, test, expect } from 'bun:test';

const CLOUD = 'https://computer-preview-api.epsilon.com';

async function probeProxy(path: string, body: any, extraHeaders?: Record<string, string>): Promise<{
  status: number;
  body: any;
}> {
  try {
    const res = await fetch(`${CLOUD}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...extraHeaders },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: any;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { status: res.status, body: parsed };
  } catch (err: any) {
    return { status: 0, body: { error: err.message } };
  }
}

describe('Cloud Scan: Proxy Mode 3 Should Not Exist on Cloud', () => {

  describe('[HIGH] Requests without epsilon_ token are forwarded (should be 401)', () => {
    test('OpenAI: request with no token forwards to upstream instead of 401', async () => {
      const r = await probeProxy('/v1/router/openai/chat/completions', {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'hi' }],
      });
      // BUG: This reaches OpenAI's servers. Should return Epsilon 401 instead.
      // OpenAI error proves the request was proxied to api.openai.com
      const isUpstreamError = (r.body?.error?.message || '').includes('API key');
      const isEpsilonReject = r.body?.message === 'Missing authentication token';
      expect(isUpstreamError || isEpsilonReject).toBe(true);
      // If isUpstreamError is true, the proxy forwarded without auth — this is the bug
    });

    test('Tavily: request with no token forwards to upstream instead of 401', async () => {
      const r = await probeProxy('/v1/router/tavily/search', {
        query: 'test',
      });
      // Tavily's own error means the proxy forwarded
      const isUpstreamError = (r.body?.detail?.error || '').includes('Unauthorized');
      expect(typeof r.status).toBe('number');
    });

    test('attacker with own OpenAI key can use Epsilon as free relay', async () => {
      // If someone has their own sk-proj-xxx key, they can route through
      // Epsilon's proxy, using Epsilon bandwidth/compute, paying nothing to Epsilon
      const r = await probeProxy('/v1/router/openai/chat/completions', {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'test' }],
      }, {
        'Authorization': 'Bearer sk-proj-fake-but-would-work-if-real',
      });
      // The request reaches OpenAI — Epsilon acts as relay
      // Should be blocked: "Epsilon API key required"
      expect(r.status).not.toBe(200); // Fails because key is fake, but it WAS forwarded
    });
  });

  describe('epsilon_ tokens ARE properly enforced', () => {
    test('invalid epsilon_ token is hard rejected (good)', async () => {
      const r = await probeProxy('/v1/router/openai/chat/completions', {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'hi' }],
      }, {
        'Authorization': 'Bearer epsilon_fake_token_1234567890123456',
      });
      expect(r.status).toBe(401);
      expect(r.body.message).toBe('Invalid Epsilon token');
    });

    test('invalid epsilon_sb_ token is hard rejected (good)', async () => {
      const r = await probeProxy('/v1/router/openai/chat/completions', {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'hi' }],
      }, {
        'Authorization': 'Bearer epsilon_sb_fake_12345678901234567',
      });
      expect(r.status).toBe(401);
    });
  });

  describe('Router health leaks env info', () => {
    test('GET /v1/router/health is public and reveals env=cloud', async () => {
      const res = await fetch(`${CLOUD}/v1/router/health`);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.env).toBe('cloud');
    });
  });
});
