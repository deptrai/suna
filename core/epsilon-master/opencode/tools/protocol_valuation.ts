import { tool } from '@opencode-ai/plugin';
import { getEnv } from './lib/get-env';
import { sanitizeUpstreamErr } from './lib/sanitize';

export default tool({
  description: 'Analyze protocol valuation fundamentals (fees/revenue/earnings/users/devs, P/S, P/F, P/E) from cached Token Terminal data. Cache-first by default.',
  args: {
    mode: tool.schema.string().optional().describe("project_snapshot|valuation_matrix|metric_timeseries; default project_snapshot"),
    project_id: tool.schema.string().optional(),
    symbol: tool.schema.string().optional(),
    token_address: tool.schema.string().optional(),
    sector: tool.schema.string().optional(),
    peer_project_ids: tool.schema.string().optional().describe('comma-separated project ids'),
    metrics: tool.schema.string().optional().describe('comma-separated metric ids for timeseries'),
    force_refresh: tool.schema.string().optional().describe('true/false; default false'),
    session_id: tool.schema.string().optional(),
  },
  async execute(args) {
    const token = getEnv('EPSILON_TOKEN');
    const apiUrl = getEnv('EPSILON_API_URL');
    if (!token) return JSON.stringify({ success: false, error: 'EPSILON_TOKEN not set.' }, null, 2);
    if (!apiUrl) return JSON.stringify({ success: false, error: 'EPSILON_API_URL not set.' }, null, 2);

    const body: Record<string, unknown> = {
      mode: (args.mode?.trim() || 'project_snapshot'),
      force_refresh: String(args.force_refresh || 'false').toLowerCase() === 'true',
    };
    if (args.project_id) body.project_id = args.project_id.trim();
    if (args.symbol) body.symbol = args.symbol.trim();
    if (args.token_address) body.token_address = args.token_address.trim();
    if (args.sector) body.sector = args.sector.trim();
    if (args.peer_project_ids) body.peer_project_ids = args.peer_project_ids.split(',').map((x) => x.trim()).filter(Boolean);
    if (args.metrics) body.metrics = args.metrics.split(',').map((x) => x.trim()).filter(Boolean);
    if (args.session_id) body.session_id = args.session_id.slice(0, 128);

    try {
      const res = await fetch(`${apiUrl.replace(/\/+$/, '')}/v1/router/protocol-valuation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        return JSON.stringify({ success: false, error: sanitizeUpstreamErr(`HTTP ${res.status}: ${txt}`) }, null, 2);
      }

      return JSON.stringify(await res.json(), null, 2);
    } catch (err: any) {
      return JSON.stringify({ success: false, error: err?.name === 'TimeoutError' ? 'Request timed out' : sanitizeUpstreamErr(String(err)) }, null, 2);
    }
  },
});
