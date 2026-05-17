import { expect, test, describe, beforeEach, afterEach, vi } from 'vitest';
import instanceDisposeTool from './tools/instance_dispose';

describe('instance_dispose tool', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('[P0] returns success message when dispose succeeds', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    const result = await instanceDisposeTool.execute(
      { reason: 'updated opencode.jsonc' },
      {} as any,
    );
    expect(result).toContain('INSTANCE DISPOSE TRIGGERED');
    expect(result).toContain('updated opencode.jsonc');
  });

  test('[P0] returns failure message on non-2xx HTTP status', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'service unavailable',
    });
    const result = await instanceDisposeTool.execute(
      { reason: 'test' },
      {} as any,
    );
    expect(String(result)).toContain('failed');
    expect(String(result)).toContain('503');
  });

  test('[P0] returns failure message on network error', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const result = await instanceDisposeTool.execute(
      { reason: 'test' },
      {} as any,
    );
    expect(String(result)).toContain('failed');
    expect(String(result)).toContain('ECONNREFUSED');
  });

  test('[P0] uses POST method', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    await instanceDisposeTool.execute({ reason: 'test' }, {} as any);
    const init = (global.fetch as any).mock.calls[0][1];
    expect(init.method).toBe('POST');
  });

  test('[P0] calls /instance/dispose endpoint on local OpenCode server', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    await instanceDisposeTool.execute({ reason: 'test' }, {} as any);
    const calledUrl = String((global.fetch as any).mock.calls[0][0]);
    expect(calledUrl).toContain('/instance/dispose');
  });

  test('[P1] uses default reason when reason is empty', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    const result = await instanceDisposeTool.execute({ reason: '' }, {} as any);
    expect(result).toContain('manual agent trigger');
  });

  test('[P1] AbortSignal timeout prevents indefinite hang', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    await instanceDisposeTool.execute({ reason: 'test' }, {} as any);
    const init = (global.fetch as any).mock.calls[0][1];
    expect(init.signal).toBeDefined();
  });
});
