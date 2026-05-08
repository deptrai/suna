import { describe, test, expect } from 'bun:test';

const API_URL = process.env.API_URL || 'http://localhost:8008';

describe('Data Worker Sync API Tests', () => {
  test('[P0] should trigger data sync job successfully', async () => {
    const response = await fetch(`${API_URL}/api/v1/sync/trigger`, {
      method: 'POST',
      body: JSON.stringify({ source: 'rag-system', target: 'chat-db' }),
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' }
    });
    const status = response.status;
    
    if (status === 404) {
      expect(status).toBe(202);
      return;
    }

    const body: any = await response.json().catch(() => ({}));
    expect(status).toBe(202);
    expect(body.jobId).toBeDefined();
    expect(body.status).toBe('pending');
  });

  test('[P1] should poll for sync job completion', async () => {
    const triggerRes = await fetch(`${API_URL}/api/v1/sync/trigger`, {
      method: 'POST',
      body: JSON.stringify({ source: 'rag-system', target: 'chat-db' }),
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' }
    });
    
    if (triggerRes.status === 404) {
      expect(triggerRes.status).toBe(202);
      return;
    }

    const job: any = await triggerRes.json().catch(() => ({}));
    
    // Simulate simple poll
    const response = await fetch(`${API_URL}/api/v1/sync/status/${job.jobId}`, {
      headers: { Authorization: 'Bearer token' }
    });
    const completedJob: any = await response.json().catch(() => ({}));

    expect(completedJob.status).toBe('completed');
    expect(completedJob.syncedRecords).toBeGreaterThanOrEqual(0);
  });
});