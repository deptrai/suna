import { describe, expect, it, beforeAll } from 'bun:test';
import { syncData } from '../../src/workers/data_worker';
import { setupTestDB } from '../fixtures/db';

describe('Data Worker Sync Integration', () => {
  beforeAll(async () => {
    await setupTestDB();
  });

  it('[P0] should sync data successfully to the database', async () => {
    const result = await syncData({ payload: 'data' });
    expect(result.success).toBe(true);
  });
});