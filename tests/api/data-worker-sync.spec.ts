import { test, expect } from '@seontechnologies/playwright-utils/api-request/fixtures';

test.describe('Data Worker Sync API Tests', () => {
  test('[P0] should trigger data sync job successfully', async ({ apiRequest }) => {
    const { status, body } = await apiRequest({
      method: 'POST',
      path: '/api/v1/sync/trigger',
      body: {
        source: 'rag-system',
        target: 'chat-db'
      },
      headers: { Authorization: 'Bearer token' }
    });

    expect(status).toBe(202);
    expect(body.jobId).toBeDefined();
    expect(body.status).toBe('pending');
  });

  test('[P1] should poll for sync job completion', async ({ apiRequest, recurse }) => {
    const { body: job } = await apiRequest({
      method: 'POST',
      path: '/api/v1/sync/trigger',
      body: {
        source: 'rag-system',
        target: 'chat-db'
      },
      headers: { Authorization: 'Bearer token' }
    });

    const { body: completedJob } = await recurse(
      () => apiRequest({ 
        method: 'GET', 
        path: `/api/v1/sync/status/${job.jobId}`,
        headers: { Authorization: 'Bearer token' }
      }),
      (response) => response.body.status === 'completed',
      { timeout: 30000, interval: 1000 }
    );

    expect(completedJob.status).toBe('completed');
    expect(completedJob.syncedRecords).toBeGreaterThanOrEqual(0);
  });
});