import type { SwarmPreset } from '@/components/swarm-teams/preset-catalog';

export function buildSwarmPrompt(preset: SwarmPreset, vars: Record<string, string>): string {
  return `Run the Vibe-Trading swarm preset "${preset.name}" with these variables:\n${JSON.stringify(vars, null, 2)}\n\nUse the run_swarm MCP tool. Stream the run_id back, then poll get_swarm_run_status every 30s until status=done. Show the final report.`;
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
