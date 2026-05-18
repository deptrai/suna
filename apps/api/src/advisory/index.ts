import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv } from '../types';
import { createIpRateLimit } from '../middleware/ip-rate-limit';
import { advisoryRiskRoute } from '../routes/advisory-risk';

const advisoryApp = new Hono<AppEnv>();

advisoryApp.use('*', cors({
  origin: (origin) => {
    if (!origin) return '';
    if (origin.startsWith('chrome-extension://')) return origin;
    if (origin === 'https://app.chainlens.com' || origin === 'http://localhost:3000' || origin === 'http://127.0.0.1:3000') return origin;
    return '';
  },
  allowMethods: ['GET'],
  allowHeaders: ['Accept', 'Content-Type', 'X-Request-ID'],
  credentials: false,
}));

advisoryApp.use('*', createIpRateLimit({
  rps: Math.max(1, Number.parseInt(process.env.ADVISORY_RATELIMIT_RPS ?? '5', 10) || 5),
  rpm: Math.max(1, Number.parseInt(process.env.ADVISORY_RATELIMIT_RPM ?? '100', 10) || 100),
}));

advisoryApp.route('/risk', advisoryRiskRoute);

export { advisoryApp };
