import { Hono } from 'hono';

const healthRouter = new Hono();

healthRouter.get('/', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'chainlens-agent',
  });
});

healthRouter.get('/readyz', (c) => {
  // In the future, this should check DB and Redis connections
  return c.json({
    status: 'ready',
    timestamp: new Date().toISOString(),
  });
});

export default healthRouter;
