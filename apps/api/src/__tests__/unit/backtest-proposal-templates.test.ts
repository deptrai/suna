import { describe, expect, test } from 'bun:test';
import { BACKTEST_PROPOSAL_TEMPLATES, rankTemplates } from '@/router/services/backtest-proposal-templates';

describe('backtest proposal templates', () => {
  test('asset + timeframe substitution works', () => {
    const payload = BACKTEST_PROPOSAL_TEMPLATES[0].build('ETH-USDT', '1h');
    expect(payload.context_rules.assets).toEqual(['ETH-USDT']);
    expect(payload.context_rules.timeframe).toBe('1h');
  });

  test('count=5 uniqueness can be achieved by ranked templates', () => {
    const ranked = rankTemplates('conservative trend breakout mean reversion dca').slice(0, 5);
    const families = ranked.map((t) => t.family);
    expect(new Set(families).size).toBe(5);
  });

  test('hint ranking favors expected families', () => {
    expect(rankTemplates('conservative')[0].family).toBe('conservative_dca');
    expect(rankTemplates('trend')[0].family.startsWith('trend_')).toBe(true);
    expect(rankTemplates('breakout')[0].family).toBe('breakout');
    expect(rankTemplates('mean reversion')[0].family).toBe('mean_reversion_rsi');
  });
});
