import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';

import healthRouter from './routes/health';

export type AppEnv = {
  Variables: {
    requestId: string;
  };
};

const app = new Hono<AppEnv>();

// Middleware
app.use('*', logger());
app.use('*', cors());
app.use('*', async (c, next) => {
  c.set('requestId', crypto.randomUUID());
  await next();
});

// Routes
const routes = app
  .route('/healthz', healthRouter);

export type AppType = typeof routes;
export default app;
