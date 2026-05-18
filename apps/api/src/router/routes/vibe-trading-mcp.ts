import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
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

const RUN_OWNERSHIP_TTL_MS = 24 * 60 * 60 * 1000; // 24h

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
      const rewriteHeaders = new Headers(resp.headers);
      const rewritten = resp.body
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(new TransformStream({
          transform(chunk, controller) {
            // Rewrite `data: /messages/...` → `data: /v1/router/vibe-trading-mcp/messages/...`
            const rewrittenChunk = chunk.replace(/^(data:\s*)(\/messages\/)/gm, `$1${PROXY_PREFIX}$2`);

            // Story 5.5.1 — opportunistic SSE introspection.
            // Capture session_id (first event) so we can correlate POSTs with responses.
            const sessMatch = chunk.match(/session_id=([a-f0-9]+)/i);
            if (sessMatch && !upstreamSessionId) {
              upstreamSessionId = sessMatch[1];
            }

            // Scan data lines for JSON-RPC responses with start_swarm results.
            for (const line of chunk.split('\n')) {
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
                      toolResult.run_id.length > 0) {
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
    params?: { name?: string; arguments?: { run_id?: unknown } };
  } | null = null;
  try { jsonRpc = JSON.parse(rawBody); } catch { /* not JSON-RPC, passthrough */ }

  const isBillable = jsonRpc?.method != null && BILLABLE_METHODS.has(jsonRpc.method);

  if (isBillable) {
    const toolName = jsonRpc?.params?.name;
    if (!toolName || typeof toolName !== 'string') {
      // Closes fail-open: malformed tools/call must not get free passthrough
      return c.json({ error: 'Missing or invalid params.name on tools/call' }, 400);
    }

    // Tier gate — MCP tools bypass OpenCode permission system (Risk R5)
    const tier = await resolveAccountTier(accountId);
    if (tier !== 'tier2' && tier !== 'tier3') {
      return c.json({ error: 'Tier 2 required for Vibe-Trading MCP tools' }, 403);
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
      }
    }

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

    // For tools whose response we must introspect (run_id capture, finalize
    // billing trigger, ownership re-hydration), read the body once and rebuild
    // the Response. Other tools keep the streaming passthrough.
    const needsBodyIntrospection =
      toolName === 'start_swarm' ||
      toolName === 'list_runs' ||
      toolName === 'get_run_result';

    if (needsBodyIntrospection) {
      const respText = await resp.text();
      const parsed = resp.ok ? parseToolResult(respText) : null;

      if (resp.ok) {
        // Story 5.5.1 — capture run_id from start_swarm to seed ownership.
        if (toolName === 'start_swarm' && parsed && typeof parsed === 'object') {
          const r = parsed as { run_id?: unknown; status?: unknown };
          if (r.status === 'started' && typeof r.run_id === 'string' && r.run_id.length > 0) {
            setOwnership(r.run_id, accountId);
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

        // Bill the tool itself (start_swarm = deposit; get_run_result/list_runs = 0).
        try {
          await deductToolCredits(accountId, `vt_mcp_${toolName}`, 0, `MCP: ${toolName}`);
        } catch (e) {
          console.warn(`[EPSILON][billing-failure] mcp_tool=${toolName} account=${accountId} err=${e instanceof Error ? e.message : String(e)}`);
        }

        // Story 5.5.1 AC5 — finalize billing on completed run.
        if (toolName === 'get_run_result' && parsed && typeof parsed === 'object' && gatedRunId) {
          const r = parsed as { status?: unknown };
          if (r.status === 'completed') {
            const entry = runOwnership.get(gatedRunId);
            // Claim BEFORE await so any subsequent re-entry sees finalized=true.
            // Single-threaded JS event loop guarantees no actual race; this is
            // defence-in-depth.
            if (entry && !entry.finalized) {
              entry.finalized = true;
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

      // Rebuild the Response since we consumed the body
      const ct = resp.headers.get('content-type') ?? '';
      if (!resp.ok && ct.includes('application/json')) {
        const sanitized = respText.replace(/https?:\/\/[^\s"']*/g, '[url]').slice(0, 500);
        return c.json({ error: sanitized }, resp.status as any);
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

    // sanitizeUpstreamErr: JSON only — never on SSE chunks (would break stream)
    const ct = resp.headers.get('content-type') ?? '';
    if (!resp.ok && ct.includes('application/json')) {
      const errText = await resp.text();
      // Strip any internal URLs or stack traces from upstream error
      const sanitized = errText.replace(/https?:\/\/[^\s"']*/g, '[url]').slice(0, 500);
      return c.json({ error: sanitized }, resp.status as any);
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
