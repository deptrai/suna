import { expect, test, describe, beforeEach, afterEach, vi } from 'vitest';
import codeValidatorTool from './tools/code_validator';
import * as getEnvModule from './tools/lib/get-env';

const VALID_SOLIDITY = 'pragma solidity ^0.8.20;';

describe('code_validator tool', () => {
  beforeEach(() => {
    vi.spyOn(getEnvModule, 'getEnv').mockImplementation((key) => {
      if (key === 'EPSILON_TOKEN') return 'test-token';
      if (key === 'EPSILON_API_URL') return 'https://api.epsilon.ai';
      return undefined;
    });
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('[P0] fails when EPSILON_TOKEN missing', async () => {
    vi.spyOn(getEnvModule, 'getEnv').mockImplementation((key) =>
      key === 'EPSILON_API_URL' ? 'https://api.epsilon.ai' : undefined,
    );
    const result = await codeValidatorTool.execute(
      { code: VALID_SOLIDITY, language: 'solidity' },
      {} as any,
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('EPSILON_TOKEN');
  });

  test('[P0] rejects EPSILON_API_URL without http:// prefix', async () => {
    vi.spyOn(getEnvModule, 'getEnv').mockImplementation((key) => {
      if (key === 'EPSILON_TOKEN') return 'test-token';
      if (key === 'EPSILON_API_URL') return 'api.epsilon.ai';
      return undefined;
    });
    const result = await codeValidatorTool.execute(
      { code: VALID_SOLIDITY, language: 'solidity' },
      {} as any,
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('http://');
  });

  test('[P0] rejects empty code', async () => {
    const result = await codeValidatorTool.execute(
      { code: '   ', language: 'solidity' },
      {} as any,
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('code is required');
  });

  test('[P0] rejects code over 50000 char limit', async () => {
    const result = await codeValidatorTool.execute(
      { code: 'a'.repeat(50001), language: 'solidity' },
      {} as any,
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('50000');
  });

  test('[P0] rejects invalid language', async () => {
    const result = await codeValidatorTool.execute(
      { code: VALID_SOLIDITY, language: 'rust' as any },
      {} as any,
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('language');
  });

  test('[P0] calls /v1/router/code-validator proxy URL with Bearer auth', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        language: 'solidity',
        warnings: [],
        warning_count: 0,
        has_high_severity: false,
        sandbox_recommended: false,
        report: '## clean',
        disclaimer: 'd',
        cost: 0.01,
      }),
    });
    await codeValidatorTool.execute(
      { code: VALID_SOLIDITY, language: 'solidity' },
      {} as any,
    );

    const calledUrl = String((global.fetch as any).mock.calls[0][0]);
    expect(calledUrl).toContain('/v1/router/code-validator');

    const init = (global.fetch as any).mock.calls[0][1];
    expect(init.headers.Authorization).toBe('Bearer test-token');
    expect(init.method).toBe('POST');
  });

  test('[P0] surfaces 402 as "Insufficient credits"', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 402,
      text: async () => 'no credits',
    });
    const result = await codeValidatorTool.execute(
      { code: VALID_SOLIDITY, language: 'solidity' },
      {} as any,
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Insufficient credits');
  });

  test('[P0] surfaces upstream HTTP errors with truncated body', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'a'.repeat(2000),
    });
    const result = await codeValidatorTool.execute(
      { code: VALID_SOLIDITY, language: 'solidity' },
      {} as any,
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Proxy error 500');
    expect(parsed.error.length).toBeLessThan(700);
  });

  test('[P0] surfaces network failures as Network error', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('socket hang up'));
    const result = await codeValidatorTool.execute(
      { code: VALID_SOLIDITY, language: 'solidity' },
      {} as any,
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Network error');
  });

  test('[P0] returns parsed proxy response with response_time_ms appended', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        language: 'solidity',
        warnings: [{ severity: 'HIGH', rule: 'reentrancy', message: 'r', line: 1 }],
        warning_count: 1,
        has_high_severity: true,
        sandbox_recommended: true,
        report: '## warning',
        disclaimer: 'd',
        cost: 0.01,
      }),
    });
    const result = await codeValidatorTool.execute(
      { code: VALID_SOLIDITY, language: 'solidity' },
      {} as any,
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.has_high_severity).toBe(true);
    expect(parsed.warning_count).toBe(1);
    expect(parsed.response_time_ms).toBeDefined();
  });

  test('[P1] does NOT send empty session_id in body', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        language: 'solidity', warnings: [], warning_count: 0,
        has_high_severity: false, sandbox_recommended: false,
        report: '', disclaimer: '', cost: 0,
      }),
    });
    await codeValidatorTool.execute(
      { code: VALID_SOLIDITY, language: 'solidity', session_id: '   ' },
      {} as any,
    );
    const init = (global.fetch as any).mock.calls[0][1];
    const body = JSON.parse(init.body);
    expect(body.session_id).toBeUndefined();
  });
});
