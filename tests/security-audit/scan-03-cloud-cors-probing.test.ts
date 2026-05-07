/**
 * Security Scan: Cloud API - CORS Probing
 *
 * LIVE scan against https://computer-preview-api.epsilon.com
 * Tests CORS configuration by sending requests from various origins.
 *
 * FINDINGS:
 * [PASS] Legitimate origin gets access-control-allow-origin reflected
 * [PASS] Evil origin does NOT get access-control-allow-origin header
 * [PASS] OPTIONS preflight from evil origin does NOT get allow-origin
 * [PASS] OPTIONS preflight from legit origin gets proper CORS headers
 * [NOTE] access-control-allow-credentials: true is always set (even without allow-origin)
 *        This is harmless because browsers enforce both headers together.
 */

import { describe, test, expect } from 'bun:test';

const CLOUD = 'https://computer-preview-api.epsilon.com';

async function probeWithOrigin(
  method: string,
  path: string,
  origin: string,
  extraHeaders?: Record<string, string>,
): Promise<{
  status: number;
  headers: Record<string, string>;
  body: any;
}> {
  const headers: Record<string, string> = { 'Origin': origin, ...extraHeaders };
  try {
    const res = await fetch(`${CLOUD}${path}`, { method, headers });
    const text = await res.text();
    let parsed: any;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    const h: Record<string, string> = {};
    res.headers.forEach((v, k) => { h[k] = v; });
    return { status: res.status, headers: h, body: parsed };
  } catch (err: any) {
    return { status: 0, headers: {}, body: { error: err.message } };
  }
}

describe('Cloud Scan: CORS Probing', () => {

  describe('Legitimate origins', () => {
    test('computer-preview.epsilon.com gets allow-origin', async () => {
      const r = await probeWithOrigin('GET', '/v1/health', 'https://computer-preview.epsilon.com');
      expect(r.headers['access-control-allow-origin']).toBe('https://computer-preview.epsilon.com');
      expect(r.headers['access-control-allow-credentials']).toBe('true');
    });

    test('epsilon.com gets allow-origin', async () => {
      const r = await probeWithOrigin('GET', '/v1/health', 'https://epsilon.com');
      expect(r.headers['access-control-allow-origin']).toBe('https://epsilon.com');
    });

    test('www.epsilon.com gets allow-origin', async () => {
      const r = await probeWithOrigin('GET', '/v1/health', 'https://www.epsilon.com');
      expect(r.headers['access-control-allow-origin']).toBe('https://www.epsilon.com');
    });

    test('staging.epsilon.com gets allow-origin', async () => {
      const r = await probeWithOrigin('GET', '/v1/health', 'https://staging.epsilon.com');
      expect(r.headers['access-control-allow-origin']).toBe('https://staging.epsilon.com');
    });
  });

  describe('Malicious origins', () => {
    test('evil.com does NOT get allow-origin', async () => {
      const r = await probeWithOrigin('GET', '/v1/health', 'https://evil.com');
      expect(r.headers['access-control-allow-origin']).toBeUndefined();
    });

    test('null origin does NOT get allow-origin', async () => {
      const r = await probeWithOrigin('GET', '/v1/health', 'null');
      expect(r.headers['access-control-allow-origin']).toBeUndefined();
    });

    test('evil subdomain evil.epsilon.com does NOT get allow-origin', async () => {
      const r = await probeWithOrigin('GET', '/v1/health', 'https://evil.epsilon.com');
      expect(r.headers['access-control-allow-origin']).toBeUndefined();
    });

    test('similar domain k0rtix.com does NOT get allow-origin', async () => {
      const r = await probeWithOrigin('GET', '/v1/health', 'https://k0rtix.com');
      expect(r.headers['access-control-allow-origin']).toBeUndefined();
    });

    test('HTTP downgrade http://epsilon.com does NOT get allow-origin', async () => {
      const r = await probeWithOrigin('GET', '/v1/health', 'http://epsilon.com');
      expect(r.headers['access-control-allow-origin']).toBeUndefined();
    });

    test('epsilon.com.evil.com does NOT get allow-origin', async () => {
      const r = await probeWithOrigin('GET', '/v1/health', 'https://epsilon.com.evil.com');
      expect(r.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('Preflight (OPTIONS) requests', () => {
    test('OPTIONS from legit origin gets full CORS headers', async () => {
      const r = await probeWithOrigin('OPTIONS', '/v1/accounts', 'https://computer-preview.epsilon.com', {
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Authorization',
      });
      expect(r.status).toBe(204);
      expect(r.headers['access-control-allow-origin']).toBe('https://computer-preview.epsilon.com');
      expect(r.headers['access-control-allow-methods']).toContain('POST');
      expect(r.headers['access-control-allow-headers']).toContain('Authorization');
    });

    test('OPTIONS from evil origin does NOT get allow-origin', async () => {
      const r = await probeWithOrigin('OPTIONS', '/v1/accounts', 'https://evil.com', {
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Authorization',
      });
      // Should return 204 but WITHOUT allow-origin
      expect(r.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('CORS on error responses', () => {
    test('401 from legit origin still includes CORS headers', async () => {
      const r = await probeWithOrigin('GET', '/v1/accounts', 'https://computer-preview.epsilon.com');
      expect(r.status).toBe(401);
      expect(r.headers['access-control-allow-origin']).toBe('https://computer-preview.epsilon.com');
    });

    test('401 from evil origin does NOT include allow-origin', async () => {
      const r = await probeWithOrigin('GET', '/v1/accounts', 'https://evil.com');
      expect(r.status).toBe(401);
      expect(r.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('Vary header', () => {
    test('responses include Vary: Origin', async () => {
      const r = await probeWithOrigin('GET', '/v1/health', 'https://computer-preview.epsilon.com');
      expect(r.headers['vary']).toContain('Origin');
    });
  });
});
