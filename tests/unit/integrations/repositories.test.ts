import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { 
  insertIntegration, 
  listIntegrationsByAccount,
  getIntegrationById,
  deleteIntegration,
  linkSandboxIntegration
} from '../../../apps/api/src/integrations/repositories';
import { db } from '../../../apps/api/src/shared/db';

const mockDbInsert = mock(() => ({
  values: mock().mockReturnThis(),
  onConflictDoUpdate: mock().mockReturnThis(),
  onConflictDoNothing: mock().mockReturnThis(),
  returning: mock().mockReturnValue([{ id: 'mock-id' }])
}));

const mockDbSelect = mock(() => ({
  from: mock().mockReturnThis(),
  where: mock().mockReturnThis(),
  limit: mock().mockReturnValue([{ integrationId: 'int-123', accountId: 'acc-1' }])
}));

const mockDbDelete = mock(() => ({
  where: mock().mockReturnValue([{ id: 'mock-id' }])
}));

mock.module('../../../apps/api/src/shared/db', () => ({
  db: {
    insert: mockDbInsert,
    select: mockDbSelect,
    delete: mockDbDelete,
  }
}));

describe('Integrations Repositories', () => {
  beforeEach(() => {
    mockDbInsert.mockClear();
    mockDbSelect.mockClear();
    mockDbDelete.mockClear();
  });

  test('[P0] should insert or update integration', async () => {
    const result = await insertIntegration({
      accountId: 'acc-1',
      app: 'pipedream',
      providerName: 'pipedream',
      providerAccountId: 'pd-acc-1'
    });
    
    expect(mockDbInsert).toHaveBeenCalled();
    expect(result).toEqual({ id: 'mock-id' });
  });

  test('[P0] should list integrations by account', async () => {
    // For list query without limit(1)
    mockDbSelect.mockImplementationOnce(() => ({
      from: mock().mockReturnThis(),
      where: mock().mockReturnValue([{ integrationId: 'int-123', accountId: 'acc-1' }])
    }));

    const result = await listIntegrationsByAccount('acc-1');
    expect(result).toHaveLength(1);
    expect(mockDbSelect).toHaveBeenCalled();
  });

  test('[P0] should get integration by id', async () => {
    const result = await getIntegrationById('int-123');
    expect(result).toEqual({ integrationId: 'int-123', accountId: 'acc-1' });
    expect(mockDbSelect).toHaveBeenCalled();
  });

  test('[P0] should delete integration', async () => {
    await deleteIntegration('int-123');
    expect(mockDbDelete).toHaveBeenCalled();
  });

  test('[P0] should link sandbox integration', async () => {
    const result = await linkSandboxIntegration('sb-123', 'int-123');
    expect(mockDbInsert).toHaveBeenCalled();
    expect(result).toEqual({ id: 'mock-id' });
  });
});
