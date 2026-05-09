import { describe, test, expect } from 'bun:test';

const API_URL = process.env.API_URL || 'http://localhost:8008';

const PII_PATTERNS: { name: string; regex: RegExp }[] = [
  { name: 'eth_wallet', regex: /\b0x[a-fA-F0-9]{40}\b/ },
  { name: 'tx_hash', regex: /\b0x[a-fA-F0-9]{64}\b/ },
  { name: 'ens', regex: /\b[a-zA-Z0-9-]+\.eth\b/ },
  { name: 'email', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/ },
  { name: 'ipv4', regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/ },
  { name: 'account_id', regex: /account_id/i },
  { name: 'user_id', regex: /user_id/i },
  { name: 'wallet_address', regex: /walletAddress/i },
];

async function fetchDiscover() {
  return fetch(`${API_URL}/v1/discover`);
}

describe('Discover Feed API Tests', () => {
  test('[P0] GET /v1/discover - returns 200 with items array', async () => {
    const response = await fetchDiscover();
    expect(response.status).toBe(200);
    const body: any = await response.json();
    expect(Array.isArray(body.items)).toBe(true);
  });

  test('[P0] GET /v1/discover - sets a Cache-Control header', async () => {
    const response = await fetchDiscover();
    expect(response.headers.get('cache-control')).toMatch(/max-age=\d+/);
  });

  test('[P0] GET /v1/discover - items include anomaly + warning fields', async () => {
    const response = await fetchDiscover();
    const body: any = await response.json();
    const items: any[] = body.items;

    if (items.length === 0) return;

    const first = items[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('title');
    expect(first).toHaveProperty('summary');
    expect(first).toHaveProperty('isAnomaly');
    expect(first).toHaveProperty('warningLevel');
    expect(['none', 'low', 'medium', 'high', 'critical']).toContain(first.warningLevel);
  });

  test('[P1] GET /v1/discover - anomaly items must have warningLevel != none', async () => {
    const response = await fetchDiscover();
    const body: any = await response.json();
    const items: any[] = body.items;

    for (const item of items) {
      if (item.warningLevel && item.warningLevel !== 'none') {
        expect(item.isAnomaly).toBe(true);
      }
    }
  });

  test('[P1] GET /v1/discover - response must not contain PII patterns', async () => {
    const response = await fetchDiscover();
    const rawText = await response.text();
    for (const { name, regex } of PII_PATTERNS) {
      if (regex.test(rawText)) {
        throw new Error(`Anonymization regression: ${name} pattern leaked: ${rawText.match(regex)?.[0]}`);
      }
    }
  });

  test('[P2] GET /v1/discover - returns at most 50 items', async () => {
    const response = await fetchDiscover();
    const body: any = await response.json();
    expect(body.items.length).toBeLessThanOrEqual(50);
  });

  test('[P2] GET /v1/discover - items ordered by timestamp descending', async () => {
    const response = await fetchDiscover();
    const body: any = await response.json();
    const items: any[] = body.items;

    if (items.length < 2) return;

    const timestamps = items.map((i: any) => new Date(i.timestamp).getTime());
    for (let i = 0; i < timestamps.length - 1; i++) {
      expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i + 1]);
    }
  });
});
