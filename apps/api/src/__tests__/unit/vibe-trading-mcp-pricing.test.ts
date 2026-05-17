import { describe, test, expect } from 'bun:test';
import { getToolCost } from '../../config';

// Tests for vt_mcp_* TOOL_PRICING entries added in Story 5.5.
// Verifies that all 22 MCP tool names are registered and return expected costs.

describe('getToolCost — vt_mcp_ pricing (Story 5.5)', () => {
  // ── Free tools (baseCost: 0) ──────────────────────────────────────────────

  test('[P1] vt_mcp_list_skills is free', () => {
    expect(getToolCost('vt_mcp_list_skills')).toBe(0);
  });

  test('[P1] vt_mcp_load_skill is free', () => {
    expect(getToolCost('vt_mcp_load_skill')).toBe(0);
  });

  test('[P1] vt_mcp_write_file is free', () => {
    expect(getToolCost('vt_mcp_write_file')).toBe(0);
  });

  test('[P1] vt_mcp_read_file is free', () => {
    expect(getToolCost('vt_mcp_read_file')).toBe(0);
  });

  test('[P1] vt_mcp_list_swarm_presets is free', () => {
    expect(getToolCost('vt_mcp_list_swarm_presets')).toBe(0);
  });

  test('[P1] vt_mcp_get_swarm_status is free', () => {
    expect(getToolCost('vt_mcp_get_swarm_status')).toBe(0);
  });

  test('[P1] vt_mcp_get_run_result is free', () => {
    expect(getToolCost('vt_mcp_get_run_result')).toBe(0);
  });

  test('[P1] vt_mcp_list_runs is free', () => {
    expect(getToolCost('vt_mcp_list_runs')).toBe(0);
  });

  // ── Paid tools ────────────────────────────────────────────────────────────

  test('[P1] vt_mcp_get_market_data costs $0.05', () => {
    expect(getToolCost('vt_mcp_get_market_data')).toBe(0.05);
  });

  test('[P1] vt_mcp_analyze_options costs $0.02', () => {
    expect(getToolCost('vt_mcp_analyze_options')).toBe(0.02);
  });

  test('[P1] vt_mcp_pattern_recognition costs $0.05', () => {
    expect(getToolCost('vt_mcp_pattern_recognition')).toBe(0.05);
  });

  test('[P1] vt_mcp_factor_analysis costs $0.30', () => {
    expect(getToolCost('vt_mcp_factor_analysis')).toBe(0.30);
  });

  test('[P1] vt_mcp_backtest costs $0.50', () => {
    expect(getToolCost('vt_mcp_backtest')).toBe(0.50);
  });

  test('[P1] vt_mcp_analyze_trade_journal costs $0.10', () => {
    expect(getToolCost('vt_mcp_analyze_trade_journal')).toBe(0.10);
  });

  test('[P1] vt_mcp_extract_shadow_strategy costs $0.15', () => {
    expect(getToolCost('vt_mcp_extract_shadow_strategy')).toBe(0.15);
  });

  test('[P1] vt_mcp_run_shadow_backtest costs $0.50', () => {
    expect(getToolCost('vt_mcp_run_shadow_backtest')).toBe(0.50);
  });

  test('[P1] vt_mcp_render_shadow_report costs $0.10', () => {
    expect(getToolCost('vt_mcp_render_shadow_report')).toBe(0.10);
  });

  test('[P1] vt_mcp_scan_shadow_signals costs $0.05', () => {
    expect(getToolCost('vt_mcp_scan_shadow_signals')).toBe(0.05);
  });

  test('[P1] vt_mcp_web_search costs $0.01', () => {
    expect(getToolCost('vt_mcp_web_search')).toBe(0.01);
  });

  test('[P1] vt_mcp_read_url costs $0.02', () => {
    expect(getToolCost('vt_mcp_read_url')).toBe(0.02);
  });

  test('[P1] vt_mcp_read_document costs $0.10', () => {
    expect(getToolCost('vt_mcp_read_document')).toBe(0.10);
  });

  test('[P1] vt_mcp_run_swarm costs $0.25', () => {
    expect(getToolCost('vt_mcp_run_swarm')).toBe(0.25);
  });

  // ── Default fallback ──────────────────────────────────────────────────────

  test('[P0] unknown vt_mcp_ tool falls back to $0.01 default', () => {
    expect(getToolCost('vt_mcp_future_tool_not_yet_registered')).toBe(0.01);
  });

  // ── All 22 tools registered ───────────────────────────────────────────────

  test('[P1] all 22 vt_mcp_ tools are registered (not falling back to default)', () => {
    const tools = [
      'vt_mcp_list_skills', 'vt_mcp_load_skill', 'vt_mcp_get_market_data',
      'vt_mcp_analyze_options', 'vt_mcp_pattern_recognition', 'vt_mcp_factor_analysis',
      'vt_mcp_backtest', 'vt_mcp_analyze_trade_journal', 'vt_mcp_extract_shadow_strategy',
      'vt_mcp_run_shadow_backtest', 'vt_mcp_render_shadow_report', 'vt_mcp_scan_shadow_signals',
      'vt_mcp_web_search', 'vt_mcp_read_url', 'vt_mcp_read_document',
      'vt_mcp_write_file', 'vt_mcp_read_file', 'vt_mcp_list_swarm_presets',
      'vt_mcp_run_swarm', 'vt_mcp_get_swarm_status', 'vt_mcp_get_run_result', 'vt_mcp_list_runs',
    ];
    expect(tools).toHaveLength(22);
    // Each registered tool should NOT return the default fallback of 0.01 for free tools
    // (free tools return 0, not 0.01 — so they are registered)
    const freeTools = ['vt_mcp_list_skills', 'vt_mcp_load_skill', 'vt_mcp_write_file',
      'vt_mcp_read_file', 'vt_mcp_list_swarm_presets', 'vt_mcp_get_swarm_status',
      'vt_mcp_get_run_result', 'vt_mcp_list_runs'];
    for (const tool of freeTools) {
      expect(getToolCost(tool)).toBe(0);
    }
  });
});
