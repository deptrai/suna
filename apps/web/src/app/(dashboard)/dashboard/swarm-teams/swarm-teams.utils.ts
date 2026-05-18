import type { SwarmPreset } from '@/components/swarm-teams/preset-catalog';

export function buildSwarmPrompt(preset: SwarmPreset, vars: Record<string, string>): string {
  // Story 5.5.1 — dispatch via the vibe_trading_swarm OpenCode wrapper (NOT the
  // deprecated run_swarm MCP tool, which the proxy now rejects with 410). The
  // wrapper handles start → poll → finalize internally and surfaces progress
  // markers + the final markdown report. Press Stop in the chat to cancel
  // (wrapper detects ctx.abort and fires cancel_swarm).
  return `Run the Vibe-Trading swarm preset "${preset.name}" with these variables:\n${JSON.stringify(vars, null, 2)}\n\nUse the vibe_trading_swarm tool (preset + variables args). It handles polling internally — return the final report once it completes.`;
}

export async function dispatchSwarmPrompt(
  mutateAsync: () => Promise<{ id: string }>,
  promptText: string,
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
    title: 'Swarm Teams run',
    type: 'session',
    href: `/sessions/${session.id}`,
    serverId,
  });
}
