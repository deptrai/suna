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
      {
        tab_id: 'a',
        summary: 'A',
        strategy_family: 'trend_sma',
        payload: {
          simulation_environment: { initial_capital: '10000', historical_range: 90 },
          risk_management: { position_sizing: '0.1', stop_loss: '0.03' },
        },
      },
      {
        tab_id: 'b',
        summary: 'B',
        strategy_family: 'breakout',
        payload: {
          simulation_environment: { initial_capital: '5000', historical_range: 60 },
          risk_management: { position_sizing: '0.2' },
        },
      },
    ],
    approved: { a: true, b: false },
    edits: {},
    run: null,
  };
}

describe('proposal store helpers', () => {
  test('mergeFreshStack replaces proposals and clears approved/edits', () => {
    const next = mergeFreshStack(baseState(), [
      { tab_id: 'c', summary: 'C', strategy_family: 'trend_ema', payload: {} },
    ]);
    expect(next.proposals).toHaveLength(1);
    expect(Object.keys(next.approved)).toHaveLength(0);
    expect(Object.keys(next.edits)).toHaveLength(0);
  });

  test('mergeRevisedProposal updates only matching tab and preserves other approvals', () => {
    const { state: next, outcome } = mergeRevisedProposal(baseState(), {
      tab_id: 'b',
      summary: 'B2',
      strategy_family: 'breakout',
      payload: { y: 3 },
    });
    expect(outcome).toBe('merged');
    expect(next.proposals.find((p) => p.tab_id === 'b')?.summary).toBe('B2');
    expect(next.approved.a).toBe(true);
  });

  test('mergeRevisedProposal returns outcome="running" when tab is mid-run', () => {
    const s = { ...baseState(), run: { statuses: { b: 'running' } } };
    const { state: next, outcome } = mergeRevisedProposal(s, {
      tab_id: 'b',
      summary: 'B2',
      strategy_family: 'breakout',
      payload: { y: 3 },
    });
    expect(outcome).toBe('running');
    expect(next).toBe(s);
  });

  test('mergeRevisedProposal returns outcome="no-match" for unknown tab_id (prevents phantom strategy)', () => {
    // Previously the helper pushed unknown tab_ids as new cards — silently materializing
    // strategies the user never asked for. Story 5.9.1 review patch makes this explicit.
    const { state: next, outcome } = mergeRevisedProposal(baseState(), {
      tab_id: 'ghost',
      summary: 'Ghost',
      strategy_family: 'trend_sma',
      payload: {},
    });
    expect(outcome).toBe('no-match');
    expect(next.proposals.find((p) => p.tab_id === 'ghost')).toBeUndefined();
  });

  test('buildApprovedPayloads DEEP-merges edits (Story 5.9.1 core fix)', () => {
    // The shallow-merge bug previously lost cross-field edits: editing Capital then Range
    // would drop Capital because each setEdit patch carried the whole `simulation_environment`.
    // After the fix, edits applied to different fields under the same parent key compose.
    const s: ProposalSessionState = {
      ...baseState(),
      edits: {
        a: {
          simulation_environment: { initial_capital: '20000' }, // first edit
          risk_management: { stop_loss: '0.05' },               // edit under a different parent
        },
      },
    };
    const result = buildApprovedPayloads(s);
    expect(result).toHaveLength(1);
    const payload = result[0].payload as {
      simulation_environment: { initial_capital: string; historical_range: number };
      risk_management: { position_sizing: string; stop_loss: string };
    };
    // Edited field overridden
    expect(payload.simulation_environment.initial_capital).toBe('20000');
    // UN-edited siblings UNDER THE SAME PARENT preserved (the regression case)
    expect(payload.simulation_environment.historical_range).toBe(90);
    expect(payload.risk_management.position_sizing).toBe('0.1');
    // Edited field in a different parent applied
    expect(payload.risk_management.stop_loss).toBe('0.05');
  });

  test('buildApprovedPayloads composes successive edits to the same parent', () => {
    // Simulate: user edits Capital, then edits Range — both must land in the merged payload.
    const s: ProposalSessionState = {
      ...baseState(),
      edits: {
        a: {
          simulation_environment: {
            initial_capital: '20000',
            historical_range: 180,
          },
        },
      },
    };
    const payload = buildApprovedPayloads(s)[0].payload as {
      simulation_environment: { initial_capital: string; historical_range: number };
    };
    expect(payload.simulation_environment.initial_capital).toBe('20000');
    expect(payload.simulation_environment.historical_range).toBe(180);
  });

  test('isRunAllReady true when >=2 approved and none running', () => {
    const s = { ...baseState(), approved: { a: true, b: true } };
    expect(isRunAllReady(s)).toBe(true);
    expect(isRunAllReady({ ...s, run: { statuses: { b: 'running' } } })).toBe(false);
  });
});
