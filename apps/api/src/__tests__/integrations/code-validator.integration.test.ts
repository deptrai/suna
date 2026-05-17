import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppContext } from '../../types';

let _hasCredits = true;
const _deductCalls: Array<{ accountId: string; tool: string; rows: number; description?: string; sessionId?: string }> = [];

mock.module('../../router/services/billing', () => ({
  checkCredits: async () => ({ hasCredits: _hasCredits, balance: 100, message: _hasCredits ? 'ok' : 'No credits' }),
  deductToolCredits: async (accountId: string, tool: string, rows: number, description?: string, sessionId?: string) => {
    _deductCalls.push({ accountId, tool, rows, description, sessionId });
    return { success: true, cost: 0.01, newBalance: 99.99 };
  },
}));

mock.module('../../config', () => ({
  config: {},
  getToolCost: () => 0.01,
}));

const { codeValidator } = await import('../../router/routes/code-validator');

function makeApp(opts: { accountId?: string | null } = { accountId: 'acct-1' }) {
  const app = new Hono<{ Variables: AppContext }>();
  app.use('*', async (c, next) => {
    if (!opts.accountId) throw new HTTPException(401, { message: 'Unauthenticated' });
    c.set('accountId', opts.accountId);
    await next();
  });
  app.route('/v1/router/code-validator', codeValidator);
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    return c.json({ success: false, error: String(err) }, 500);
  });
  return app;
}

describe('POST /v1/router/code-validator', () => {
  beforeEach(() => {
    _hasCredits = true;
    _deductCalls.length = 0;
  });

  test('[P0] returns 401 when accountId missing', async () => {
    const app = makeApp({ accountId: null });
    const res = await app.request('/v1/router/code-validator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'pragma solidity ^0.8.0;', language: 'solidity' }),
    });
    expect(res.status).toBe(401);
  });

  test('[P0] returns 400 on malformed JSON', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/code-validator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-json',
    });
    expect(res.status).toBe(400);
  });

  test('[P0] returns 400 when language is invalid', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/code-validator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'x', language: 'rust' }),
    });
    expect(res.status).toBe(400);
  });

  test('[P0] returns 400 when code is empty', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/code-validator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '', language: 'solidity' }),
    });
    expect(res.status).toBe(400);
  });

  test('[P0] returns 400 when code is whitespace only', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/code-validator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '   \n  ', language: 'solidity' }),
    });
    expect(res.status).toBe(400);
  });

  test('[P0] returns 400 when code exceeds 50000 chars', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/code-validator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'a'.repeat(50001), language: 'solidity' }),
    });
    expect(res.status).toBe(400);
  });

  test('[P0] returns 402 when no credits', async () => {
    _hasCredits = false;
    const app = makeApp();
    const res = await app.request('/v1/router/code-validator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'pragma solidity ^0.8.0;', language: 'solidity' }),
    });
    expect(res.status).toBe(402);
  });

  test('[P0] returns 200 with response shape on clean code', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/code-validator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'pragma solidity ^0.8.20;', language: 'solidity' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.language).toBe('solidity');
    expect(body.warning_count).toBe(0);
    expect(body.has_high_severity).toBe(false);
    expect(body.sandbox_recommended).toBe(false);
    expect(body.disclaimer).toBeDefined();
    expect(body.report).toContain('No critical issues');
  });

  test('[P0] sets has_high_severity=true and sandbox_recommended=true when HIGH warning detected', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/code-validator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'function withdraw() { msg.sender.call{value: 1}(""); }',
        language: 'solidity',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.has_high_severity).toBe(true);
    expect(body.sandbox_recommended).toBe(true);
    expect(body.warning_count).toBeGreaterThan(0);
  });

  test('[P1] sandbox_recommended=false when only MEDIUM/LOW warnings', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/code-validator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'pragma solidity ^0.7.0;\nrequire(tx.origin == owner);',
        language: 'solidity',
      }),
    });
    const body = await res.json();
    expect(body.has_high_severity).toBe(false);
    expect(body.sandbox_recommended).toBe(false);
    expect(body.warning_count).toBeGreaterThan(0);
  });

  test('[P1] deducts via microtask after returning response', async () => {
    const app = makeApp();
    await app.request('/v1/router/code-validator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'pragma solidity ^0.8.20;', language: 'solidity' }),
    });
    // Wait for microtask to drain
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(_deductCalls.length).toBe(1);
    expect(_deductCalls[0].tool).toBe('code_validator');
  });

  test('[P1] forwards session_id to deduct call', async () => {
    const app = makeApp();
    await app.request('/v1/router/code-validator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'pragma solidity ^0.8.20;',
        language: 'solidity',
        session_id: 'sess-cv',
      }),
    });
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(_deductCalls[0].sessionId).toBe('sess-cv');
  });
});
