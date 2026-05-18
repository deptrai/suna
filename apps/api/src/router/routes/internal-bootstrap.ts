import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { sandboxes } from '@epsilon/db';
import { db } from '../../shared/db';
import { hashSecretKey } from '../../shared/crypto';

export const internalBootstrap = new Hono();

type RateEntry = { count: number; windowStartedAt: number };
const rateBySandbox = new Map<string, RateEntry>();
const RATE_LIMIT_PER_HOUR = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000;

function getClientIp(headerValue: string | undefined): string {
  if (!headerValue) return '';
  return headerValue.split(',')[0]?.trim() || '';
}

function isAllowedInternalIp(ip: string): boolean {
  if (!ip) return false;
  if (ip === '::1' || ip === '127.0.0.1') return true;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  const m = ip.match(/^172\.(\d{1,3})\./);
  if (m) {
    const octet = Number(m[1]);
    if (Number.isFinite(octet) && octet >= 16 && octet <= 31) return true;
  }
  return false;
}

function consumeRateLimit(sandboxId: string): boolean {
  const now = Date.now();
  const current = rateBySandbox.get(sandboxId);
  if (!current || now - current.windowStartedAt > RATE_WINDOW_MS) {
    rateBySandbox.set(sandboxId, { count: 1, windowStartedAt: now });
    return true;
  }
  if (current.count >= RATE_LIMIT_PER_HOUR) return false;
  current.count += 1;
  return true;
}

internalBootstrap.get('/bootstrap-token', async (c) => {
  const sandboxId = c.req.query('sandboxId')?.trim();
  if (!sandboxId) {
    return c.json({ error: 'sandboxId is required' }, 400);
  }

  const authHeader = c.req.header('authorization') || c.req.header('Authorization') || '';
  const rawToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!rawToken) {
    return c.json({ error: 'missing bearer token' }, 401);
  }

  const clientIp = getClientIp(c.req.header('x-forwarded-for') || c.req.header('x-real-ip'));
  if (process.env.ENV_MODE === 'cloud' && !isAllowedInternalIp(clientIp)) {
    return c.json({ error: 'ip not allowed' }, 403);
  }

  if (!consumeRateLimit(sandboxId)) {
    return c.json({ error: 'rate limit exceeded' }, 429);
  }

  const [sandbox] = await db
    .select()
    .from(sandboxes)
    .where(and(eq(sandboxes.sandboxId, sandboxId), eq(sandboxes.status, 'active')))
    .limit(1);

  if (!sandbox) {
    return c.json({ error: 'sandbox not found' }, 404);
  }

  if (!sandbox.provisioningKey) {
    return c.json({ error: 'sandbox not provisioned for canonical bootstrap' }, 428);
  }

  const providedHash = hashSecretKey(rawToken);
  if (providedHash !== sandbox.provisioningKey) {
    return c.json({ error: 'invalid provisioning key' }, 401);
  }

  const serviceKey = (sandbox.config as Record<string, unknown> | null)?.serviceKey;
  if (typeof serviceKey !== 'string' || !serviceKey.trim()) {
    return c.json({ error: 'serviceKey not configured' }, 500);
  }

  console.log(`[bootstrap-token] sandbox=${sandbox.sandboxId} requested from ip=${clientIp || 'unknown'}`);

  return c.json({
    sandboxId: sandbox.sandboxId,
    serviceKey,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });
});
