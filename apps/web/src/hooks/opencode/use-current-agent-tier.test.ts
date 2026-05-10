import { describe, test, expect } from 'bun:test';
import { agentNameToTier } from './use-current-agent-tier';

describe('agentNameToTier', () => {
  test('returns tier1 for chainlens-tier1', () => {
    expect(agentNameToTier('chainlens-tier1')).toBe('tier1');
  });

  test('returns tier2 for chainlens-tier2', () => {
    expect(agentNameToTier('chainlens-tier2')).toBe('tier2');
  });

  test('returns tier3 for chainlens-tier3', () => {
    expect(agentNameToTier('chainlens-tier3')).toBe('tier3');
  });

  test('returns unknown for non-chainlens agent', () => {
    expect(agentNameToTier('code-review-agent')).toBe('unknown');
  });

  test('returns unknown when agent name is undefined', () => {
    expect(agentNameToTier(undefined)).toBe('unknown');
  });

  test('returns unknown for empty string', () => {
    expect(agentNameToTier('')).toBe('unknown');
  });
});
