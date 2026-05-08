import { describe, expect, it } from 'bun:test';
import { checkIdempotency } from '../../src/services/idempotency';

describe('Idempotency Service', () => {
  it('[P0] should allow first request', async () => {
    const res = await checkIdempotency('key1');
    expect(res.allowed).toBe(true);
  });

  it('[P1] should block duplicate request', async () => {
    await checkIdempotency('key2');
    const res = await checkIdempotency('key2');
    expect(res.allowed).toBe(false);
  });
});