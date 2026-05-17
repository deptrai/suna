import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { checkCredits, deductToolCredits, resolveAccountTier } from '../services/billing';
import { config } from '../../config';
import type { AppContext } from '../../types';

const MCP_BASE = () => (config.VIBE_TRADING_MCP_URL ?? 'http://vibe-trading-mcp:8900').replace(/\/+$/, '');

const BILLABLE_METHODS = new Set(['tools/call']);

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
    const ct = resp.headers.get('content-type') ?? '';
    if (ct.includes('text/event-stream') && resp.body) {
      const PROXY_PREFIX = '/v1/router/vibe-trading-mcp';
      const rewriteHeaders = new Headers(resp.headers);
      const rewritten = resp.body
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(new TransformStream({
          transform(chunk, controller) {
            // Rewrite `data: /messages/...` → `data: /v1/router/vibe-trading-mcp/messages/...`
            controller.enqueue(
              chunk.replace(/^(data:\s*)(\/messages\/)/gm, `$1${PROXY_PREFIX}$2`)
            );
          },
        }))
        .pipeThrough(new TextEncoderStream());
      return new Response(rewritten, { status: resp.status, headers: rewriteHeaders });
    }

    return new Response(resp.body, { status: resp.status, headers: resp.headers });
  }

  // POST — may be JSON-RPC tools/call
  const rawBody = await c.req.text();
  let jsonRpc: { method?: string; params?: { name?: string } } | null = null;
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

    const credit = await checkCredits(accountId);
    if (!credit.hasCredits) return c.json({ error: 'Insufficient credits' }, 402);

    const ua = (c.req.header('user-agent') ?? '').replace(/[\r\n\t]/g, ' ').slice(0, 80);
    console.log(`[TIER-BYPASS-SUSPECT] mcp_tool=${toolName} account=${accountId} ua="${ua}"`);

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
