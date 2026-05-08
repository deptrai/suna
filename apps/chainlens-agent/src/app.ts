import { Hono } from 'hono';
import { requestId } from 'hono/request-id';

// Types
export type Bindings = {
  // Add environment variables here if needed
};

// Override console object to enforce structured logging
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleInfo = console.info;

const createStructuredLog = (level: string, message: any, reqId?: string) => {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message: typeof message === 'string' ? message : JSON.stringify(message),
    requestId: reqId || 'system',
  });
};

console.log = (...args: any[]) => {
  originalConsoleLog(createStructuredLog('INFO', args.join(' ')));
};
console.error = (...args: any[]) => {
  originalConsoleError(createStructuredLog('ERROR', args.join(' ')));
};
console.warn = (...args: any[]) => {
  originalConsoleWarn(createStructuredLog('WARN', args.join(' ')));
};
console.info = (...args: any[]) => {
  originalConsoleInfo(createStructuredLog('INFO', args.join(' ')));
};

const app = new Hono<{ Bindings: Bindings }>();

// Middlewares
app.use('*', requestId());

// Structured JSON Logger Middleware
app.use('*', async (c, next) => {
  const reqId = c.get('requestId');
  const start = Date.now();
  
  // Log request
  originalConsoleInfo(createStructuredLog('INFO', `--> ${c.req.method} ${c.req.url}`, reqId));
  
  await next();
  
  // Log response
  const ms = Date.now() - start;
  originalConsoleInfo(createStructuredLog('INFO', `<-- ${c.req.method} ${c.req.url} ${c.res.status} ${ms}ms`, reqId));
});

// Endpoints
const routes = app
  .get('/healthz', (c) => c.json({ status: 'ok' }))
  .get('/readyz', (c) => c.json({ status: 'ready' }))
  .get('/api/v1/version', (c) => c.json({ version: '1.0.0' }));

// Type-safe RPC Export
export type AppType = typeof routes;

// Graceful Shutdown Handling
let server: any;

export default {
  port: 3000,
  fetch: app.fetch,
  listen(s: any) {
    server = s;
  }
};

const shutdown = () => {
  console.info('Received shutdown signal, starting graceful shutdown...');
  if (server) {
    server.stop(true);
    console.info('Server stopped.');
  }
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
