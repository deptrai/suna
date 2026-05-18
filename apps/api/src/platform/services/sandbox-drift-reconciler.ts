import { eq } from 'drizzle-orm';
import { sandboxes } from '@epsilon/db';
import { db } from '../../shared/db';
import { config } from '../../config';

const INTERVAL_MS = 60_000;
let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

function getServiceKeyFromConfig(value: unknown): string {
  const cfg = (value as Record<string, unknown> | null) || null;
  return typeof cfg?.serviceKey === 'string' ? cfg.serviceKey : '';
}

function buildHeaders(serviceKey: string, metadata: Record<string, unknown> | null): Record<string, string> {
  const headers: Record<string, string> = { Authorization: `Bearer ${serviceKey}` };
  const proxyToken = metadata?.justavpsProxyToken;
  if (typeof proxyToken === 'string' && proxyToken) {
    headers['X-Proxy-Token'] = proxyToken;
  }
  return headers;
}

async function getEnvValue(baseUrl: string, key: string, headers: Record<string, string>): Promise<string> {
  const res = await fetch(`${baseUrl}/env/${encodeURIComponent(key)}`, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(7_000),
  });
  if (!res.ok) throw new Error(`read ${key} failed (${res.status})`);
  const body = await res.json() as Record<string, string | null>;
  return typeof body?.[key] === 'string' ? body[key] : '';
}

async function rotateToken(baseUrl: string, token: string, headers: Record<string, string>): Promise<void> {
  const res = await fetch(`${baseUrl}/env/rotate-token`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`rotate-token failed (${res.status})`);
}

async function runOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const active = await db
      .select({
        sandboxId: sandboxes.sandboxId,
        status: sandboxes.status,
        baseUrl: sandboxes.baseUrl,
        config: sandboxes.config,
        metadata: sandboxes.metadata,
      })
      .from(sandboxes)
      .where(eq(sandboxes.status, 'active'));

    for (const sandbox of active) {
      const serviceKey = getServiceKeyFromConfig(sandbox.config);
      if (!serviceKey || !sandbox.baseUrl) continue;

      const metadata = (sandbox.metadata as Record<string, unknown> | null) || null;
      const headers = buildHeaders(serviceKey, metadata);

      try {
        const [containerInternal, containerToken] = await Promise.all([
          getEnvValue(sandbox.baseUrl, 'INTERNAL_SERVICE_KEY', headers),
          getEnvValue(sandbox.baseUrl, 'EPSILON_TOKEN', headers),
        ]);

        const driftInternal = containerInternal !== serviceKey;
        const driftToken = containerToken !== serviceKey;
        if (!driftInternal && !driftToken) continue;

        console.info('[sandbox-token-drift]', {
          sandboxId: sandbox.sandboxId,
          driftInternal,
          driftToken,
          mode: config.ENV_MODE,
        });

        if (config.ENV_MODE === 'cloud') {
          await rotateToken(sandbox.baseUrl, serviceKey, headers);
          console.info('[sandbox-token-drift] auto-healed via rotate-token', { sandboxId: sandbox.sandboxId });
        } else {
          console.warn('[sandbox-token-drift] local mode drift detected; manual operator action required', {
            sandboxId: sandbox.sandboxId,
          });
        }
      } catch (err) {
        console.warn('[sandbox-token-drift] failed to reconcile sandbox', {
          sandboxId: sandbox.sandboxId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } finally {
    running = false;
  }
}

export function startSandboxTokenDriftReconciler(): void {
  if (!config.SANDBOX_TOKEN_DRIFT_RECONCILER_ENABLED) return;
  if (timer) return;
  timer = setInterval(() => {
    runOnce().catch((err) => console.warn('[sandbox-token-drift] loop error', err));
  }, INTERVAL_MS);
  runOnce().catch((err) => console.warn('[sandbox-token-drift] initial run error', err));
  console.log('[sandbox-token-drift] reconciler started');
}

export function stopSandboxTokenDriftReconciler(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
