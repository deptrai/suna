import { create } from 'zustand';

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
  mergeRevisedProposal: (sessionId: string, item: ProposalItem) => { merged: boolean };
  setApproved: (sessionId: string, tabId: string, val: boolean) => void;
  setEdit: (sessionId: string, tabId: string, patch: Record<string, unknown>) => void;
  reset: (sessionId: string) => void;
}

function emptyState(): ProposalSessionState {
  return { proposals: [], approved: {}, edits: {}, run: null };
}

export function mergeFreshStack(state: ProposalSessionState, proposals: ProposalItem[]): ProposalSessionState {
  return { ...state, proposals, approved: {}, edits: {} };
}

export function mergeRevisedProposal(state: ProposalSessionState, item: ProposalItem): ProposalSessionState {
  if (state.run?.statuses?.[item.tab_id] === 'running') return state;
  const next = state.proposals.map((p) => (p.tab_id === item.tab_id ? item : p));
  if (!next.some((p) => p.tab_id === item.tab_id)) next.push(item);
  return { ...state, proposals: next };
}

export function buildApprovedPayloads(state: ProposalSessionState): Array<{ tab_id: string; payload: Record<string, unknown> }> {
  return state.proposals
    .filter((p) => state.approved[p.tab_id])
    .map((p) => ({
      tab_id: p.tab_id,
      payload: { ...p.payload, ...(state.edits[p.tab_id] ?? {}) },
    }));
}

export function isRunAllReady(state: ProposalSessionState): boolean {
  const approvedCount = Object.values(state.approved).filter(Boolean).length;
  const hasRunning = Object.values(state.run?.statuses ?? {}).includes('running');
  return approvedCount >= 2 && !hasRunning;
}

export const useProposalStore = create<ProposalStoreShape>((set, get) => ({
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
    const next = mergeRevisedProposal(current, item);
    const merged = next !== current;
    set((s) => ({ bySession: { ...s.bySession, [sessionId]: next } }));
    return { merged };
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
  reset: (sessionId) =>
    set((s) => {
      const next = { ...s.bySession };
      delete next[sessionId];
      return { bySession: next };
    }),
}));
