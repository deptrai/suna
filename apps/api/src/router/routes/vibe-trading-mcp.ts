import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { checkCredits, deductToolCredits, resolveAccountTier } from '../services/billing';
import { config } from '../../config';
import type { AppContext } from '../../types';

const MCP_BASE = () => (config.VIBE_TRADING_MCP_URL ?? 'http://vibe-trading-mcp:8900').replace(/\/+$/, '');

const BILLABLE_METHODS = new Set(['tools/call']);

// ─── Story 5.5.1 — async swarm pattern ────────────────────────────────────────

// SCOPED TO THIS STORY — only run_swarm has the always-exceeds-30s property.
// Other long-running tools (backtest, factor_analysis, run_shadow_backtest,
// render_shadow_report) work today with typical inputs <30s; deferred to a
// follow-up story per deferred-work.md.
const LONG_RUNNING_TOOLS_DENY = new Set(['run_swarm']);

// Tools that operate on a specific run_id; gated by ownership check before forward.
const OWNERSHIP_GATED_TOOLS = new Set(['get_swarm_status', 'get_run_result', 'cancel_swarm']);

// Tools that accept (or should accept) the `account_id` argument forwarded by
// the proxy so the MCP server can enforce ownership server-side too
// (Story 5.5.1 review decision A — defense-in-depth).
const OWNERSHIP_AWARE_TOOLS = new Set([
  'start_swarm',
  'get_swarm_status',
  'get_run_result',
  'cancel_swarm',
  'list_runs',
]);

const RUN_OWNERSHIP_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// Cap upstream response body size before we read into memory + parse. Large
// swarm results with full events.jsonl can balloon; absent a cap, a single
// `get_run_result` could OOM the proxy. 10 MiB is generous — typical results
// are <500 KiB.
const MAX_INTROSPECT_BODY_BYTES = 10 * 1024 * 1024;

interface RunOwnershipEntry {
  accountId: string;
  expiresAt: number;
  // Guards finalize billing against double-charge on retry (AC5).
  // Single-process lifetime only; on restart the map is cleared and a re-fetch
  // may re-charge once. Acceptable per AC5 design (≤1 charge per run per process).
  finalized: boolean;
}

// Process-local ownership store. On apps/api restart the map clears →
// stale run_ids fail-closed (403) until re-hydrated via list_runs.
const runOwnership = new Map<string, RunOwnershipEntry>();

// Periodic sweeper. Without this, runs never polled by their owner sit in
// memory for the full 24h TTL (Story 5.5.1 review finding M1).
const OWNERSHIP_SWEEP_INTERVAL_MS = 60 * 60 * 1000; // 1h
let _ownershipSweepTimer: ReturnType<typeof setInterval> | null = null;
function ensureOwnershipSweeper(): void {
  if (_ownershipSweepTimer != null) return;
  _ownershipSweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [runId, entry] of runOwnership) {
      if (entry.expiresAt < now) runOwnership.delete(runId);
    }
    purgeExpiredPending();
  }, OWNERSHIP_SWEEP_INTERVAL_MS);
  // Don't block process exit in long-lived deploys.
  if (typeof (_ownershipSweepTimer as { unref?: () => void }).unref === 'function') {
    (_ownershipSweepTimer as { unref: () => void }).unref();
  }
}
ensureOwnershipSweeper();

// Per-session pending start_swarm calls awaiting their SSE response. The
// proxy can't capture run_id from the POST response (FastMCP SSE returns
// 202 Accepted; the result arrives later via the SSE stream), so we record
// `(sessionId, jsonRpcId) → accountId` at POST time and consume it inside
// the SSE rewriter when the matching response flows through.
//
// TTL = 60s — start_swarm typically responds within 100ms; 60s is a generous
// upper bound that covers any pathological delay.
interface PendingStart { accountId: string; expiresAt: number }
const pendingStartSwarm = new Map<string, PendingStart>();
const PENDING_START_TTL_MS = 60_000;

function pendingKey(sessionId: string, jsonRpcId: number | string): string {
  return `${sessionId}::${jsonRpcId}`;
}

function purgeExpiredPending(): void {
  const now = Date.now();
  for (const [k, v] of pendingStartSwarm) {
    if (v.expiresAt < now) pendingStartSwarm.delete(k);
  }
}

/** Test-only helper — never call from production code. */
export function __resetOwnershipForTests(): void {
  runOwnership.clear();
  pendingStartSwarm.clear();
}

function getOwnership(runId: string): RunOwnershipEntry | undefined {
  const entry = runOwnership.get(runId);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    runOwnership.delete(runId);
    return undefined;
  }
  return entry;
}

function setOwnership(runId: string, accountId: string): void {
  runOwnership.set(runId, {
    accountId,
    expiresAt: Date.now() + RUN_OWNERSHIP_TTL_MS,
    finalized: false,
  });
}

// FastMCP wraps `@mcp.tool` string returns as
// `{result: {content: [{type: "text", text: "<json>"}]}}`.
function parseToolResult(rawBody: string): unknown {
  try {
    const outer = JSON.parse(rawBody);
    const text = outer?.result?.content?.[0]?.text;
    if (typeof text !== 'string') return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────────

export const vibeTradingMcp = new Hono<{ Variables: AppContext }>();

vibeTradingMcp.all('/*', async (c) => {
  const accountId = c.get('accountId');
  if (!accountId) throw new HTTPException(401, { message: 'accountId required (epsilon_* token only)' });

  const url = new URL(c.req.url);
  const targetPath = url.pathname.replace(/^\/v1\/router\/vibe-trading-mcp/, '');
  const targetUrl = `${MCP_BASE()}${targetPath || '/'}${url.search}`;

  // Non-POST = SSE stream or health
  if (c.req.method !== 'POST') {
    const resp = await fetch(targetUrl, {
      method: c.req.method,
      headers: { 'Accept': c.req.header('accept') ?? '*/*' },
    });

    // Rewrite SSE endpoint events: MCP server emits `data: /messages/?session_id=...`
    // which the client resolves relative to the SSE URL. When proxied, the client
    // would resolve against the proxy base (missing /v1/router/vibe-trading-mcp prefix).
    // We rewrite the path in the SSE stream so the client posts back through the proxy.
    //
    // Story 5.5.1 — additionally intercept JSON-RPC response events whose `id`
    // matches a pending `start_swarm` POST, extract the `run_id`, and seed the
    // ownership map. Without this, ownership is never recorded (FastMCP SSE
    // returns 202 Accepted at the POST hop; the actual tool result only ever
    // appears on the SSE stream).
    const ct = resp.headers.get('content-type') ?? '';
    if (ct.includes('text/event-stream') && resp.body) {
      const PROXY_PREFIX = '/v1/router/vibe-trading-mcp';
      let upstreamSessionId: string | null = null;
      // Buffer partial lines across `transform` invocations — a JSON-RPC event
      // larger than one Fetch chunk would otherwise split mid-payload and the
      // ownership seed would silently drop (Story 5.5.1 review finding M2).
      let lineBuffer = '';
      const rewriteHeaders = new Headers(resp.headers);
      const rewritten = resp.body
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(new TransformStream({
          transform(chunk, controller) {
            // Rewrite `data: /messages/...` → `data: /v1/router/vibe-trading-mcp/messages/...`
            const rewrittenChunk = chunk.replace(/^(data:\s*)(\/messages\/)/gm, `$1${PROXY_PREFIX}$2`);

            // Story 5.5.1 — opportunistic SSE introspection.
            // Capture session_id (first event). Widened regex accepts any
            // URL-safe session token (hex, UUIDs with hyphens, base32…).
            const sessMatch = chunk.match(/session_id=([\w-]+)/i);
            if (sessMatch && !upstreamSessionId) {
              upstreamSessionId = sessMatch[1];
            }

            // Buffer + slice on newlines so partial lines survive chunk
            // boundaries. The trailing partial (no newline) is kept in
            // ``lineBuffer`` for the next transform call.
            lineBuffer += chunk;
            const lines = lineBuffer.split('\n');
            lineBuffer = lines.pop() ?? '';

            for (const line of lines) {
              if (!line.startsWith('data:')) continue;
              const payload = line.slice(5).trim();
              if (!payload.startsWith('{')) continue;
              try {
                const obj = JSON.parse(payload) as {
                  id?: number | string;
                  result?: { content?: Array<{ text?: string }> };
                };
                if (obj.id === undefined || !obj.result?.content) continue;
                const sessionForLookup = upstreamSessionId;
                if (!sessionForLookup) continue;
                const key = pendingKey(sessionForLookup, obj.id);
                const pending = pendingStartSwarm.get(key);
                if (!pending) continue;
                // Match — this is the start_swarm response we've been waiting for.
                pendingStartSwarm.delete(key);
                const text = obj.result.content[0]?.text;
                if (typeof text !== 'string') continue;
                try {
                  const toolResult = JSON.parse(text) as { run_id?: unknown; status?: unknown };
                  if (toolResult.status === 'started' &&
                      typeof toolResult.run_id === 'string' &&
                      toolResult.run_id.length > 0 &&
                      // Don't overwrite an existing ownership entry — the body
                      // introspection path (which fires first when start_swarm
                      // returns 200) may have already seeded the same run_id.
                      // Overwriting would reset ``finalized`` to false and
                      // permit a re-charge (Story 5.5.1 review finding D2).
                      !runOwnership.has(toolResult.run_id)) {
                    setOwnership(toolResult.run_id, pending.accountId);
                  }
                } catch { /* malformed tool result text */ }
              } catch { /* non-JSON-RPC event */ }
            }

            controller.enqueue(rewrittenChunk);
          },
        }))
        .pipeThrough(new TextEncoderStream());
      return new Response(rewritten, { status: resp.status, headers: rewriteHeaders });
    }

    return new Response(resp.body, { status: resp.status, headers: resp.headers });
  }

  // POST — may be JSON-RPC tools/call
  const rawBody = await c.req.text();
  let jsonRpc: {
    method?: string;
    params?: { name?: string; arguments?: Record<string, unknown> & { run_id?: unknown } };
  } | null = null;
  try { jsonRpc = JSON.parse(rawBody); } catch { /* not JSON-RPC, passthrough */ }

  // Story 5.5.1 review decision A — forward accountId as `account_id` arg to
  // every ownership-aware MCP tool so the MCP server enforces ownership
  // server-side (defense-in-depth). Rebuild body if we injected.
  let forwardBody = rawBody;
  if (
    jsonRpc?.method === 'tools/call' &&
    jsonRpc.params?.name &&
    typeof jsonRpc.params.name === 'string' &&
    OWNERSHIP_AWARE_TOOLS.has(jsonRpc.params.name)
  ) {
    const args = (jsonRpc.params.arguments ?? {}) as Record<string, unknown>;
    if (args.account_id !== accountId) {
      jsonRpc.params.arguments = { ...args, account_id: accountId };
      forwardBody = JSON.stringify(jsonRpc);
    }
  }

  const isBillable = jsonRpc?.method != null && BILLABLE_METHODS.has(jsonRpc.method);

  if (isBillable) {
    const toolName = jsonRpc?.params?.name;
    if (!toolName || typeof toolName !== 'string') {
      // Closes fail-open: malformed tools/call must not get free passthrough
      return c.json({ error: 'Missing or invalid params.name on tools/call' }, 400);
    }

    // Tier gate — MCP tools bypass OpenCode permission system (Risk R5)
    const tier = await resolveAccountTier(accountId);
    if (tier !== 'pro' && tier !== 'enterprise') {
      return c.json({ error: 'Pro tier required for Vibe-Trading MCP tools' }, 403);
    }

    // Story 5.5.1 AC2 — deprecated synchronous tool, fail with 410 Gone.
    if (LONG_RUNNING_TOOLS_DENY.has(toolName)) {
      return c.json({
        error: 'run_swarm is deprecated via proxy — use start_swarm + get_swarm_status pattern',
        migration: 'See _bmad-output/implementation-artifacts/5-5-1-vibe-trading-swarm-async-execution.md',
      }, 410);
    }

    // Story 5.5.1 AC1b — ownership gate on per-run tools.
    let gatedRunId: string | undefined;
    if (OWNERSHIP_GATED_TOOLS.has(toolName)) {
      const raw = jsonRpc?.params?.arguments?.run_id;
      if (typeof raw !== 'string' || raw.length === 0) {
        return c.json({ error: 'Missing or invalid run_id argument' }, 400);
      }
      gatedRunId = raw;
      const entry = getOwnership(gatedRunId);
      if (!entry || entry.accountId !== accountId) {
        console.warn(
          `[swarm-ownership-violation] tool=${toolName} run_id=${gatedRunId.slice(0, 8)}... account=${accountId}`
        );
        return c.json({ error: 'Run not owned by this account' }, 403);
      }
    }

    const credit = await checkCredits(accountId);
    if (!credit.hasCredits) return c.json({ error: 'Insufficient credits' }, 402);

    const ua = (c.req.header('user-agent') ?? '').replace(/[\r\n\t]/g, ' ').slice(0, 80);
    console.log(`[TIER-BYPASS-SUSPECT] mcp_tool=${toolName} account=${accountId} ua="${ua}"`);

    // Story 5.5.1 — for SSE-based MCP, the POST returns 202 Accepted and the
    // real tool result arrives via the SSE stream. Pre-register the
    // (sessionId, jsonRpcId) → accountId mapping so the SSE rewriter can seed
    // ownership when the response flows through.
    if (toolName === 'start_swarm') {
      purgeExpiredPending();
      const sessionIdParam = new URL(c.req.url).searchParams.get('session_id');
      const jrpcId = (jsonRpc as { id?: number | string } | null)?.id;
      if (sessionIdParam && (typeof jrpcId === 'number' || typeof jrpcId === 'string')) {
        pendingStartSwarm.set(pendingKey(sessionIdParam, jrpcId), {
          accountId,
          expiresAt: Date.now() + PENDING_START_TTL_MS,
        });
      } else {
        // No session_id ⇒ ownership won't seed via SSE path either.
        // Surface so the failure is observable in production logs rather
        // than silently 403-ing on the next poll.
        console.warn(
          `[swarm-ownership-seed-warn] start_swarm without session_id in POST url; ` +
          `ownership will fall back to body-introspection path or list_runs re-hydrate. account=${accountId}`
        );
      }
    }

    let resp: Response;
    try {
      resp = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: forwardBody,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'VT MCP unavailable';
      return c.json({ error: msg }, 503);
    }

    // For tools whose response we must introspect (run_id capture, finalize
    // billing trigger, ownership re-hydration, cancel-state seal), read the
    // body once and rebuild the Response. Other tools keep the streaming
    // passthrough.
    const needsBodyIntrospection =
      toolName === 'start_swarm' ||
      toolName === 'list_runs' ||
      toolName === 'get_run_result' ||
      toolName === 'cancel_swarm';

    if (needsBodyIntrospection) {
      // Cap body size BEFORE reading to avoid OOM on pathologically large
      // results (Story 5.5.1 review finding M3).
      const contentLengthHeader = resp.headers.get('content-length');
      if (contentLengthHeader) {
        const cl = parseInt(contentLengthHeader, 10);
        if (Number.isFinite(cl) && cl > MAX_INTROSPECT_BODY_BYTES) {
          console.warn(
            `[vt-mcp-proxy] response too large (${cl} bytes > ${MAX_INTROSPECT_BODY_BYTES}); ` +
            `skipping body introspection for tool=${toolName}`
          );
          // Fall through to streaming passthrough — billing still happens below
          // via the non-introspect branch.
          if (resp.ok) {
            try {
              await deductToolCredits(accountId, `vt_mcp_${toolName}`, 0, `MCP: ${toolName}`);
            } catch (e) {
              console.warn(`[EPSILON][billing-failure] mcp_tool=${toolName} account=${accountId} err=${e instanceof Error ? e.message : String(e)}`);
            }
          }
          return new Response(resp.body, { status: resp.status, headers: resp.headers });
        }
      }

      const respText = await resp.text();
      const parsed = resp.ok ? parseToolResult(respText) : null;

      if (resp.ok) {
        // Story 5.5.1 — capture run_id from start_swarm to seed ownership.
        // Only bill the deposit when ownership was successfully claimed —
        // otherwise the user is charged for a run they cannot access.
        let startSwarmBilled = false;
        if (toolName === 'start_swarm' && parsed && typeof parsed === 'object') {
          const r = parsed as { run_id?: unknown; status?: unknown };
          if (r.status === 'started' && typeof r.run_id === 'string' && r.run_id.length > 0) {
            setOwnership(r.run_id, accountId);
            try {
              await deductToolCredits(accountId, 'vt_mcp_start_swarm', 0, `MCP: start_swarm ${r.run_id}`);
              startSwarmBilled = true;
            } catch (e) {
              console.warn(`[EPSILON][billing-failure] mcp_tool=start_swarm account=${accountId} err=${e instanceof Error ? e.message : String(e)}`);
            }
          } else {
            console.warn(
              `[vt-mcp-proxy] start_swarm 200 but no usable run_id in body — skipping deposit billing. account=${accountId}`
            );
          }
        }

        // Story 5.5.1 AC1b — re-hydrate ownership for runs this account
        // surfaces via list_runs (proxy-restart recovery path).
        // Do NOT overwrite existing ownership — cross-account theft prevention.
        if (toolName === 'list_runs' && Array.isArray(parsed)) {
          for (const item of parsed as Array<{ run_id?: unknown }>) {
            if (
              typeof item?.run_id === 'string' &&
              item.run_id.length > 0 &&
              !runOwnership.has(item.run_id)
            ) {
              setOwnership(item.run_id, accountId);
            }
          }
        }

        // Bill non-start_swarm tools (start_swarm billing is conditional above).
        if (toolName !== 'start_swarm') {
          try {
            await deductToolCredits(accountId, `vt_mcp_${toolName}`, 0, `MCP: ${toolName}`);
          } catch (e) {
            console.warn(`[EPSILON][billing-failure] mcp_tool=${toolName} account=${accountId} err=${e instanceof Error ? e.message : String(e)}`);
          }
        }

        // Story 5.5.1 AC5 — seal finalized flag on terminal statuses so a
        // subsequent get_run_result cannot double-bill.
        if (
          (toolName === 'get_run_result' || toolName === 'cancel_swarm') &&
          parsed && typeof parsed === 'object' && gatedRunId
        ) {
          const r = parsed as { status?: unknown; run_status?: unknown };
          // cancel_swarm returns {status: "cancelling"} or {status: "noop", run_status: <terminal>}
          // get_run_result mirrors SwarmRun.status (running / completed / failed / cancelled)
          const terminal = (r.status === 'completed' || r.status === 'failed' || r.status === 'cancelled')
            ? (r.status as 'completed' | 'failed' | 'cancelled')
            : (r.run_status === 'completed' || r.run_status === 'failed' || r.run_status === 'cancelled')
              ? (r.run_status as 'completed' | 'failed' | 'cancelled')
              : null;
          if (terminal) {
            const entry = runOwnership.get(gatedRunId);
            // Claim BEFORE await so any subsequent re-entry sees finalized=true.
            if (entry && !entry.finalized) {
              entry.finalized = true;
              // Only charge finalize for genuinely completed runs. Failed +
              // cancelled seal the flag without charging (user gets the
              // deposit; finalize is the "successful compute" leg).
              if (terminal === 'completed') {
                try {
                  await deductToolCredits(
                    accountId,
                    'vt_mcp_run_swarm_finalize',
                    0,
                    `Swarm completed: ${gatedRunId}`,
                  );
                } catch (e) {
                  console.warn(`[EPSILON][billing-failure] tool=vt_mcp_run_swarm_finalize run=${gatedRunId} err=${e instanceof Error ? e.message : String(e)}`);
                }
              }
            }
          }
        }
        void startSwarmBilled; // satisfy linter — observable via logs only
      }

      // Rebuild the Response since we consumed the body. Sanitize ANY non-ok
      // error response (not just JSON) so internal URLs / hostnames / stack
      // traces never leak (Story 5.5.1 review finding M4).
      if (!resp.ok) {
        const sanitized = respText
          .replace(/https?:\/\/[^\s"']*/g, '[url]')
          .replace(/\bvibe-trading-mcp[^\s"']*/g, '[internal]')
          .slice(0, 500);
        return c.json({ error: sanitized }, resp.status as ContentfulStatusCode);
      }
      return new Response(respText, { status: resp.status, headers: resp.headers });
    }

    // Standard path — non-introspected tool, stream body through.
    if (resp.ok) {
      try {
        await deductToolCredits(accountId, `vt_mcp_${toolName}`, 0, `MCP: ${toolName}`);
      } catch (e) {
        console.warn(`[EPSILON][billing-failure] mcp_tool=${toolName} account=${accountId} err=${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // sanitizeUpstreamErr — apply unconditionally on errors (not just JSON).
    // SSE chunks never error-out with a 4xx/5xx body, so this is safe.
    if (!resp.ok) {
      const errText = await resp.text();
      const sanitized = errText
        .replace(/https?:\/\/[^\s"']*/g, '[url]')
        .replace(/\bvibe-trading-mcp[^\s"']*/g, '[internal]')
        .slice(0, 500);
      return c.json({ error: sanitized }, resp.status as ContentfulStatusCode);
    }

    return new Response(resp.body, { status: resp.status, headers: resp.headers });
  }

  // Non-billable JSON-RPC (initialize, tools/list, resources/*) — passthrough free
  let resp: Response;
  try {
    resp = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: rawBody,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'VT MCP unavailable';
    return c.json({ error: msg }, 503);
  }
  return new Response(resp.body, { status: resp.status, headers: resp.headers });
});
