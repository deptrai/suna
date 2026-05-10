import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { getAccountCreds, upsertAccountCreds, deleteAccountCreds } from '../../../apps/api/src/integrations/credential-store';
import { db } from '../../../apps/api/src/shared/db';

const mockDbSelect = mock(() => ({
  from: mock().mockReturnThis(),
  where: mock().mockReturnThis(),
  limit: mock().mockReturnValue([{
    id: 'mock-id',
    accountId: 'acc-1',
    provider: 'pipedream',
    isActive: true,
    credentials: {
      client_id: 'mock-client-id',
      client_secret: 'mock-client-secret',
      project_id: 'mock-project-id',
      environment: 'production'
    }
  }])
}));

const mockDbUpdate = mock(() => ({
  set: mock().mockReturnThis(),
  where: mock().mockReturnValue([{ id: 'mock-id' }])
}));

const mockDbInsert = mock(() => ({
  values: mock().mockReturnThis()
}));

const mockDbDelete = mock(() => ({
  where: mock().mockReturnValue([{ id: 'mock-id' }])
}));

mock.module('../../../apps/api/src/shared/db', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
    insert: mockDbInsert,
    delete: mockDbDelete,
  }
}));

describe('Integration Credential Store', () => {
  beforeEach(() => {
    mockDbSelect.mockClear();
    mockDbUpdate.mockClear();
    mockDbInsert.mockClear();
    mockDbDelete.mockClear();
  });

  test('[P0] should get account credentials successfully', async () => {
    const creds = await getAccountCreds('acc-1');
    expect(creds).toBeDefined();
    expect(creds?.client_id).toBe('mock-client-id');
    expect(creds?.client_secret).toBe('mock-client-secret');
    expect(creds?.project_id).toBe('mock-project-id');
    expect(creds?.environment).toBe('production');
  });

  test('[P0] should handle get account credentials error gracefully', async () => {
    mockDbSelect.mockImplementationOnce(() => {
      throw new Error('Database connection failed');
    });
    const creds = await getAccountCreds('acc-1');
    expect(creds).toBeNull();
  });

  test('[P0] should update existing account credentials', async () => {
    await upsertAccountCreds('acc-1', {
      client_id: 'new-id',
      client_secret: 'new-secret',
      project_id: 'new-proj',
    });
    
    // Check if db.update was called since limit(1) returns the existing mock record
    expect(mockDbUpdate).toHaveBeenCalled();
  });

  test('[P0] should insert new account credentials', async () => {
    mockDbSelect.mockImplementationOnce(() => ({
      from: mock().mockReturnThis(),
      where: mock().mockReturnThis(),
      limit: mock().mockReturnValue([]) // Empty array implies no existing record
    }));

    await upsertAccountCreds('acc-2', {
      client_id: 'new-id',
      client_secret: 'new-secret',
      project_id: 'new-proj',
    });
    
    expect(mockDbInsert).toHaveBeenCalled();
  });

  test('[P0] should delete account credentials', async () => {
    await deleteAccountCreds('acc-1');
    expect(mockDbDelete).toHaveBeenCalled();
  });
});
