'use client';

import { useSessionAgentName } from './use-model-store';

export type AgentTier = 'tier1' | 'tier2' | 'tier3' | 'unknown';

const TIER_MAP: Record<string, AgentTier> = {
  'chainlens-tier1': 'tier1',
  'chainlens-tier2': 'tier2',
  'chainlens-tier3': 'tier3',
};

/**
 * Pure mapping from agent name → tier. Exported for unit tests; do NOT call this
 * directly from components — use `useCurrentAgentTier(sessionId)` so the component
 * re-renders when the session's agent changes.
 */
export function agentNameToTier(agentName: string | undefined): AgentTier {
  if (!agentName) return 'unknown';
  return TIER_MAP[agentName] ?? 'unknown';
}

/**
 * Returns the Chainlens tier for the agent currently assigned to the given session.
 * Reads from the ModelStore per-session agent name (set when user picks an agent).
 * Returns 'unknown' if the session has no agent or uses a non-Chainlens agent.
 */
export function useCurrentAgentTier(sessionId?: string): AgentTier {
  const agentName = useSessionAgentName(sessionId);
  return agentNameToTier(agentName);
}
