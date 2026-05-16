import type { Hono } from 'hono';
import { config } from '../config';

type OpenApiSpec = {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: Array<{ url: string; description: string }>;
  tags: Array<{ name: string; description: string }>;
  paths: Record<string, unknown>;
  components: {
    securitySchemes: Record<string, unknown>;
  };
  security: Array<Record<string, unknown>>;
};

function resolveServerBaseUrl(): string {
  const raw = (config.EPSILON_URL || '').trim();
  if (!raw) return 'http://localhost:3001';
  return raw.replace(/\/v1\/router\/?$/, '').replace(/\/+$/, '');
}

function buildOpenApiSpec(): OpenApiSpec {
  const baseUrl = resolveServerBaseUrl();

  return {
    openapi: '3.0.3',
    info: {
      title: 'Epsilon API',
      version: process.env.SANDBOX_VERSION || 'dev',
      description:
        'Unified API for router, platform, billing, integrations, and sandbox proxy operations.',
    },
    servers: [
      { url: baseUrl, description: 'Current environment' },
      { url: 'http://localhost:3001', description: 'Local development' },
    ],
    tags: [
      { name: 'Health', description: 'Service health and system status' },
      { name: 'Router', description: 'LLM and search routes' },
      { name: 'Platform', description: 'Sandbox and platform operations' },
      { name: 'Billing', description: 'Billing and account lifecycle' },
      { name: 'Preview Proxy', description: 'Sandbox preview and reverse proxy' },
    ],
    paths: {
      '/health': {
        get: {
          tags: ['Health'],
          summary: 'Health check',
          responses: {
            '200': { description: 'Service is healthy' },
          },
        },
      },
      '/v1/health': {
        get: {
          tags: ['Health'],
          summary: 'Versioned health check',
          responses: {
            '200': { description: 'Service is healthy' },
          },
        },
      },
      '/v1/system/status': {
        get: {
          tags: ['Health'],
          summary: 'System maintenance status',
          responses: {
            '200': { description: 'System status payload' },
          },
        },
      },
      '/v1/router/health': {
        get: {
          tags: ['Router'],
          summary: 'Router health check',
          responses: {
            '200': { description: 'Router is healthy' },
          },
        },
      },
      '/v1/router/models': {
        get: {
          tags: ['Router'],
          summary: 'List available models',
          security: [{ BearerAuth: [] }, { EpsilonToken: [] }],
          responses: {
            '200': { description: 'Model list' },
            '401': { description: 'Unauthorized' },
          },
        },
      },
      '/v1/router/chat/completions': {
        post: {
          tags: ['Router'],
          summary: 'Create chat completion',
          security: [{ BearerAuth: [] }, { EpsilonToken: [] }],
          responses: {
            '200': { description: 'Chat completion response' },
            '400': { description: 'Invalid request' },
            '401': { description: 'Unauthorized' },
          },
        },
      },
      '/v1/platform/sandbox': {
        get: {
          tags: ['Platform'],
          summary: 'List sandboxes',
          security: [{ BearerAuth: [] }, { EpsilonToken: [] }],
          responses: {
            '200': { description: 'Sandbox list' },
            '401': { description: 'Unauthorized' },
          },
        },
        post: {
          tags: ['Platform'],
          summary: 'Create sandbox',
          security: [{ BearerAuth: [] }, { EpsilonToken: [] }],
          responses: {
            '200': { description: 'Sandbox created' },
            '401': { description: 'Unauthorized' },
          },
        },
      },
      '/v1/billing/account-state': {
        get: {
          tags: ['Billing'],
          summary: 'Get billing account state',
          security: [{ BearerAuth: [] }, { EpsilonToken: [] }],
          responses: {
            '200': { description: 'Billing account state' },
            '401': { description: 'Unauthorized' },
          },
        },
      },
      '/v1/p/{sandboxId}/{port}/{path}': {
        get: {
          tags: ['Preview Proxy'],
          summary: 'Proxy GET request to sandbox service',
          security: [{ BearerAuth: [] }, { EpsilonToken: [] }],
          parameters: [
            { name: 'sandboxId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'port', in: 'path', required: true, schema: { type: 'integer' } },
            { name: 'path', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': { description: 'Proxied response' },
            '401': { description: 'Unauthorized' },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Supabase JWT token via Authorization: Bearer <token>',
        },
        EpsilonToken: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Epsilon-Token',
          description: 'Sandbox API token (epsilon_...)',
        },
      },
    },
    security: [{ BearerAuth: [] }, { EpsilonToken: [] }],
  };
}

function renderSwaggerHtml(openApiJsonPath: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Epsilon API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      body { margin: 0; background: #fafafa; }
      #swagger-ui { max-width: 1200px; margin: 0 auto; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: '${openApiJsonPath}',
        dom_id: '#swagger-ui',
        deepLinking: true,
        displayRequestDuration: true,
        persistAuthorization: true
      });
    </script>
  </body>
</html>`;
}

export function registerApiDocs(app: Hono): void {
  app.get('/openapi.json', (c) => c.json(buildOpenApiSpec()));
  app.get('/docs', (c) => c.html(renderSwaggerHtml('/openapi.json')));
}

