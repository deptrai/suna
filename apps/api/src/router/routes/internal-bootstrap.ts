import { Hono } from 'hono';
import { and, eq, inArray } from 'drizzle-orm';
import { sandboxes } from '@epsilon/db';
import { db } from '../../shared/db';
import { hashSecretKey } from '../../shared/crypto';
import { getSandboxServiceKeyFromConfig, setSandboxServiceKeyInConfig } from '../../shared/sandbox-secrets';

export const internalBootstrap = new Hono();

type RateEntry = { count: number; windowStartedAt: number };
type InvalidEntry = { firstSeenAt: number; attempts: number; ips: Set<string> };
const rateBySandbox = new Map<string, RateEntry>();
const invalidBySandbox = new Map<string, InvalidEntry>();
const RATE_LIMIT_PER_HOUR = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const INVALID_WINDOW_MS = 10 * 60 * 1000;
const INVALID_ATTEMPT_THRESHOLD = 5;
const INVALID_IP_THRESHOLD = 2;

// Periodic eviction of stale rate-limit entries to bound memory growth
// for sandboxes that were deleted or never call again. Runs every hour.
let rateMapCleanupTimer: ReturnType<typeof setInterval> | null = null;
function startRateMapCleanup(): void {
  if (rateMapCleanupTimer) return;
  rateMapCleanupTimer = setInterval(() => {
    const cutoff = Date.now() - RATE_WINDOW_MS;
    for (const [key, entry] of rateBySandbox.entries()) {
      if (entry.windowStartedAt < cutoff) rateBySandbox.delete(key);
    }
    for (const [key, entry] of invalidBySandbox.entries()) {
      if (entry.firstSeenAt < cutoff) invalidBySandbox.delete(key);
    }
  }, RATE_WINDOW_MS);
  if (typeof rateMapCleanupTimer.unref === 'function') rateMapCleanupTimer.unref();
}
startRateMapCleanup();

// Trust the connection's actual remote IP unless we have a configured trusted
// proxy chain. X-Forwarded-For is client-controllable when no proxy strips it.
function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  const trustedProxy = process.env.TRUSTED_PROXY_IPS?.trim();
  if (trustedProxy) {
    const xff = c.req.header('x-forwarded-for');
    if (xff) return xff.split(',')[0]?.trim() || '';
    const xri = c.req.header('x-real-ip');
    if (xri) return xri.trim();
  }
  // Fall back to direct connection IP (Hono exposes via env-specific bindings).
  // When behind an untrusted proxy, the IP check should be considered a NIT layer
  // — the real gate is the PROVISIONING_KEY hash check below.
  return '';
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

function noteInvalidAttempt(sandboxId: string, ip: string): { suspicious: boolean; attempts: number; uniqueIps: number } {
  const now = Date.now();
  const current = invalidBySandbox.get(sandboxId);
  if (!current || now - current.firstSeenAt > INVALID_WINDOW_MS) {
    const next: InvalidEntry = { firstSeenAt: now, attempts: 1, ips: new Set(ip ? [ip] : []) };
    invalidBySandbox.set(sandboxId, next);
    return { suspicious: false, attempts: 1, uniqueIps: next.ips.size };
  }
  current.attempts += 1;
  if (ip) current.ips.add(ip);
  const suspicious = current.attempts >= INVALID_ATTEMPT_THRESHOLD
    && (current.ips.size >= INVALID_IP_THRESHOLD || current.ips.size === 0);
  return { suspicious, attempts: current.attempts, uniqueIps: current.ips.size };
}

export function validateProvisioningKeyExpiry(
  metadata: Record<string, unknown> | null | undefined,
  nowMs: number = Date.now(),
): { ok: true } | { ok: false; error: string } {
  const expiresAtRaw = metadata?.provisioningKeyExpiresAt;
  if (typeof expiresAtRaw !== 'string') {
    return { ok: false, error: 'provisioning key expiry missing' };
  }
  const expiresAtMs = Date.parse(expiresAtRaw);
  if (!Number.isFinite(expiresAtMs)) {
    return { ok: false, error: 'provisioning key expiry invalid' };
  }
  if (expiresAtMs <= nowMs) {
    return { ok: false, error: 'provisioning key expired' };
  }
  return { ok: true };
}

export function __testNoteInvalidAttempt(sandboxId: string, ip: string): { suspicious: boolean; attempts: number; uniqueIps: number } {
  return noteInvalidAttempt(sandboxId, ip);
}

export function __testClearBootstrapAttemptState(sandboxId: string): void {
  rateBySandbox.delete(sandboxId);
  invalidBySandbox.delete(sandboxId);
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

  const clientIp = getClientIp(c);
  // IP allowlist is a defense-in-depth layer; only enforce when we trust the
  // proxy chain (TRUSTED_PROXY_IPS set). Otherwise the PROVISIONING_KEY hash
  // is the sole gate and we skip the check rather than rely on spoofable XFF.
  if (process.env.ENV_MODE === 'cloud' && process.env.TRUSTED_PROXY_IPS && !isAllowedInternalIp(clientIp)) {
    return c.json({ error: 'ip not allowed' }, 403);
  }

  if (!consumeRateLimit(sandboxId)) {
    return c.json({ error: 'rate limit exceeded' }, 429);
  }

  // Accept both 'active' and 'provisioning' — async providers boot the container
  // (which calls bootstrap on startup) before the background goroutine flips
  // the row to 'active'. The provisioningKey hash is the security gate; status
  // is just a sanity filter to skip archived/error rows.
  const [sandbox] = await db
    .select()
    .from(sandboxes)
    .where(and(
      eq(sandboxes.sandboxId, sandboxId),
      inArray(sandboxes.status, ['active', 'provisioning']),
    ))
    .limit(1);

  if (!sandbox) {
    return c.json({ error: 'sandbox not found' }, 404);
  }

  if (!sandbox.provisioningKey) {
    return c.json({ error: 'sandbox not provisioned for canonical bootstrap' }, 428);
  }

  const meta = (sandbox.metadata as Record<string, unknown> | null) ?? {};
  const expiry = validateProvisioningKeyExpiry(meta);
  if (!expiry.ok) {
    return c.json({ error: expiry.error }, 401);
  }

  const providedHash = hashSecretKey(rawToken);
  if (providedHash !== sandbox.provisioningKey) {
    const verdict = noteInvalidAttempt(sandboxId, clientIp);
    if (verdict.suspicious) {
      await db
        .update(sandboxes)
        .set({
          provisioningKey: null,
          metadata: {
            ...meta,
            provisioningKeyInvalidatedAt: new Date().toISOString(),
            provisioningKeyInvalidationReason: 'suspicious_bootstrap_pulls',
          },
          updatedAt: new Date(),
        })
        .where(eq(sandboxes.sandboxId, sandboxId));
      console.warn(
        `[bootstrap-token] invalidated provisioning key for sandbox=${sandboxId} due to suspicious pulls attempts=${verdict.attempts} uniqueIps=${verdict.uniqueIps}`,
      );
    }
    return c.json({ error: 'invalid provisioning key' }, 401);
  }
  invalidBySandbox.delete(sandboxId);

  const serviceKey = getSandboxServiceKeyFromConfig(sandbox.config as Record<string, unknown> | null);
  if (!serviceKey.trim()) {
    return c.json({ error: 'serviceKey not configured' }, 500);
  }

  const cfg = (sandbox.config as Record<string, unknown> | null) ?? {};
  if (typeof cfg.serviceKey === 'string' && typeof cfg.serviceKeyEnc !== 'string') {
    db.update(sandboxes)
      .set({ config: setSandboxServiceKeyInConfig(cfg, serviceKey), updatedAt: new Date() })
      .where(eq(sandboxes.sandboxId, sandbox.sandboxId))
      .catch(() => {});
  }

  console.log(`[bootstrap-token] sandbox=${sandbox.sandboxId} requested from ip=${clientIp || 'unknown'}`);

  return c.json({
    sandboxId: sandbox.sandboxId,
    serviceKey,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });
});
