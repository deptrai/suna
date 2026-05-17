export function buildShadowAnalyzePrompt(uploadedPath: string, host: string): string {
  return `Analyze my trade journal at ${uploadedPath} using the Vibe-Trading Shadow Account loop. Run these MCP tools in order, stream a brief explanation after each:\n\n1. analyze_trade_journal(journal_path="${uploadedPath}")\n2. extract_shadow_strategy(journal_path=..., min_support=3, max_rules=5)\n3. run_shadow_backtest(shadow_id=..., markets=["us","crypto","hk","china_a"])\n4. render_shadow_report(shadow_id=..., include_today_signals=true)\n5. scan_shadow_signals(shadow_id=..., per_market=3)\n\nAfter step 4, share the report viewer URL: https://${host}/v1/router/vibe-trading/shadow-reports/<shadow_id>?format=html`;
}

export async function dispatchShadowPrompt(
  mutateAsync: () => Promise<{ id: string }>,
  promptText: string,
  title: string,
  navigate: (payload: {
    id: string;
    title: string;
    type: 'session';
    href: string;
    serverId?: string;
  }) => void,
  serverId?: string,
) {
  const session = await mutateAsync();
  sessionStorage.setItem(`opencode_pending_prompt:${session.id}`, promptText);
  sessionStorage.setItem(
    `opencode_pending_options:${session.id}`,
    JSON.stringify({ agent: 'chainlens-tier2' }),
  );
  navigate({
    id: session.id,
    title,
    type: 'session',
    href: `/sessions/${session.id}`,
    serverId,
  });
}
