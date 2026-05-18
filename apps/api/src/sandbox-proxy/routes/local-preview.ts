/**
 * Sandbox Preview Proxy — transparent pipe to Epsilon Master inside the sandbox.
 *
 * TRUE TRANSPARENT PROXY:
 *   - decompress: false — raw bytes pass through untouched
 *   - Response body streamed 1:1 (never buffered)
 *   - SSE / long-lived streams work correctly (connection-timeout only, no body timeout)
 *   - Only touches: Host, Authorization (service key), CORS
 *
 * Called from index.ts for both path-based (/v1/p/:id/:port/*)
 * and subdomain-based (p{port}-{sandboxId}.localhost) routing.
 *
 * WebSocket upgrades are handled at the Bun server level (see index.ts).
 */

import { config } from '../../config';
import { execSync } from 'child_process';
import { buildCanonicalSandboxAuthCommand } from '../../platform/services/sandbox-auth';
import { invalidateProviderCache } from '..';
// Story 5.0.2: EPSILON_USER_CONTEXT_HEADER name + buildSignedUserContextHeader for
// re-sign on drift reconcile. buildSignedUserContextHeader uses dynamic import to
// avoid circular dependency with `..` (index.ts imports proxyToSandbox from here).
import { EPSILON_USER_CONTEXT_HEADER } from '../../shared/epsilon-user-context';

const EPSILON_MASTER_PORT = 8000;
const FETCH_TIMEOUT_MS = 30_000;

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `"'"'`)}'`;
}

function buildDockerEnvWriteCommand(payload: Record<string, string>, targetDir: string): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  return `mkdir -p ${targetDir} && ENV_WRITE_PAYLOAD_B64=${shellQuote(payloadB64)} python3 - <<PY
import base64, json, os
from pathlib import Path

target_dir = Path(${JSON.stringify(targetDir)})
target_dir.mkdir(parents=True, exist_ok=True)
payload = json.loads(base64.b64decode(os.environ["ENV_WRITE_PAYLOAD_B64"]).decode("utf-8"))
for key, value in payload.items():
    (target_dir / key).write_text(value)
PY`;
}

function isExpectedStartupPreview(path: string, status: number, bodySnippet: string): boolean {
  if (status !== 502 && status !== 503) return false;
  const normalizedPath = path.split('?')[0];
  const startupPaths = [
    '/question',
    '/global/health',
    '/global/event',
    '/session/status',
    '/epsilon/health',
    '/log',
  ];
  return startupPaths.some((candidate) => normalizedPath.startsWith(candidate)) && (
    bodySnippet.includes('Port 8000 — Not Reachable') ||
    bodySnippet.includes('no such host') ||
    bodySnippet.includes('connection refused') ||
    bodySnippet.includes('Bad Gateway')
  );
}

// ─── Service Key Sync ────────────────────────────────────────────────────────
// Ensures the running sandbox container has the canonical auth bundle from
// the DB. Triggered on 401 from the sandbox (auth drift after a rotation).
//
// Previously this used a one-shot boolean (`_serviceKeySynced`) — once we
// successfully synced ONE key, all future 401s were ignored. That broke
// `bun --hot` reloads: every API restart re-provisions the sandbox with a
// fresh epsilon_sb_ token, the browser keeps hitting the proxy with a JWT,
// the proxy resolves the NEW serviceKey, but we refuse to resync and just
// serve 401s until the page is manually hard-refreshed.
//
// Fix: track the last successfully-synced key. If the current key differs
// from the last-synced one (rotation happened), allow a fresh sync cycle.
const MAX_SYNC_ATTEMPTS_PER_KEY = 3;
let _lastSyncedKey: string | null = null;
let _syncAttemptsForCurrentKey = 0;

function trySyncServiceKey(serviceKey: string): boolean {
  if (!serviceKey) return false;
  // New key → reset the attempt counter so a rotation gets a fresh 3 tries.
  if (serviceKey !== _lastSyncedKey) {
    _syncAttemptsForCurrentKey = 0;
  } else if (_syncAttemptsForCurrentKey >= MAX_SYNC_ATTEMPTS_PER_KEY) {
    // Already synced this exact key successfully — nothing to do.
    return false;
  }
  _syncAttemptsForCurrentKey++;
  try {
    const env: Record<string, string> = { ...process.env as Record<string, string> };
    if (config.DOCKER_HOST && !config.DOCKER_HOST.includes('://')) {
      env.DOCKER_HOST = `unix://${config.DOCKER_HOST}`;
    }

    console.log(`[LOCAL-PREVIEW] Syncing sandbox auth bundle to container (attempt ${_syncAttemptsForCurrentKey}/${MAX_SYNC_ATTEMPTS_PER_KEY})...`);
    execSync(
      `docker exec ${shellQuote(config.SANDBOX_CONTAINER_NAME)} bash -c ${shellQuote(buildCanonicalSandboxAuthCommand(serviceKey, config.EPSILON_URL.replace(/\/v1\/router\/?$/, '') || `http://host.docker.internal:${config.PORT}`))}`,
      { timeout: 15_000, stdio: 'pipe', env },
    );
    _lastSyncedKey = serviceKey;
    console.log('[LOCAL-PREVIEW] Sandbox auth bundle synced');
    return true;
  } catch (err: any) {
    console.error(`[LOCAL-PREVIEW] Failed to sync sandbox auth bundle (attempt ${_syncAttemptsForCurrentKey}/${MAX_SYNC_ATTEMPTS_PER_KEY}):`, err.message || err);
    return false;
  }
}

/**
 * Read the epsilon-master process's currently-loaded EPSILON_TOKEN by
 * cat-ing `/workspace/.secrets/.bootstrap-env.json` from inside the
 * container. This is the source of truth for what the running process
 * actually accepts (bootstrap-env.ts overrides process.env at startup
 * with whatever's in this file).
 */
function readContainerBootstrapKey(): string | null {
  try {
    const env: Record<string, string> = { ...process.env as Record<string, string> };
    if (config.DOCKER_HOST && !config.DOCKER_HOST.includes('://')) {
      env.DOCKER_HOST = `unix://${config.DOCKER_HOST}`;
    }
    // Try both paths: new layout (.persistent-system/secrets/) and legacy (.secrets/)
    let out: string;
    try {
      out = execSync(
        `docker exec ${shellQuote(config.SANDBOX_CONTAINER_NAME)} cat /workspace/.persistent-system/secrets/.bootstrap-env.json`,
        { timeout: 5_000, stdio: ['pipe', 'pipe', 'pipe'], env },
      ).toString('utf8');
    } catch {
      out = execSync(
        `docker exec ${shellQuote(config.SANDBOX_CONTAINER_NAME)} cat /workspace/.secrets/.bootstrap-env.json`,
        { timeout: 5_000, stdio: ['pipe', 'pipe', 'pipe'], env },
      ).toString('utf8');
    }
    const json = JSON.parse(out);
    return typeof json.EPSILON_TOKEN === 'string' && json.EPSILON_TOKEN.length > 0 ? json.EPSILON_TOKEN : null;
  } catch {
    return null;
  }
}

/**
 * Push a corrected serviceKey back into the sandboxes table so the
 * provider cache can refresh and future requests use the right value
 * without another 401 → docker exec round-trip.
 *
 * 5.0.2 review P10: caller passes the actual sandbox externalId so this
 * works for multi-sandbox deployments. Falls back to
 * config.SANDBOX_CONTAINER_NAME for legacy single-sandbox callers.
 */
async function updateSandboxServiceKeyInDb(newKey: string, externalId?: string): Promise<void> {
  const targetExternalId = externalId ?? config.SANDBOX_CONTAINER_NAME;
  try {
    const { db } = await import('../../shared/db');
    const { sandboxes } = await import('@epsilon/db');
    const { eq, sql } = await import('drizzle-orm');
    const { buildSandboxServiceKeyConfigPatch } = await import('../../shared/sandbox-secrets');
    const patch = buildSandboxServiceKeyConfigPatch(newKey);
    const updated = await db
      .update(sandboxes)
      .set({
        config: sql`(COALESCE(${sandboxes.config}, '{}'::jsonb) - 'serviceKey') || ${JSON.stringify(patch)}::jsonb`,
        updatedAt: new Date(),
      } as any)
      .where(eq(sandboxes.externalId, targetExternalId))
      .returning({ sandboxId: sandboxes.sandboxId });
    if (updated.length === 0) {
      console.warn(`[LOCAL-PREVIEW] Could not refresh sandbox serviceKey in DB: no row for externalId=${targetExternalId}`);
      return;
    }
    invalidateProviderCache(targetExternalId);
    const { invalidatePreviewServiceKeyCache } = await import('./preview');
    invalidatePreviewServiceKeyCache(targetExternalId);
    console.log(`[LOCAL-PREVIEW] Refreshed sandbox serviceKey in DB + invalidated cache (externalId=${targetExternalId})`);
  } catch (err) {
    console.warn('[LOCAL-PREVIEW] Could not update sandbox serviceKey in DB:', (err as Error).message);
  }
}

// ─── Story 5.0.2: filesystem .env sync for local dev (Task 5 / AC4) ─────────
/**
 * After a successful drift reconcile or 401 retry, push the corrected key into
 * apps/api/.env INTERNAL_SERVICE_KEY so subsequent backend restarts use the
 * correct value. Gated by config.isLocal() — in cloud mode, secrets manager
 * owns the canonical key and we must not corrupt deployment config.
 *
 * Atomic write via tmp file + rename to prevent partial writes.
 */
async function syncInternalServiceKeyToEnvFile(newKey: string): Promise<void> {
  if (!config.isLocal()) return;
  try {
    const path = await import('path');
    const fs = await import('fs/promises');
    const fsSync = await import('fs');
    const crypto = await import('crypto');

    // Resolve apps/api/.env path: env var override → derived from cwd
    const envPath = process.env.EPSILON_API_ENV_FILE ?? path.resolve(process.cwd(), '.env');
    if (!fsSync.existsSync(envPath)) {
      console.warn(`[reconcile] .env not found at ${envPath} — skipping sync`);
      return;
    }

    // Quote the value so spaces / shell metachars in keys don't break dotenv parsing.
    const quotedLine = `INTERNAL_SERVICE_KEY="${newKey}"`;
    const existing = await fs.readFile(envPath, 'utf8');
    const KEY_LINE_RE = /^INTERNAL_SERVICE_KEY=.*$/m;
    let next: string;
    if (KEY_LINE_RE.test(existing)) {
      next = existing.replace(KEY_LINE_RE, quotedLine);
    } else {
      next = existing.replace(/\s*$/, '') + `\n${quotedLine}\n`;
    }
    if (next === existing) return; // no-op when key already matches

    // Crypto-random tmp suffix avoids collision when concurrent reconciles race
    // (PID alone is not unique under sustained drift); writeFile uses async I/O
    // so the event loop isn't blocked by disk write.
    const tmpPath = `${envPath}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
    await fs.writeFile(tmpPath, next, { mode: 0o600 });
    try {
      await fs.rename(tmpPath, envPath);
    } catch (renameErr) {
      // EXDEV (cross-device link) can fire if tmp + target are on different mounts
      // (Docker volume mount edge case). Fall back to copy + unlink so the sync
      // still happens — slightly less atomic but durable.
      if ((renameErr as NodeJS.ErrnoException).code === 'EXDEV') {
        await fs.copyFile(tmpPath, envPath);
        await fs.unlink(tmpPath).catch(() => {});
      } else {
        throw renameErr;
      }
    }

    // 5.0.2 review P2: also update the live process.env so config.INTERNAL_SERVICE_KEY
    // getter sees the new value immediately. Without this, the next request reads
    // stale process.env → drift detected again → reconcile loop fires every 30s
    // until the backend is restarted.
    process.env.INTERNAL_SERVICE_KEY = newKey;

    console.log(`[reconcile] .env INTERNAL_SERVICE_KEY synced to ${newKey.slice(0, 16)}…; process.env updated, no restart needed`);
  } catch (err) {
    console.warn('[reconcile] Failed to sync INTERNAL_SERVICE_KEY into .env:', (err as Error).message);
  }
}

// ─── Story 5.0.2: drift reconcile + circuit breaker (Task 3 / AC2) ──────────
/**
 * Per-sandbox circuit breaker. If reconcile failed within the cool-off window,
 * skip further reconcile attempts for that sandbox until window expires —
 * prevents retry storms under sustained drift (e.g. container unreachable).
 */
const DRIFT_COOLOFF_MS = 30_000;
const driftCircuit = new Map<string, { failedAt: number }>();

function isCircuitTripped(sandboxId: string): boolean {
  const entry = driftCircuit.get(sandboxId);
  if (!entry) return false;
  if (Date.now() - entry.failedAt > DRIFT_COOLOFF_MS) {
    driftCircuit.delete(sandboxId);
    return false;
  }
  return true;
}

function tripCircuit(sandboxId: string): void {
  driftCircuit.set(sandboxId, { failedAt: Date.now() });
}

function clearCircuit(sandboxId: string): void {
  driftCircuit.delete(sandboxId);
}

/**
 * Reconcile after detecting drift: read container truth, push to DB + cache +
 * .env. Returns the new key if reconcile produced an actual change worth retrying,
 * or null if no actual drift (false alarm — corruption/expired but DB matches
 * container).
 */
async function reconcileSandboxToken(sandboxId: string, currentDbKey: string): Promise<string | null> {
  const containerKey = readContainerBootstrapKey();
  if (!containerKey) {
    console.warn(`[reconcile] sandbox=${sandboxId} could not read container bootstrap; circuit tripped`);
    tripCircuit(sandboxId);
    return null;
  }
  if (containerKey === currentDbKey) {
    // No actual drift — drift header was a false alarm (e.g. token corrupted in transit).
    // No point retrying with the same key; clear circuit and let the original anonymous
    // response pass through.
    return null;
  }
  // 5.0.2 review P10: pass sandboxId so multi-sandbox deployments update the
  // right row instead of always config.SANDBOX_CONTAINER_NAME.
  await updateSandboxServiceKeyInDb(containerKey, sandboxId);
  await syncInternalServiceKeyToEnvFile(containerKey);
  return containerKey;
}

const STRIP_REQUEST_HEADERS = new Set([
  'host',
  'authorization',
  'connection',
  'keep-alive',
  'te',
  'upgrade',
  'x-epsilon-user-context',
]);

// Hop-by-hop response headers must not be forwarded by proxies.
// Passing these through while re-streaming can produce malformed chunked
// responses (for example ERR_INCOMPLETE_CHUNKED_ENCODING in browsers).
//
// 5.0.2 review P5: also strip x-epsilon-token-drift so the internal drift
// signal (with embedded sandboxId) never reaches browser clients.
const STRIP_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'x-epsilon-token-drift',
]);

/**
 * Resolve the sandbox's Epsilon Master URL.
 * Inside Docker: http://{sandboxId}:8000 (Docker DNS)
 * On host (pnpm dev): http://localhost:{SANDBOX_PORT_BASE}
 */
export function getSandboxBaseUrl(sandboxId: string): string {
  if (config.SANDBOX_NETWORK) {
    return `http://${sandboxId}:8000`;
  }
  return `http://localhost:${config.SANDBOX_PORT_BASE}`;
}

/**
 * Core proxy function — used by both Hono route handler and subdomain handler.
 * Exported so index.ts can call it directly for subdomain routing.
 */
export async function proxyToSandbox(
  sandboxId: string,
  port: number,
  method: string,
  path: string,
  queryString: string,
  incomingHeaders: Headers,
  incomingBody: ArrayBuffer | undefined,
  _acceptsSSE: boolean,
  origin: string,
  baseUrlOverride?: string,
  serviceKeyOverride?: string,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const sandboxBaseUrl = baseUrlOverride || getSandboxBaseUrl(sandboxId);
  const targetUrl = port === EPSILON_MASTER_PORT
    ? `${sandboxBaseUrl}${path}${queryString}`
    : `${sandboxBaseUrl}/proxy/${port}${path}${queryString}`;

  // Forward headers transparently
  const headers = new Headers();
  for (const [key, value] of incomingHeaders.entries()) {
    if (STRIP_REQUEST_HEADERS.has(key.toLowerCase())) continue;
    headers.set(key, value);
  }
  headers.set('Host', new URL(sandboxBaseUrl).host);
  const serviceKey = serviceKeyOverride || config.INTERNAL_SERVICE_KEY;
  if (serviceKey) {
    headers.set('Authorization', `Bearer ${serviceKey}`);
  }
  // Tell the sandbox what the public proxy base URL is so it can set the
  // OpenAPI server URL correctly AND so static-web's <base href> resolves
  // sub-resources back through the same public origin.
  //
  // Default = path-based routing: `${proto}://${host}/v1/p/${sandboxId}/${port}`.
  // Callers in subdomain mode (apps/api/src/index.ts subdomain handler)
  // override this via `extraHeaders` because subdomain URLs have no path
  // prefix — the subdomain itself encodes the routing.
  const originalHost = incomingHeaders.get('host');
  if (originalHost) {
    const proto = incomingHeaders.get('x-forwarded-proto') || 'http';
    headers.set('X-Forwarded-Prefix', `${proto}://${originalHost}/v1/p/${sandboxId}/${port}`);
    headers.set('X-Forwarded-Proto', proto);
    headers.set('X-Forwarded-Host', originalHost);
  }

  // extraHeaders applied last so callers can override defaults like
  // X-Forwarded-Prefix.
  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) {
      headers.set(key, value);
    }
  }

  // Abort handling — connection timeout only.
  // The timer fires if the upstream doesn't return headers within FETCH_TIMEOUT_MS.
  // Once headers arrive (fetch resolves), the timer is cleared so SSE / long-lived
  // streams are never killed by the proxy timeout — regardless of whether the client
  // sent Accept: text/event-stream (the OpenCode SDK doesn't).
  const controller = new AbortController();
  const connectTimer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const response = await fetch(targetUrl, {
    method,
    headers,
    body: incomingBody,
    signal: controller.signal,
    // @ts-ignore — Bun extension: no decompression, raw byte passthrough
    decompress: false,
    redirect: 'manual',
  });

  // Headers received — clear the connection timeout.
  // The response body (potentially an SSE stream) continues flowing untouched.
  clearTimeout(connectTimer);

  function sanitizeResponseHeaders(input: Headers): Headers {
    const out = new Headers(input);
    for (const key of STRIP_RESPONSE_HEADERS) out.delete(key);
    return out;
  }

  // ─── Story 5.0.2 AC2: drift detection + sync retry ───────────────────────
  // epsilon-master sets X-Epsilon-Token-Drift when HMAC verification fails.
  // We reconcile (read container truth, update DB) + re-sign the user-context
  // header + retry the upstream fetch ONCE. Circuit breaker prevents retry
  // storms under sustained drift.
  const driftHeader = response.headers.get('X-Epsilon-Token-Drift');
  if (driftHeader && !baseUrlOverride && !isCircuitTripped(sandboxId) && serviceKey) {
    console.log(`[reconcile] sandbox=${sandboxId} drift detected (${driftHeader}); attempting reconcile + sync retry`);
    const oldPrefix = serviceKey.slice(0, 16);
    const newKey = await reconcileSandboxToken(sandboxId, serviceKey).catch((err) => {
      console.warn(`[reconcile] sandbox=${sandboxId} reconcile threw:`, (err as Error).message);
      return null;
    });

    if (newKey) {
      // Reconcile produced a new key — re-sign + retry ONCE.
      // The original X-Epsilon-User-Context header is signed with the OLD key
      // (HMAC fails), but its base64-encoded PAYLOAD is still readable. Extract
      // userId from there so the re-sign preserves identity. For local-dev, the
      // payload will contain `userId: 'local-dev-admin'`.
      let userIdForSign: string | undefined;
      try {
        const originalCtx = headers.get(EPSILON_USER_CONTEXT_HEADER) ?? extraHeaders?.[EPSILON_USER_CONTEXT_HEADER];
        if (originalCtx) {
          const [payloadB64] = originalCtx.split('.');
          if (payloadB64) {
            const padded = payloadB64 + '='.repeat((4 - payloadB64.length % 4) % 4);
            const json = Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
            const decoded = JSON.parse(json);
            if (typeof decoded?.userId === 'string') userIdForSign = decoded.userId;
          }
        }
      } catch {
        // payload unreadable; leave userIdForSign undefined → degrades to anonymous on retry
      }
      const signMod = await import('..');
      const reSigned = await signMod.buildSignedUserContextHeader(sandboxId, userIdForSign, newKey);

      const retryHeaders = new Headers(headers);
      retryHeaders.set('Authorization', `Bearer ${newKey}`);
      const userCtx = reSigned[EPSILON_USER_CONTEXT_HEADER];
      if (userCtx) retryHeaders.set(EPSILON_USER_CONTEXT_HEADER, userCtx);
      else retryHeaders.delete(EPSILON_USER_CONTEXT_HEADER);

      const retryController = new AbortController();
      const retryTimer = setTimeout(() => retryController.abort(), FETCH_TIMEOUT_MS);
      let retryResponse: Response;
      try {
        retryResponse = await fetch(targetUrl, {
          method,
          headers: retryHeaders,
          body: incomingBody,
          signal: retryController.signal,
          // @ts-ignore
          decompress: false,
          redirect: 'manual',
        });
      } catch (err) {
        console.warn(`[reconcile] sandbox=${sandboxId} retry fetch failed:`, (err as Error).message);
        tripCircuit(sandboxId);
        clearTimeout(retryTimer);
        // Fall through to return original response (anonymous but at least responded)
        const outHeaders = sanitizeResponseHeaders(response.headers);
        if (origin) {
          outHeaders.set('Access-Control-Allow-Origin', origin);
          outHeaders.set('Access-Control-Allow-Credentials', 'true');
        }
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers: outHeaders });
      }
      clearTimeout(retryTimer);

      const retryDriftHeader = retryResponse.headers.get('X-Epsilon-Token-Drift');
      if (retryDriftHeader) {
        // Retry STILL had drift — trip circuit, return retry response as-is.
        console.warn(`[reconcile] sandbox=${sandboxId} retry still has drift; tripping circuit for ${DRIFT_COOLOFF_MS}ms`);
        tripCircuit(sandboxId);
      } else {
        console.log(`[reconcile] sandbox=${sandboxId} drift resolved (DB ${oldPrefix}… → container ${newKey.slice(0, 16)}…); retry status=${retryResponse.status}`);
        clearCircuit(sandboxId);
      }

      const outHeaders = sanitizeResponseHeaders(retryResponse.headers);
      if (origin) {
        outHeaders.set('Access-Control-Allow-Origin', origin);
        outHeaders.set('Access-Control-Allow-Credentials', 'true');
      }
      return new Response(retryResponse.body, { status: retryResponse.status, statusText: retryResponse.statusText, headers: outHeaders });
    }
    // newKey === null: either container unreachable (circuit already tripped) or
    // false alarm (container == DB). Fall through to return original response.
  } else if (!driftHeader) {
    // Successful verification → clear circuit if it was set.
    clearCircuit(sandboxId);
  }

  // On 401 from sandbox: service-key mismatch. Two failure modes:
  //   (a) Container env files have key X but our cached serviceKey is Y.
  //       Pushing Y into the s6 env via trySyncServiceKey only helps the
  //       NEXT process spawn, not the currently-running epsilon-master that
  //       loaded X at start. So syncing+retrying with the same Y still 401s.
  //   (b) The DB / our cache is fine but bootstrap-env.ts inside the
  //       container loaded an older EPSILON_TOKEN from a stale persistent
  //       /workspace/.secrets/.bootstrap-env.json.
  //
  // The container's bootstrap file is the source of truth for what the
  // running epsilon-master process actually accepts. On 401, read that
  // file via `docker exec` and retry with whatever it says. If the retry
  // succeeds we also publish the corrected key into our DB row so
  // subsequent cache reads pick it up cleanly.
  if (response.status === 401 && !baseUrlOverride) {
    const containerKey = readContainerBootstrapKey();
    if (containerKey && containerKey !== serviceKey) {
      console.log('[LOCAL-PREVIEW] 401 — retrying with container bootstrap key');
      const retryHeaders = new Headers(headers);
      retryHeaders.set('Authorization', `Bearer ${containerKey}`);
      const retryController = new AbortController();
      const retryTimer = setTimeout(() => retryController.abort(), FETCH_TIMEOUT_MS);
      const retryResponse = await fetch(targetUrl, {
        method,
        headers: retryHeaders,
        body: incomingBody,
        signal: retryController.signal,
        // @ts-ignore
        decompress: false,
        redirect: 'manual',
      });
      clearTimeout(retryTimer);
      if (retryResponse.status !== 401) {
        // Retry succeeded — push the working key back into the DB +
        // invalidate the provider cache so subsequent requests use it.
        void updateSandboxServiceKeyInDb(containerKey).catch(() => {});
        // Story 5.0.2 AC4: also push to apps/api/.env so backend restarts pick it up
        // (gated by config.isLocal() internally).
        void syncInternalServiceKeyToEnvFile(containerKey).catch(() => {});
      }
      const out = sanitizeResponseHeaders(retryResponse.headers);
      if (origin) {
        out.set('Access-Control-Allow-Origin', origin);
        out.set('Access-Control-Allow-Credentials', 'true');
      }
      return new Response(retryResponse.body, {
        status: retryResponse.status,
        statusText: retryResponse.statusText,
        headers: out,
      });
    }
    // Fall back to the original docker-exec sync path if we couldn't read
    // the container's bootstrap file (e.g. file missing on cloud sandboxes).
    const synced = trySyncServiceKey(serviceKey);
    if (synced) {
      const retryController = new AbortController();
      const retryTimer = setTimeout(() => retryController.abort(), FETCH_TIMEOUT_MS);
      const retryResponse = await fetch(targetUrl, {
        method,
        headers,
        body: incomingBody,
        signal: retryController.signal,
        // @ts-ignore
        decompress: false,
        redirect: 'manual',
      });
      clearTimeout(retryTimer);
      const retryHeaders = sanitizeResponseHeaders(retryResponse.headers);
      if (origin) {
        retryHeaders.set('Access-Control-Allow-Origin', origin);
        retryHeaders.set('Access-Control-Allow-Credentials', 'true');
      }
      return new Response(retryResponse.body, {
        status: retryResponse.status,
        statusText: retryResponse.statusText,
        headers: retryHeaders,
      });
    }
  }

  // Log upstream 5xx errors so they're visible (not silently proxied through).
  // Skip for SSE responses — their body streams indefinitely and can't be cloned/consumed.
  const isSSEResponse = (response.headers.get('content-type') || '').includes('text/event-stream');
  if (response.status >= 500 && !isSSEResponse) {
    // Clone the response to peek at the body without consuming it
    try {
      const cloned = response.clone();
      const text = await cloned.text();
      const snippet = text.slice(0, 300);
      // Try JSON first
      try {
        const parsed = JSON.parse(snippet);
        const errMsg = parsed?.data?.message || parsed?.message || parsed?.error || snippet.slice(0, 150);
        const log = isExpectedStartupPreview(path, response.status, errMsg) ? console.warn : console.error;
        log(`[PREVIEW] Sandbox ${response.status} on ${method} ${path} (port ${port}): ${errMsg}`);
      } catch {
        if (snippet.includes('__bunfallback') || snippet.includes('BunError')) {
          console.error(`[PREVIEW] Sandbox ${response.status} on ${method} ${path} (port ${port}): Bun crash/module error (check sandbox logs)`);
        } else {
          const log = isExpectedStartupPreview(path, response.status, snippet) ? console.warn : console.error;
          log(`[PREVIEW] Sandbox ${response.status} on ${method} ${path} (port ${port}): ${snippet || '(empty)'}`);
        }
      }
    } catch {
      const log = isExpectedStartupPreview(path, response.status, '') ? console.warn : console.error;
      log(`[PREVIEW] Sandbox ${response.status} on ${method} ${path} (port ${port})`);
    }
  }

  // Stream response 1:1, only add CORS + fix redirects
  const respHeaders = sanitizeResponseHeaders(response.headers);
  if (origin) {
    respHeaders.set('Access-Control-Allow-Origin', origin);
    respHeaders.set('Access-Control-Allow-Credentials', 'true');
  }

  // Fix Location header for redirects.
  // Epsilon Master's proxy rewrites e.g. http://localhost:5173/path → /proxy/5173/path.
  // For subdomain routing (p5173-sandbox.localhost:8008), the client already "is" at
  // the right port — strip the /proxy/{port} prefix so the redirect is just /path.
  // For path-based routing (OpenCode API at port 8000), there's no /proxy/ prefix, so
  // this is a no-op.
  const location = respHeaders.get('location');
  if (location && port !== EPSILON_MASTER_PORT) {
    const proxyPrefix = `/proxy/${port}`;
    if (location.startsWith(proxyPrefix)) {
      respHeaders.set('location', location.slice(proxyPrefix.length) || '/');
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: respHeaders,
  });
}
