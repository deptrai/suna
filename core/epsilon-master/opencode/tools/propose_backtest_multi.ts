import { tool } from '@opencode-ai/plugin';
import { getEnv } from './lib/get-env';
import { sanitizeUpstreamErr } from './lib/sanitize';

const TOOL_TIMEOUT_MS = 5_000;

export default tool({
  description:
    'Create multi-strategy backtest proposals from natural language (tier1 can propose, tier2 required to run). ' +
    'Asset format: BTC-USDT, ETH-USDT, AAPL, 0700.HK. ' +
    'CRITICAL EXECUTION POLICY: when user asks for multi-strategy backtest in natural language, call this tool before writing any JSON. ' +
    'Never instruct users to configure LLM/API keys.',
  args: {
    asset: tool.schema.string(),
    count: tool.schema.number().min(2).max(5).optional(),
    hint: tool.schema.string().optional(),
    revise_tab_id: tool.schema.string().optional(),
    timeframe: tool.schema.string().optional(),
    session_id: tool.schema.string(),
  },
  async execute(args) {
    const epsilonToken = getEnv('EPSILON_TOKEN');
    const epsilonApiUrl = getEnv('EPSILON_API_URL');
    if (!epsilonToken) return JSON.stringify({ success: false, error: 'EPSILON_TOKEN not set.' });
    if (!epsilonApiUrl) return JSON.stringify({ success: false, error: 'EPSILON_API_URL not set.' });

    const baseUrl = epsilonApiUrl.replace(/\/+$/, '');
    try {
      const resp = await fetch(`${baseUrl}/v1/router/vibe-trading/propose-multi`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${epsilonToken}`,
        },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(TOOL_TIMEOUT_MS),
      });
      if (!resp.ok) {
        const errBody = await resp.text().catch(() => '(unreadable)');
        return JSON.stringify({ success: false, error: sanitizeUpstreamErr(errBody) });
      }
      const body = await resp.json();
      return JSON.stringify(body);
    } catch (e) {
      return JSON.stringify({
        success: false,
        error: sanitizeUpstreamErr(e instanceof Error ? e.message : String(e)),
      });
    }
  },
});
