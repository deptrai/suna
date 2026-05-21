import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface ProposalItem {
  tab_id: string;
  summary: string;
  strategy_family: string;
  payload: Record<string, unknown>;
}

export interface ProposalSessionState {
  proposals: ProposalItem[];
  approved: Record<string, boolean>;
  edits: Record<string, Record<string, unknown>>;
  run: { statuses: Record<string, string> } | null;
}

export interface ProposalStoreShape {
  bySession: Record<string, ProposalSessionState>;
  mergeFreshStack: (sessionId: string, proposals: ProposalItem[]) => void;
  mergeRevisedProposal: (sessionId: string, item: ProposalItem) => { outcome: MergeRevisedOutcome };
  setApproved: (sessionId: string, tabId: string, val: boolean) => void;
  setEdit: (sessionId: string, tabId: string, patch: Record<string, unknown>) => void;
  setRunStatuses: (sessionId: string, statuses: Record<string, string>) => void;
  rejectTab: (sessionId: string, tabId: string) => void;
  reset: (sessionId: string) => void;
}

function emptyState(): ProposalSessionState {
  return { proposals: [], approved: {}, edits: {}, run: null };
}

export function mergeFreshStack(state: ProposalSessionState, proposals: ProposalItem[]): ProposalSessionState {
  return { ...state, proposals, approved: {}, edits: {} };
}

/**
 * Returned sentinel from mergeRevisedProposal so the caller can distinguish:
 *  - 'merged'  — proposal updated in-place
 *  - 'running' — target tab is mid-run; merge skipped (caller should toast)
 *  - 'no-match'— revise_tab_id doesn't match any existing proposal; merge skipped
 *                (prevents the silent "phantom strategy" footgun where a server-side
 *                tab_id mismatch would otherwise create a card the user never saw)
 */
export type MergeRevisedOutcome = 'merged' | 'running' | 'no-match';

export function mergeRevisedProposal(
  state: ProposalSessionState,
  item: ProposalItem,
): { state: ProposalSessionState; outcome: MergeRevisedOutcome } {
  if (state.run?.statuses?.[item.tab_id] === 'running') {
    return { state, outcome: 'running' };
  }
  const exists = state.proposals.some((p) => p.tab_id === item.tab_id);
  if (!exists) {
    return { state, outcome: 'no-match' };
  }
  const next = state.proposals.map((p) => (p.tab_id === item.tab_id ? item : p));
  return { state: { ...state, proposals: next }, outcome: 'merged' };
}

/**
 * Deep-merge user edits into a proposal payload — critical for the inline numeric inputs
 * (Capital, Range, Position %, Stop loss, Take profit, Timeframe). Each input handler stores
 * its patch under the parent key (e.g. `simulation_environment`); a shallow spread would
 * replace the whole sub-object and lose prior edits to other fields under the same parent.
 */
function deepMergePayload(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const baseVal = base[key];
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      baseVal !== null &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal)
    ) {
      out[key] = deepMergePayload(baseVal as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function buildApprovedPayloads(state: ProposalSessionState): Array<{ tab_id: string; payload: Record<string, unknown> }> {
  return state.proposals
    .filter((p) => state.approved[p.tab_id])
    .map((p) => ({
      tab_id: p.tab_id,
      payload: deepMergePayload(p.payload, state.edits[p.tab_id] ?? {}),
    }));
}

export function isRunAllReady(state: ProposalSessionState): boolean {
  const approvedCount = Object.values(state.approved).filter(Boolean).length;
  const hasRunning = Object.values(state.run?.statuses ?? {}).includes('running');
  return approvedCount >= 2 && !hasRunning;
}

export const useProposalStore = create<ProposalStoreShape>()(
  persist(
    (set, get) => ({
  bySession: {},
  mergeFreshStack: (sessionId, proposals) =>
    set((s) => ({
      bySession: {
        ...s.bySession,
        [sessionId]: mergeFreshStack(s.bySession[sessionId] ?? emptyState(), proposals),
      },
    })),
  mergeRevisedProposal: (sessionId, item) => {
    const current = get().bySession[sessionId] ?? emptyState();
    const { state: next, outcome } = mergeRevisedProposal(current, item);
    if (next !== current) {
      set((s) => ({ bySession: { ...s.bySession, [sessionId]: next } }));
    }
    return { outcome };
  },
  setApproved: (sessionId, tabId, val) =>
    set((s) => {
      const current = s.bySession[sessionId] ?? emptyState();
      return {
        bySession: {
          ...s.bySession,
          [sessionId]: { ...current, approved: { ...current.approved, [tabId]: val } },
        },
      };
    }),
  setEdit: (sessionId, tabId, patch) =>
    set((s) => {
      const current = s.bySession[sessionId] ?? emptyState();
      return {
        bySession: {
          ...s.bySession,
          [sessionId]: {
            ...current,
            edits: { ...current.edits, [tabId]: { ...(current.edits[tabId] ?? {}), ...patch } },
          },
        },
      };
    }),
  setRunStatuses: (sessionId, statuses) =>
    set((s) => {
      const current = s.bySession[sessionId] ?? emptyState();
      return {
        bySession: {
          ...s.bySession,
          [sessionId]: {
            ...current,
            run: { statuses },
          },
        },
      };
    }),
  rejectTab: (sessionId, tabId) =>
    set((s) => {
      // Reject must also CLEAR approval — otherwise buildApprovedPayloads still includes
      // the rejected card and Run All silently executes it. Story 5.9.1 D4a decision.
      const current = s.bySession[sessionId] ?? emptyState();
      const nextApproved = { ...current.approved };
      delete nextApproved[tabId];
      const nextEdits = { ...current.edits };
      delete nextEdits[tabId];
      const nextProposals = current.proposals.filter((p) => p.tab_id !== tabId);
      return {
        bySession: {
          ...s.bySession,
          [sessionId]: { ...current, proposals: nextProposals, approved: nextApproved, edits: nextEdits },
        },
      };
    }),
  reset: (sessionId) =>
    set((s) => {
      const next = { ...s.bySession };
      delete next[sessionId];
      return { bySession: next };
    }),
    }),
    {
      // Persist proposal cards / approval / inline edits across page refresh. Per-tab
      // sessionStorage matches Story 5.9's existing `chainlens:backtest:multi-draft:`
      // pattern — survives reload, cleared on tab close. The `run` field is intentionally
      // skipped from persistence (in-flight SSE streams cannot resume).
      name: 'chainlens:backtest:proposals-v1',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        bySession: Object.fromEntries(
          Object.entries(state.bySession).map(([sid, s]) => [
            sid,
            { proposals: s.proposals, approved: s.approved, edits: s.edits, run: null },
          ]),
        ),
      }) as Pick<ProposalStoreShape, 'bySession'>,
    },
  ),
);

// ── Module-scoped session run-lock (Story 5.9.1 D3b) ────────────────────────────
// Prevents the editor + chat tool view (two independent useMultiBacktestRun instances)
// from both calling submitBacktestMulti for the same session and double-billing the user.
// `tryAcquireRunLock` returns false if a run is already in flight for the session_id.
const runningSessionLocks = new Set<string>();
export function tryAcquireRunLock(sessionId: string): boolean {
  if (!sessionId) return true; // No session → no cross-component coordination possible; allow.
  if (runningSessionLocks.has(sessionId)) return false;
  runningSessionLocks.add(sessionId);
  return true;
}
export function releaseRunLock(sessionId: string): void {
  if (!sessionId) return;
  runningSessionLocks.delete(sessionId);
}
export function hasRunLock(sessionId: string): boolean {
  return !!sessionId && runningSessionLocks.has(sessionId);
}
