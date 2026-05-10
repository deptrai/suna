import { config } from '../../config';

const TX_SIM_TIMEOUT_MS = 8000;

export interface TxSimulationPayload {
  from: string;
  to: string;
  data: string;
  value?: string;
  chain?: string;
  action?: string;
}

const CHAIN_RPC_KEYS: Record<string, keyof typeof config> = {
  ethereum: 'RPC_URL_ETHEREUM',
  eth: 'RPC_URL_ETHEREUM',
  mainnet: 'RPC_URL_ETHEREUM',
};

function resolveRpcUrl(chain: string | undefined): string | undefined {
  const key = CHAIN_RPC_KEYS[(chain ?? 'ethereum').toLowerCase()];
  return key ? (config[key] as string | undefined) : undefined;
}

function toHexValue(value: string | undefined): string {
  if (!value) return '0x0';
  if (value.startsWith('0x') || value.startsWith('0X')) return value;
  // accept decimal-string fallback
  try {
    return '0x' + BigInt(value).toString(16);
  } catch {
    throw new Error(`Invalid value (not hex or decimal): ${value.slice(0, 32)}`);
  }
}

function buildAction(payload: TxSimulationPayload): string {
  if (payload.action && payload.action.trim()) return payload.action.slice(0, 120);
  return `${payload.from.slice(0, 6)}…→${payload.to.slice(0, 6)}…`;
}

export interface TxSimulationSnapshot {
  action: string;
  gas_units: number | null;
  gas_cost_usd: number | null;
  gas_cost_native: string | null;
  expected_outcome: {
    token: string;
    amount: string;
    value_usd: number | null;
  } | null;
  slippage_bps: number | null;
  simulation_url: string | null;
  simulator: 'tenderly' | 'anvil_fork';
  checked_at: string;
}

// ── Tenderly simulation ───────────────────────────────────────────────────────

interface TenderlySimulationResponse {
  simulation?: {
    id?: string;
    gas_used?: number;
    status?: boolean;
  };
  transaction?: {
    gas_used?: number;
    gas?: number;
  };
}

async function simulateWithTenderly(
  payload: TxSimulationPayload,
  signal: AbortSignal,
): Promise<TxSimulationSnapshot> {
  const { TENDERLY_ACCOUNT, TENDERLY_PROJECT, TENDERLY_ACCESS_KEY } = config;
  if (!TENDERLY_ACCOUNT || !TENDERLY_PROJECT || !TENDERLY_ACCESS_KEY?.trim()) {
    throw new Error('Tenderly credentials missing or empty');
  }
  const url = `https://api.tenderly.co/api/v1/account/${TENDERLY_ACCOUNT}/project/${TENDERLY_PROJECT}/simulate`;

  const chainIdMap: Record<string, number> = {
    ethereum: 1, eth: 1, mainnet: 1,
    bsc: 56, polygon: 137, arbitrum: 42161,
    optimism: 10, base: 8453, avalanche: 43114,
  };
  const networkId = chainIdMap[(payload.chain ?? 'ethereum').toLowerCase()] ?? 1;

  const body = {
    network_id: String(networkId),
    from: payload.from,
    to: payload.to,
    input: payload.data,
    value: payload.value ?? '0',
    save: true,
    save_if_fails: true,
  };

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Access-Key': TENDERLY_ACCESS_KEY,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(`Tenderly request failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => '');
    throw new Error(`Tenderly API error: ${resp.status} - ${errBody || resp.statusText}`);
  }

  let data: TenderlySimulationResponse;
  try {
    data = (await resp.json()) as TenderlySimulationResponse;
  } catch (e) {
    throw new Error(`Tenderly returned non-JSON: ${e instanceof Error ? e.message : String(e)}`);
  }

  const gasUsed = data.simulation?.gas_used ?? data.transaction?.gas_used ?? null;
  const simId = data.simulation?.id ?? null;
  const simUrl = simId
    ? `https://dashboard.tenderly.co/${TENDERLY_ACCOUNT}/${TENDERLY_PROJECT}/simulator/${simId}`
    : null;

  return {
    action: buildAction(payload),
    gas_units: gasUsed,
    gas_cost_usd: null,
    gas_cost_native: gasUsed ? `${gasUsed} gas` : null,
    expected_outcome: null,
    slippage_bps: null,
    simulation_url: simUrl,
    simulator: 'tenderly',
    checked_at: new Date().toISOString(),
  };
}

// ── Anvil fork fallback ───────────────────────────────────────────────────────

async function simulateWithAnvilFork(
  payload: TxSimulationPayload,
  signal: AbortSignal,
): Promise<TxSimulationSnapshot> {
  const rpcUrl = resolveRpcUrl(payload.chain);
  if (!rpcUrl) {
    throw new Error(
      `No simulation backend for chain="${payload.chain ?? 'ethereum'}": Tenderly unset and no RPC_URL_* configured`,
    );
  }

  const ethCallBody = {
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_estimateGas',
    params: [{ from: payload.from, to: payload.to, data: payload.data, value: toHexValue(payload.value) }],
  };

  let resp: Response;
  try {
    resp = await fetch(rpcUrl, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ethCallBody),
    });
  } catch (e) {
    throw new Error(`RPC request failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!resp.ok) {
    throw new Error(`RPC error: ${resp.status}`);
  }

  let data: { result?: string; error?: { message?: string } };
  try {
    data = (await resp.json()) as { result?: string; error?: { message?: string } };
  } catch {
    throw new Error('RPC returned non-JSON');
  }

  if (data.error) {
    throw new Error(`RPC error: ${data.error.message ?? 'unknown'}`);
  }

  const gasUnits = data.result ? parseInt(data.result, 16) : null;

  return {
    action: buildAction(payload),
    gas_units: gasUnits,
    gas_cost_usd: null,
    gas_cost_native: gasUnits ? `${gasUnits} gas` : null,
    expected_outcome: null,
    slippage_bps: null,
    simulation_url: null,
    simulator: 'anvil_fork',
    checked_at: new Date().toISOString(),
  };
}

// ── Main export ──────────────────────────────────────────────────────────────

export async function simulateTransaction(
  payload: TxSimulationPayload,
  options: { signal?: AbortSignal } = {},
): Promise<TxSimulationSnapshot> {
  const signal = options.signal ?? AbortSignal.timeout(TX_SIM_TIMEOUT_MS);
  const hasTenderly =
    config.TENDERLY_ACCOUNT && config.TENDERLY_PROJECT && config.TENDERLY_ACCESS_KEY?.trim();

  if (hasTenderly) {
    try {
      return await simulateWithTenderly(payload, signal);
    } catch (e) {
      // Tenderly transient failure — fall through to anvil_fork RPC if configured
      console.warn(
        `[tx-simulator] Tenderly failed, falling back to RPC: ${e instanceof Error ? e.message : String(e)}`,
      );
      // signal may be aborted by Tenderly path; create a fresh signal for the fallback
      const fallbackSignal = options.signal ?? AbortSignal.timeout(TX_SIM_TIMEOUT_MS);
      return simulateWithAnvilFork(payload, fallbackSignal);
    }
  }
  return simulateWithAnvilFork(payload, signal);
}
