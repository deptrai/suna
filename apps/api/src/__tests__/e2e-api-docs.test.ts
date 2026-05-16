import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { registerApiDocs } from '../docs/api-docs';

describe('API docs endpoints', () => {
  const app = new Hono();
  registerApiDocs(app);

  test('GET /openapi.json returns OpenAPI document', async () => {
    const res = await app.request('/openapi.json');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.openapi).toBe('3.0.3');
    expect(body.info?.title).toBe('Epsilon API');
    expect(body.paths?.['/v1/router/chat/completions']).toBeDefined();
  });

  test('GET /docs returns Swagger UI html', async () => {
    const res = await app.request('/docs');
    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain('SwaggerUIBundle');
    expect(html).toContain('/openapi.json');
  });
});

