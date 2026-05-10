import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { createIntegrationsTokenRouter } from '../../integrations/routes';

// Mock repositories
mock.module('../../integrations/repositories', () => ({
  getIntegrationForSandbox: mock(async () => ({
    integrationId: 'mock-int-1',
    providerAccountId: 'pd-123',
    app: 'slack',
    accountId: 'mock-account'
  })),
  updateIntegrationLastUsed: mock(async () => {}),
  listSandboxIntegrations: mock(async () => []),
}));

// Mock providers
mock.module('../../integrations/providers', () => ({
  getProviderFromRequest: mock(async () => ({
    name: 'pipedream',
    getAuthToken: mock(async () => ({ accessToken: 'mock-access', tokenType: 'Bearer' })),
    proxyRequest: mock(async () => ({ status: 200, body: { data: 'mock-data' } })),
    runAction: mock(async () => ({ success: true, result: 'done' })),
  })),
}));

describe('Integrations Sandbox Token Router', () => {
  let app: Hono<any>;

  beforeEach(() => {
    app = new Hono<any>();
    // Inject mock sandbox middleware
    app.use('*', async (c, next) => {
      c.set('sandboxId', 'mock-sandbox-1');
      c.set('accountId', 'mock-account');
      await next();
    });
    const router = createIntegrationsTokenRouter();
    app.route('/v1/sandbox/integrations', router);
  });

  test('[P0] POST /token should fetch token for linked sandbox', async () => {
    const res = await app.request('/v1/sandbox/integrations/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app: 'slack' })
    });
    
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.access_token).toBe('mock-access');
    expect(body.app).toBe('slack');
  });

  test('[P0] POST /proxy should proxy requests via sandbox link', async () => {
    const res = await app.request('/v1/sandbox/integrations/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app: 'slack',
        method: 'GET',
        url: 'https://slack.com/api/test'
      })
    });
    
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe(200);
    expect(body.body).toEqual({ data: 'mock-data' });
  });

  test('[P1] POST /run-action should run provider action', async () => {
    const res = await app.request('/v1/sandbox/integrations/run-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app: 'slack',
        action_key: 'post-message',
        props: { channel: '#general' }
      })
    });
    
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
