import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { createIntegrationsRouter } from '../../integrations/routes';
import { config } from '../../config';

// Mock resolveAccount
mock.module('../../shared/resolve-account', () => ({
  resolveAccountId: mock(async (userId) => `account-of-${userId}`),
}));

// Mock repositories
mock.module('../../integrations/repositories', () => ({
  insertIntegration: mock(async (data) => ({ integrationId: 'mock-int-id', ...data })),
  listActiveSandboxesByAccount: mock(async () => [{ sandboxId: 'mock-sandbox-1', baseUrl: 'http://localhost:8080' }]),
  linkSandboxIntegration: mock(async () => {}),
  verifySandboxOwnership: mock(async () => true),
  listIntegrationsByAccount: mock(async () => []),
  getIntegrationById: mock(async () => null),
  deleteIntegration: mock(async () => {}),
}));

// Mock providers
mock.module('../../integrations/providers', () => ({
  getProviderFromRequest: mock(async () => ({
    name: 'pipedream',
    listApps: mock(async () => []),
    createConnectToken: mock(async () => ({ token: 'mock-token' })),
    listAccounts: mock(async () => []),
    proxyRequest: mock(async () => ({ status: 200, body: { data: 'mock-data' } })),
  })),
}));

describe('Integrations Router', () => {
  let app: Hono<any>;

  beforeEach(() => {
    app = new Hono<any>();
    // Inject mock userId middleware
    app.use('*', async (c, next) => {
      c.set('userId', 'mock-user');
      await next();
    });
    const router = createIntegrationsRouter();
    app.route('/v1/integrations', router);
  });

  test('[P0] POST /connections/save should save connection and auto-link', async () => {
    const res = await app.request('/v1/integrations/connections/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app: 'slack',
        provider_account_id: 'pd-acc-123'
      })
    });
    
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.integration.integrationId).toBe('mock-int-id');
    expect(body.link.attempted).toBe(true);
  });

  test('[P0] POST /connections/proxy should proxy requests to provider', async () => {
    const res = await app.request('/v1/integrations/connections/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app: 'slack',
        url: 'https://slack.com/api/test',
      })
    });
    
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe(200);
    expect(body.body).toEqual({ data: 'mock-data' });
  });

  test('[P0] POST /webhook should handle pipedream webhooks with missing signature', async () => {
    // If webhook secret is configured, it fails without signature
    config.PIPEDREAM_WEBHOOK_SECRET = 'secret';
    
    const res = await app.request('/v1/integrations/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account_id: 'mock-acc',
        app: 'slack',
        provider_account_id: 'pd-123'
      })
    });
    
    expect(res.status).toBe(401);
  });
});
