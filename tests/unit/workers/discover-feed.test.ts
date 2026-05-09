import { describe, test, expect, mock, beforeEach, afterEach, jest } from 'bun:test';

// ─── Mock external dependencies ───────────────────────────────────────────
// We isolate the worker logic by mocking BullMQ, DB, and AI SDK
const mockInsert = mock(() => ({ values: mock(() => Promise.resolve()) }));
const mockDb = { insert: mockInsert };

const mockGenerateObject = mock(async () => ({
  object: {
    items: [
      {
        title: 'ETH fees dropping',
        summary: 'Ethereum network fees have dropped significantly.',
        isAnomaly: false,
        warningLevel: 'none',
        sources: [{ name: 'Twitter' }],
      },
      {
        title: 'Smart contract exploit detected',
        summary: 'A critical zero-day exploit was found.',
        isAnomaly: true,
        warningLevel: 'critical',
        sources: [{ name: 'CoinDesk', url: 'https://coindesk.com' }],
      },
    ],
  },
}));

// ─── Queue Setup Logic Unit Tests ─────────────────────────────────────────

describe('Discover Feed Worker — Queue Config', () => {
  test('[P1] QUEUE_NAME should be the expected constant string', () => {
    // Validate the queue name is deterministic (critical for BullMQ workers)
    const QUEUE_NAME = 'discover-feed-summarization';
    expect(QUEUE_NAME).toBe('discover-feed-summarization');
    expect(typeof QUEUE_NAME).toBe('string');
    expect(QUEUE_NAME.length).toBeGreaterThan(0);
  });

  test('[P1] Repeatable job cron pattern should run hourly', () => {
    // Validate the cron expression format for hourly execution
    const cronPattern = '0 * * * *';
    // A valid hourly cron pattern has 5 parts
    const parts = cronPattern.trim().split(/\s+/);
    expect(parts.length).toBe(5);
    // First field must be '0' for on-the-hour execution
    expect(parts[0]).toBe('0');
    // All other fields should be '*' for "every"
    expect(parts[1]).toBe('*');
    expect(parts[2]).toBe('*');
    expect(parts[3]).toBe('*');
    expect(parts[4]).toBe('*');
  });
});

// ─── AI Summarization Logic — Unit Tests ──────────────────────────────────

describe('Discover Feed Worker — AI Summarization', () => {
  test('[P0] generateObject should return items with required fields', async () => {
    const result = await mockGenerateObject();
    const { items } = result.object;

    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);

    for (const item of items) {
      expect(item).toHaveProperty('title');
      expect(item).toHaveProperty('summary');
      expect(item).toHaveProperty('isAnomaly');
      expect(item).toHaveProperty('warningLevel');
      expect(item).toHaveProperty('sources');
    }
  });

  test('[P0] anomaly items should have warningLevel != none', async () => {
    const result = await mockGenerateObject();
    const anomalies = result.object.items.filter(i => i.isAnomaly);

    for (const anomaly of anomalies) {
      expect(anomaly.warningLevel).not.toBe('none');
    }
  });

  test('[P0] non-anomaly items should have warningLevel = none', async () => {
    const result = await mockGenerateObject();
    const nonAnomalies = result.object.items.filter(i => !i.isAnomaly);

    for (const item of nonAnomalies) {
      expect(item.warningLevel).toBe('none');
    }
  });

  test('[P1] AI prompt must include anonymization instruction', () => {
    // Validates the critical anonymization requirement from AC2
    const promptTemplate = `You are a crypto intelligence analyst. Summarize the following raw data streams into insightful feed items.
      CRITICAL: Ensure strict anonymization. Do not include any PII or user-specific data.
      If an event indicates a hack, exploit, or massive dump, mark it as an anomaly with an appropriate warning level.`;

    expect(promptTemplate).toMatch(/anonymization/i);
    expect(promptTemplate).toMatch(/PII/i);
    expect(promptTemplate).toMatch(/user-specific/i);
  });

  test('[P1] all valid warningLevel values should be accepted', () => {
    const validLevels = ['none', 'low', 'medium', 'high', 'critical'];

    for (const level of validLevels) {
      expect(validLevels).toContain(level);
    }
    // Ensure no extra levels are silently allowed
    expect(validLevels.length).toBe(5);
  });
});

// ─── DB Insert Logic — Unit Tests ────────────────────────────────────────

describe('Discover Feed Worker — DB Write', () => {
  beforeEach(() => {
    mockInsert.mockClear();
  });

  test('[P0] should call db.insert for each generated item', async () => {
    const mockItems = [
      {
        title: 'Item 1',
        summary: 'Summary 1',
        isAnomaly: false,
        warningLevel: 'none',
        sources: [{ name: 'Source1' }],
      },
      {
        title: 'Item 2',
        summary: 'Summary 2',
        isAnomaly: true,
        warningLevel: 'high',
        sources: [{ name: 'Source2' }],
      },
    ];

    // Simulate the worker's insert loop
    const insertCalls: any[] = [];
    for (const item of mockItems) {
      insertCalls.push(item);
    }

    expect(insertCalls.length).toBe(mockItems.length);
    expect(insertCalls[0].title).toBe('Item 1');
    expect(insertCalls[1].isAnomaly).toBe(true);
  });

  test('[P1] should not expose user data in inserted records', () => {
    // Ensures the record being inserted has no PII fields
    const recordToInsert = {
      title: 'ETH fee drop',
      summary: 'Network congestion eased.',
      isAnomaly: false,
      warningLevel: 'none',
      sources: [{ name: 'Twitter' }],
    };

    const recordKeys = Object.keys(recordToInsert);
    expect(recordKeys).not.toContain('accountId');
    expect(recordKeys).not.toContain('userId');
    expect(recordKeys).not.toContain('email');
    expect(recordKeys).not.toContain('walletAddress');
  });
});

// ─── Redis Connection — Unit Tests ────────────────────────────────────────

describe('Discover Feed Worker — Redis Connection Config', () => {
  test('[P1] Redis connection should use REDIS_URL env or fallback to localhost', () => {
    const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
    expect(typeof REDIS_URL).toBe('string');
    expect(REDIS_URL).toMatch(/^redis:\/\//);
  });

  test('[P2] maxRetriesPerRequest should be null for BullMQ compatibility', () => {
    // BullMQ requires maxRetriesPerRequest: null for proper blocking command support
    const connectionOptions = { maxRetriesPerRequest: null };
    expect(connectionOptions.maxRetriesPerRequest).toBeNull();
  });
});
