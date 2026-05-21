import { describe, expect, test } from 'bun:test';
import {
  buildApprovedPayloads,
  isRunAllReady,
  mergeFreshStack,
  mergeRevisedProposal,
  type ProposalSessionState,
} from '../proposal-store';

function baseState(): ProposalSessionState {
  return {
    proposals: [
      { tab_id: 'a', summary: 'A', strategy_family: 'trend_sma', payload: { x: 1 } },
      { tab_id: 'b', summary: 'B', strategy_family: 'breakout', payload: { y: 2 } },
    ],
    approved: { a: true, b: false },
    edits: { a: { extra: 1 } },
    run: null,
  };
}

describe('proposal store helpers', () => {
  test('mergeFreshStack replaces proposals and clears approved/edits', () => {
    const next = mergeFreshStack(baseState(), [{ tab_id: 'c', summary: 'C', strategy_family: 'trend_ema', payload: {} }]);
    expect(next.proposals).toHaveLength(1);
    expect(Object.keys(next.approved)).toHaveLength(0);
    expect(Object.keys(next.edits)).toHaveLength(0);
  });

  test('mergeRevisedProposal updates only matching tab and preserves other approvals', () => {
    const next = mergeRevisedProposal(baseState(), { tab_id: 'b', summary: 'B2', strategy_family: 'breakout', payload: { y: 3 } });
    expect(next.proposals.find((p) => p.tab_id === 'b')?.summary).toBe('B2');
    expect(next.approved.a).toBe(true);
  });

  test('mergeRevisedProposal no-op when tab is running', () => {
    const s = { ...baseState(), run: { statuses: { b: 'running' } } };
    const next = mergeRevisedProposal(s, { tab_id: 'b', summary: 'B2', strategy_family: 'breakout', payload: { y: 3 } });
    expect(next).toBe(s);
  });

  test('buildApprovedPayloads returns only approved tabs with edits', () => {
    const result = buildApprovedPayloads(baseState());
    expect(result).toHaveLength(1);
    expect(result[0].tab_id).toBe('a');
    expect(result[0].payload.extra).toBe(1);
  });

  test('isRunAllReady true when >=2 approved and none running', () => {
    const s = { ...baseState(), approved: { a: true, b: true } };
    expect(isRunAllReady(s)).toBe(true);
    expect(isRunAllReady({ ...s, run: { statuses: { b: 'running' } } })).toBe(false);
  });
});
