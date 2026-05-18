import { config } from '../../config';
import { logger } from '../../lib/logger';
import type { ArkhamAddressLabel, ArkhamHolderEntry, ArkhamTokenHoldersResult } from './arkham';

// ─── Dune Analytics failover service ────────────────────────────────────────
//
// Used as a secondary data source when the Arkham API is unavailable.
//
// Required Dune queries (create at https://dune.com/queries/new):
//
// DUNE_LABEL_QUERY_ID  — address label lookup
//   Parameters: chain TEXT, wallet_address TEXT
//   SQL:
//     SELECT address, name, category, label_type, model_name
//     FROM labels.all
//     WHERE blockchain = '{{chain}}'
//       AND LOWER(address) = LOWER('{{wallet_address}}')
//     LIMIT 5
//
// DUNE_TOKEN_HOLDERS_QUERY_ID  — ERC-20 token holder snapshot
//   Parameters: chain TEXT, token_address TEXT
//   SQL (current snapshot; avoids slow tokens_<chain>.balances_daily scans):
//     WITH params AS (
//       SELECT
//         lower('{{chain}}') AS chain,
//         from_hex(replace(lower('{{token_address}}'), '0x', '')) AS token_addr
//     ),
//     raw_balances AS (
//       SELECT address, balance_raw, balance, block_number
//       FROM tokens_ethereum.balances, params p
//       WHERE p.chain = 'ethereum' AND token_standard = 'erc20' AND token_address = p.token_addr
//       UNION ALL
//       SELECT address, balance_raw, balance, block_number
//       FROM tokens_base.balances, params p
//       WHERE p.chain = 'base' AND token_standard = 'erc20' AND token_address = p.token_addr
//       UNION ALL
//       SELECT address, balance_raw, balance, block_number
//       FROM tokens_bnb.balances, params p
//       WHERE p.chain = 'bnb' AND token_standard = 'erc20' AND token_address = p.token_addr
//     ),
//     latest_holder_balances AS (
//       SELECT address, balance_raw, balance,
//         row_number() OVER (PARTITION BY address ORDER BY block_number DESC) AS rn
//       FROM raw_balances
//     )
//     SELECT concat('0x', lower(to_hex(address))) AS address,
//       cast(balance_raw AS varchar) AS balance_raw,
//       cast(NULL AS double) AS percentage,
//       cast(NULL AS varchar) AS name,
//       cast(NULL AS varchar) AS category
//     FROM latest_holder_balances
//     WHERE rn = 1 AND balance > 0
//     ORDER BY balance DESC
//     LIMIT 50
//
// After creating each query, copy the numeric ID from the URL into env:
//   DUNE_LABEL_QUERY_ID=<id>
//   DUNE_TOKEN_HOLDERS_QUERY_ID=<id>

const DUNE_BASE_URL = 'https://api.dune.com';
// Poll every 2 s; timeout is configurable per environment.
const POLL_INTERVAL_MS = 2_000;

export type DuneAnalysisStatus = 'complete' | 'empty' | 'timeout' | 'failed';
export type DuneTokenHoldersResult = ArkhamTokenHoldersResult & {
  analysisStatus: DuneAnalysisStatus;
  providerError?: string;
};

function headers(): HeadersInit {
  return { 'x-dune-api-key': config.DUNE_API_KEY ?? '', 'Content-Type': 'application/json' };
}

// ─── Low-level Dune execute + poll ──────────────────────────────────────────

async function executeQuery(queryId: string, parameters: Record<string, string | number>): Promise<string> {
  const url = `${DUNE_BASE_URL}/api/v1/query/${queryId}/execute`;
  const withPerf = JSON.stringify({ query_parameters: parameters, performance: 'medium' });
  let res = await fetch(url, {
    method: 'POST',
    headers: headers(),
    signal: AbortSignal.timeout(10_000),
    body: withPerf,
  });

  // Some Dune plans/workspaces reject explicit performance tier.
  // Retry once without the `performance` field for broader compatibility.
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (text.toLowerCase().includes('invalid performance tier')) {
      const withoutPerf = JSON.stringify({ query_parameters: parameters });
      res = await fetch(url, {
        method: 'POST',
        headers: headers(),
        signal: AbortSignal.timeout(10_000),
        body: withoutPerf,
      });
      if (!res.ok) {
        const text2 = await res.text().catch(() => '');
        throw new Error(`Dune execute ${res.status}: ${text2.slice(0, 200)}`);
      }
    } else {
      throw new Error(`Dune execute ${res.status}: ${text.slice(0, 200)}`);
    }
  }

  const data = await res.json() as { execution_id: string };
  return data.execution_id;
}

async function pollResults(executionId: string): Promise<unknown[]> {
  const timeoutMs = Number.isFinite(config.DUNE_POLL_TIMEOUT_MS) ? config.DUNE_POLL_TIMEOUT_MS : 30_000;
  const deadline = Date.now() + Math.max(timeoutMs, 5_000);
  while (Date.now() < deadline) {
    const url = `${DUNE_BASE_URL}/api/v1/execution/${executionId}/results`;
    const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Dune poll ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json() as {
      state: string;
      result?: { rows: unknown[] };
      error?: { message?: string };
    };
    if (data.state === 'QUERY_STATE_COMPLETED') {
      return data.result?.rows ?? [];
    }
    if (data.state === 'QUERY_STATE_FAILED') {
      throw new Error(`Dune query failed: ${data.error?.message ?? 'unknown'}`);
    }
    if (data.state === 'QUERY_STATE_CANCELLED') {
      throw new Error('Dune query was cancelled');
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Dune query timed out after ${timeoutMs} ms`);
}

async function runQuery(queryId: string, parameters: Record<string, string | number>): Promise<unknown[]> {
  const execId = await executeQuery(queryId, parameters);
  return pollResults(execId);
}

// ─── Dune → ArkhamAddressLabel normalizer ────────────────────────────────────

interface DuneLabelRow {
  address?: string;
  name?: string;
  category?: string;
  label_type?: string;
}

function normalizeLabelRow(row: DuneLabelRow, address: string, chain: string): ArkhamAddressLabel {
  const category = (row.category ?? '').toLowerCase();
  return {
    address,
    chain,
    entityId: row.name ? row.name.toLowerCase().replace(/\s+/g, '_') : null,
    entityName: row.name ?? null,
    entityType: category || null,
    label: row.label_type ?? row.name ?? null,
    tags: category ? [category] : [],
    confidence: 0.7,
  };
}

// ─── Dune → ArkhamHolderEntry normalizer ─────────────────────────────────────

interface DuneHolderRow {
  address?: string;
  balance_raw?: string;
  percentage?: number;
  name?: string;
  category?: string;
}

function normalizeHolderRow(row: DuneHolderRow): ArkhamHolderEntry {
  const category = (row.category ?? '').toLowerCase();
  return {
    address: row.address ?? '',
    balance: row.balance_raw ?? null,
    percentage: typeof row.percentage === 'number' ? row.percentage : null,
    entityId: row.name ? row.name.toLowerCase().replace(/\s+/g, '_') : null,
    entityName: row.name ?? null,
    entityType: category || null,
    tags: category ? [category] : [],
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetch a single address label from the Dune `labels.all` community table.
 * Returns null when DUNE_API_KEY or DUNE_LABEL_QUERY_ID are not configured, or
 * when the address has no label record.
 */
export async function fetchDuneAddressLabel(
  address: string,
  chain: string,
): Promise<ArkhamAddressLabel | null> {
  const { DUNE_API_KEY, DUNE_LABEL_QUERY_ID } = config;
  if (!DUNE_API_KEY || !DUNE_LABEL_QUERY_ID) return null;

  try {
    const rows = await runQuery(DUNE_LABEL_QUERY_ID, { chain, wallet_address: address });
    if (!rows.length) return null;
    return normalizeLabelRow(rows[0] as DuneLabelRow, address, chain);
  } catch (err) {
    logger.warn('dune-labels: fetchDuneAddressLabel failed', { err });
    return null;
  }
}

/**
 * Fetch top token holders from Dune.
 * Returns an empty result (not a throw) when keys / query IDs are absent or on error,
 * so callers can degrade gracefully.
 */
export async function fetchDuneTokenHolders(
  chain: string,
  tokenAddress: string,
  opts: { limit?: number } = {},
): Promise<DuneTokenHoldersResult> {
  const empty: DuneTokenHoldersResult = {
    holders: [],
    totalHolders: null,
    chain,
    tokenAddress,
    analysisStatus: 'empty',
  };
  const { DUNE_API_KEY, DUNE_TOKEN_HOLDERS_QUERY_ID } = config;
  if (!DUNE_API_KEY || !DUNE_TOKEN_HOLDERS_QUERY_ID) {
    return { ...empty, analysisStatus: 'failed', providerError: 'Dune is not configured' };
  }

  const limit = Math.min(opts.limit ?? config.ARKHAM_TOP_HOLDER_LIMIT, 100);
  try {
    let rows: unknown[];
    try {
      rows = await runQuery(DUNE_TOKEN_HOLDERS_QUERY_ID, {
        chain,
        token_address: tokenAddress.toLowerCase(),
        holder_limit: limit,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
      // Compatibility fallback: some saved queries do not define holder_limit.
      if (msg.includes('unknown parameters') && msg.includes('holder_limit')) {
        rows = await runQuery(DUNE_TOKEN_HOLDERS_QUERY_ID, {
          chain,
          token_address: tokenAddress.toLowerCase(),
        });
      } else {
        throw err;
      }
    }
    const holders = (rows as DuneHolderRow[]).map(normalizeHolderRow);
    if (holders.length === 0) return { ...empty, analysisStatus: 'empty' };
    return { holders, totalHolders: holders.length, chain, tokenAddress, analysisStatus: 'complete' };
  } catch (err) {
    logger.warn('dune-labels: fetchDuneTokenHolders failed', { err });
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.toLowerCase().includes('timed out');
    return {
      ...empty,
      analysisStatus: isTimeout ? 'timeout' : 'failed',
      providerError: message.slice(0, 300),
    };
  }
}
