# Story 2.0.1: Shared Multi-Provider JSON-RPC Client với Circuit Breaker & Admin Alerts

Status: ready-for-dev

Epic: 2 — Crypto Data Infrastructure
Created: 2026-05-17
FRs: FR2, FR19, FR20
NFRs: NFR6, NFR7
ARs: AR1, AR2, AR6, AR8

**Vị trí trong Epic:** Infrastructure story — tạo trước để các story on-chain (2.2.1, 2.1.2, future stories) dùng chung. Không có dependency story nào phải hoàn thành trước.

**Tại sao cần thiết:** Hiện tại có 3 bộ config RPC URL riêng biệt (`ENTITY_WALLET_RPC_URL_*`, `ONCHAIN_FACT_CHECK_RPC_URL_*`, `RPC_URL_ETHEREUM`) và hàm `rpcCall()` bị duplicate ở mỗi service. Không có provider nào hỗ trợ multi-URL failover — nếu QuickNode down, toàn bộ feature bị ảnh hưởng mà không có fallback. Story này tạo shared client với circuit breaker per-provider, Telegram admin alert khi provider bị down, và health endpoint để operator monitor.

## Story

As a platform operator,
I want một shared JSON-RPC client module hỗ trợ danh sách provider per-chain (QuickNode, Alchemy, Infura, hoặc bất kỳ endpoint JSON-RPC nào),
so that tất cả features (fact-check, entity-wallet, tx-simulator) có automatic failover sang provider tiếp theo khi provider chính bị lỗi, không cần duplicate code, và admin nhận Telegram alert ngay khi provider circuit mở.

## Acceptance Criteria

### AC1 — Config Vars (additive — KHÔNG xóa vars cũ)

File: `apps/api/src/config.ts`

Thêm vào Zod schema (dùng `optStr` như các vars hiện có):

```typescript
// Shared multi-provider RPC — comma-separated list of URLs, any JSON-RPC endpoint
RPC_PROVIDERS_ETHEREUM:  optStr,
RPC_PROVIDERS_BASE:      optStr,
RPC_PROVIDERS_POLYGON:   optStr,
RPC_PROVIDERS_ARBITRUM:  optStr,
RPC_PROVIDERS_BSC:       optStr,

// Telegram admin alerts (dùng chung cho toàn bộ platform, không chỉ RPC)
TELEGRAM_BOT_TOKEN:      optStr,
TELEGRAM_ADMIN_CHAT_ID:  optStr,   // comma-separated nếu nhiều chat: "123456,-987654"
```

Thêm vào export object tương ứng:
```typescript
RPC_PROVIDERS_ETHEREUM: env.RPC_PROVIDERS_ETHEREUM,
RPC_PROVIDERS_BASE: env.RPC_PROVIDERS_BASE,
RPC_PROVIDERS_POLYGON: env.RPC_PROVIDERS_POLYGON,
RPC_PROVIDERS_ARBITRUM: env.RPC_PROVIDERS_ARBITRUM,
RPC_PROVIDERS_BSC: env.RPC_PROVIDERS_BSC,
TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
TELEGRAM_ADMIN_CHAT_ID: env.TELEGRAM_ADMIN_CHAT_ID,
```

**QUAN TRỌNG:** Giữ nguyên tất cả vars cũ — `ENTITY_WALLET_RPC_URL_*`, `ONCHAIN_FACT_CHECK_RPC_URL_*`, `RPC_URL_ETHEREUM`. Chúng vẫn hoạt động như backward-compat fallback.

---

### AC2 — Telegram Notify Service

**File mới:** `apps/api/src/router/services/telegram-notify.ts`

```typescript
// Exported public API
export async function sendAdminAlert(message: string): Promise<void>
export function isAdminAlertConfigured(): boolean
```

**Behavior chi tiết:**
- `isAdminAlertConfigured()`: trả `true` khi cả `TELEGRAM_BOT_TOKEN` và `TELEGRAM_ADMIN_CHAT_ID` đều có giá trị
- `sendAdminAlert()`: nếu không configured → return ngay, không throw, không log warn
- Parse `TELEGRAM_ADMIN_CHAT_ID` bằng `.split(',').map(s => s.trim()).filter(Boolean)`
- Gửi đồng thời tới tất cả chat IDs qua `Promise.allSettled()` (không block nếu 1 chat fail)
- HTTP call: `POST https://api.telegram.org/bot${TOKEN}/sendMessage` với body:
  ```json
  { "chat_id": "...", "text": "...", "parse_mode": "HTML" }
  ```
- Timeout: `AbortSignal.timeout(5000)` — không block caller
- Lỗi gửi (HTTP error hoặc network) → log `[telegram-notify] failed to send alert: ${err.message}` ở `warn` level, không throw
- Caller dùng `void sendAdminAlert(msg)` — luôn fire-and-forget

**Message format (HTML):**
```
⚠️ <b>[Chainlens Alert]</b>
<b>Type:</b> RPC Provider Down
<b>Chain:</b> ethereum
<b>Provider:</b> https://purple-spring-valley.quic...
<b>Error:</b> HTTP 503
<b>Circuit:</b> OPEN (5 failures)
<i>2026-05-17 14:32:01 UTC</i>
```

**Utility helper (internal, không export):**
```typescript
function maskProviderUrl(url: string): string
// Chỉ giữ "https://hostname/..." (scheme + host + 3 chars path)
// Ví dụ: "https://purple-spring-valley.quiknode.pro/8d15adcb..." → "https://purple-spring-valley.quic..."
// Dùng URL.parse(url).hostname để extract host an toàn
```

---

### AC3 — Shared RPC Client

**File mới:** `apps/api/src/router/services/rpc-client.ts`

#### 3a — Types & Provider Resolution

```typescript
export type RpcChain = 'ethereum' | 'base' | 'polygon' | 'arbitrum' | 'bsc';

// Returns ordered list of provider URLs for a chain.
// Returns [] if nothing configured.
export function getProviderUrls(chain: RpcChain): string[]
```

**Priority resolution per chain** (first non-empty set wins):
1. `config.RPC_PROVIDERS_{CHAIN}` → parse comma-separated, trim, filter empty strings
2. Legacy fallback — nếu `RPC_PROVIDERS_*` không set:
   - `ethereum`: `ONCHAIN_FACT_CHECK_RPC_URL_ETHEREUM` → `ENTITY_WALLET_RPC_URL_ETHEREUM` → `RPC_URL_ETHEREUM`
   - `base`: `ONCHAIN_FACT_CHECK_RPC_URL_BASE` → `ENTITY_WALLET_RPC_URL_BASE`
   - `polygon`: `ONCHAIN_FACT_CHECK_RPC_URL_POLYGON` → `ENTITY_WALLET_RPC_URL_POLYGON`
   - `arbitrum`: `ONCHAIN_FACT_CHECK_RPC_URL_ARBITRUM` → `ENTITY_WALLET_RPC_URL_ARBITRUM`
   - `bsc`: `ENTITY_WALLET_RPC_URL_BSC`
3. `[]` nếu không có gì

Với legacy fallback, filter empty/undefined: `[url1, url2, url3].filter(Boolean)` — mỗi URL là một provider.

#### 3b — Circuit Breaker

Constants (hardcoded trong module, không env):
```typescript
const CIRCUIT_FAILURE_THRESHOLD = 5;   // consecutive failures để OPEN circuit
const CIRCUIT_COOLDOWN_MS = 30_000;    // 30s trước khi thử lại (HALF_OPEN)
```

State per provider URL (module-level `Map<string, CircuitState>`):
```typescript
interface CircuitState {
  status: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  consecutiveFailures: number;
  openedAt: number | null;
  lastAttemptAt: number;
}
```

Transitions:
- **CLOSED**: calls bình thường. `consecutiveFailures++` mỗi lần lỗi; reset về 0 khi success.
- `CLOSED` + `consecutiveFailures >= THRESHOLD` → `OPEN`, set `openedAt = Date.now()`, gọi `void sendAdminAlert(buildOpenMessage(chain, url, lastError))`
- **OPEN** + request đến: kiểm tra `Date.now() - openedAt >= COOLDOWN_MS`:
  - Cooldown chưa hết → throw `CircuitOpenError(url)` ngay, KHÔNG gọi fetch
  - Cooldown hết → chuyển sang `HALF_OPEN`, để request đi qua (probe)
- **HALF_OPEN** + probe success → `CLOSED`, reset `consecutiveFailures = 0`, log `[rpc-client] circuit CLOSED for ${maskUrl}`
- **HALF_OPEN** + probe failure → `OPEN`, reset `openedAt = Date.now()`, gọi `void sendAdminAlert(...)` lại

**Export cho health endpoint:**
```typescript
export function getCircuitStates(): Map<string, CircuitState>
```

#### 3c — callRpc

```typescript
export interface RpcCallOptions {
  timeoutMs?: number;  // default: 4000
}

export async function callRpc(
  chain: RpcChain,
  method: string,
  params: unknown[],
  opts?: RpcCallOptions,
): Promise<unknown>
```

Algorithm:
```
urls = getProviderUrls(chain)
if urls.length === 0: throw AllProvidersFailedError(chain, [])

errors = []
for url of urls:
  state = getOrInitCircuit(url)
  
  if state.status === 'OPEN':
    if Date.now() - state.openedAt >= COOLDOWN_MS:
      state.status = 'HALF_OPEN'
    else:
      errors.push({ url, error: new CircuitOpenError(url) })
      continue
  
  try:
    result = await fetchRpc(url, method, params, opts?.timeoutMs ?? 4000)
    onSuccess(url)  // reset circuit
    return result
  catch err:
    onFailure(url, chain, err)  // update circuit, maybe fire alert
    errors.push({ url, error: err })
    log.warn('[rpc-client] provider ${maskUrl} failed, trying next', { chain, method, err })

throw AllProvidersFailedError(chain, errors)
```

`fetchRpc(url, method, params, timeoutMs)` — internal:
- POST với `{ jsonrpc: '2.0', id: 1, method, params }`
- `AbortSignal.timeout(timeoutMs)`
- HTTP non-2xx → throw `ProviderError(status, url)`
- JSON parse fail → throw Error
- `data.error` present → throw `RpcError(data.error.code, data.error.message, url)`
- Return `data.result`

#### 3d — Error Types (exported)

```typescript
export class CircuitOpenError extends Error {
  constructor(public readonly providerUrl: string) {
    super(`Circuit open for ${providerUrl}`);
  }
}

export class ProviderError extends Error {
  constructor(public readonly status: number, public readonly providerUrl: string) {
    super(`HTTP ${status} from ${providerUrl}`);
  }
}

export class RpcError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly providerUrl: string,
  ) {
    super(`RPC error ${code}: ${message}`);
  }
}

export class AllProvidersFailedError extends Error {
  constructor(
    public readonly chain: string,
    public readonly errors: Array<{ url: string; error: Error }>,
  ) {
    super(`All RPC providers failed for chain: ${chain}`);
  }
}
```

---

### AC4 — Health Check Endpoint

**File mới:** `apps/api/src/router/routes/rpc-health.ts`

**Route:** `GET /v1/router/rpc/health`
**Auth:** `apiKeyAuth` middleware (như các `/v1/router/*` routes hiện có)

Response 200:
```json
{
  "timestamp": "2026-05-17T14:32:01.000Z",
  "chains": {
    "ethereum": {
      "configured": true,
      "providerCount": 3,
      "providers": [
        {
          "index": 0,
          "url": "https://purple-spring-valley.quick...",
          "status": "CLOSED",
          "consecutiveFailures": 0,
          "openedAt": null,
          "lastAttemptAt": "2026-05-17T14:31:58.000Z"
        },
        {
          "index": 1,
          "url": "https://eth-mainnet.alchemyapi...",
          "status": "OPEN",
          "consecutiveFailures": 5,
          "openedAt": "2026-05-17T14:30:00.000Z",
          "lastAttemptAt": "2026-05-17T14:30:00.000Z"
        }
      ]
    },
    "base":     { "configured": false, "providerCount": 0, "providers": [] },
    "polygon":  { "configured": false, "providerCount": 0, "providers": [] },
    "arbitrum": { "configured": false, "providerCount": 0, "providers": [] },
    "bsc":      { "configured": false, "providerCount": 0, "providers": [] }
  }
}
```

URL masking: dùng cùng `maskProviderUrl()` từ telegram-notify (hoặc re-implement inline — không import cross-service).

**Mount trong `apps/api/src/router/index.ts`:**
```typescript
import { rpcHealthRoute } from './routes/rpc-health';
// Thêm vào khu vực apiKeyAuth routes:
router.use('/rpc/*', apiKeyAuth);
router.route('/rpc', rpcHealthRoute);
```

---

### AC5 — Migration: `entity-wallet-rpc.ts`

Thay internal `rpcCall()` function bằng `callRpc` từ `rpc-client.ts`. Không thay đổi exported API.

**Trước:**
```typescript
async function rpcCall(rpcUrl: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(rpcUrl, { ... });
  ...
}
export async function verifyErc20Balance(chain, tokenAddress, walletAddress) {
  const rpcUrl = getRpcUrlForChain(chain);
  if (!rpcUrl) return null;
  const result = await rpcCall(rpcUrl, 'eth_call', [...]);
  ...
}
```

**Sau:**
```typescript
import { callRpc, getProviderUrls, AllProvidersFailedError, type RpcChain } from './rpc-client';

// Giữ export getRpcUrlForChain để không break callers (entity-wallet-worker dùng)
export function getRpcUrlForChain(chain: string): string | null {
  return getProviderUrls(chain as RpcChain)[0] ?? null;
}

export async function verifyErc20Balance(chain, tokenAddress, walletAddress) {
  if (getProviderUrls(chain as RpcChain).length === 0) return null;
  try {
    const result = await callRpc(chain as RpcChain, 'eth_call', [...]);
    ...
  } catch (err) {
    if (err instanceof AllProvidersFailedError) return null;
    throw err;
  }
}

export async function getLatestBlockNumber(chain) {
  if (getProviderUrls(chain as RpcChain).length === 0) return null;
  try {
    const result = await callRpc(chain as RpcChain, 'eth_blockNumber', []);
    return typeof result === 'string' ? parseInt(result, 16) : null;
  } catch (err) {
    if (err instanceof AllProvidersFailedError) return null;
    throw err;
  }
}
```

Xóa hoàn toàn local `rpcCall()` function và `RPC_TIMEOUT_MS` constant.

---

### AC6 — Migration: `onchain-fact-check.ts`

Chỉ migrate phần **QuickNode JSON-RPC calls** trong hàm `getQuickNodeMetrics()`. Etherscan/Blockscout REST fallback logic giữ nguyên.

Tìm và thay các đoạn `fetch(rpcUrl, { body: JSON.stringify({ method: 'eth_blockNumber'|'eth_getLogs'|'eth_call', ... }) })`:

```typescript
// Thêm import
import { callRpc, AllProvidersFailedError, type RpcChain } from './rpc-client';

// Trong getQuickNodeMetrics(chain, tokenAddress, wallets):
// TRƯỚC: const blockRes = await fetch(rpcUrl, { body: JSON.stringify({method: 'eth_blockNumber'}) })
// SAU:
const currentBlock = await callRpc(chain as RpcChain, 'eth_blockNumber', [], { timeoutMs: 4000 });

// TRƯỚC: eth_getLogs fetch
const outLogs = await callRpc(chain as RpcChain, 'eth_getLogs', [logsFilter]);

// TRƯỚC: eth_call fetch  
const balanceHex = await callRpc(chain as RpcChain, 'eth_call', [callObj, 'latest']);
```

Bắt `AllProvidersFailedError` ở level `getQuickNodeMetrics()` → throw để outer code tiếp tục sang Etherscan fallback (behavior hiện tại đã có).

**KHÔNG thay đổi:** Etherscan `getEtherscanMetrics()`, Blockscout `getBlockscoutMetrics()`, provider fallback logic, `source` tracking, `ETHERSCAN_BASE_URLS`, `getEtherscanApiKey()`.

---

### AC7 — Migration: `tx-simulator.ts`

Thay `simulateWithAnvilFork()` function để dùng `callRpc`:

```typescript
import { callRpc, AllProvidersFailedError } from './rpc-client';

async function simulateWithAnvilFork(payload, signal) {
  // TRƯỚC: const rpcUrl = resolveRpcUrl(payload.chain); if (!rpcUrl) throw...
  // SAU:
  let gasResult: unknown;
  try {
    gasResult = await callRpc('ethereum', 'eth_estimateGas', [
      { from: payload.from, to: payload.to, data: payload.data, value: toHexValue(payload.value) }
    ], { timeoutMs: TX_SIM_TIMEOUT_MS });
  } catch (err) {
    if (err instanceof AllProvidersFailedError) {
      throw new Error(
        `No simulation backend for chain="${payload.chain ?? 'ethereum'}": no RPC providers configured or all failed`
      );
    }
    throw err;
  }
  const gasUnits = typeof gasResult === 'string' ? parseInt(gasResult, 16) : null;
  ...
}
```

Xóa `resolveRpcUrl()` và `CHAIN_RPC_KEYS` constant sau khi migrate.

**Lưu ý:** `simulateWithAnvilFork` hiện chỉ hỗ trợ Ethereum. Sau migrate, nếu `RPC_PROVIDERS_ETHEREUM` được set với nhiều URLs → tự động có failover. Các chain khác không được simulate — không thay đổi behavior.

---

### AC8 — Tests

**File mới:** `apps/api/src/__tests__/unit/rpc-client.test.ts`

Pattern: `bun:test`, `mock.module()` trước import, mock `../../config` và `globalThis.fetch`.

| Test | Priority | Mô tả |
|------|----------|--------|
| `getProviderUrls`: list từ `RPC_PROVIDERS_ETHEREUM` (parse CSV) | P0 | |
| `getProviderUrls`: fallback legacy `ENTITY_WALLET_RPC_URL_ETHEREUM` khi không có `RPC_PROVIDERS_*` | P0 | |
| `getProviderUrls`: `[]` khi không có config nào | P0 | |
| `callRpc`: provider 1 success → trả result ngay | P0 | |
| `callRpc`: provider 1 HTTP 500 → failover, provider 2 success | P0 | |
| `callRpc`: tất cả providers fail → throw `AllProvidersFailedError` | P0 | |
| Circuit: 5 consecutive failures → circuit OPEN | P0 | |
| Circuit: OPEN → skip provider ngay, không gọi fetch | P0 | |
| Circuit: OPEN → sau cooldown → HALF_OPEN → probe success → CLOSED | P1 | |
| Circuit: HALF_OPEN probe failure → OPEN lại | P1 | |
| `callRpc`: JSON-RPC `{ error: {...} }` response → failover | P1 | |
| `callRpc`: `AllProvidersFailedError` khi chain không có config | P1 | |
| `getProviderUrls`: backward compat `RPC_URL_ETHEREUM` (legacy ethereum) | P1 | |

**File mới:** `apps/api/src/__tests__/unit/telegram-notify.test.ts`

| Test | Priority | Mô tả |
|------|----------|--------|
| Không config → `sendAdminAlert` return ngay, không gọi fetch | P0 | |
| Có config → gọi Telegram Bot API với đúng URL và payload | P0 | |
| `isAdminAlertConfigured()`: false khi thiếu token | P0 | |
| Telegram trả 500 → không throw, chỉ log warn | P1 | |
| Multiple chat IDs → gửi đến tất cả | P1 | |

Chạy verify: `cd apps/api && bun test src/__tests__/unit/rpc-client.test.ts src/__tests__/unit/telegram-notify.test.ts`

---

### AC9 — TypeScript Clean

```bash
cd apps/api && npx tsc --noEmit
```

Không có lỗi TypeScript mới từ story này.

---

## Dev Notes — Critical Context

### Codebase Patterns Hiện Tại (BẮT BUỘC TUÂN THEO)

**Config pattern** (`apps/api/src/config.ts`):
- `optStr` = `z.string().optional()` — dùng cho tất cả optional string config
- Schema Zod ở đầu file, export object ở cuối
- Kiểm tra `env.VARIABLE_NAME` trong export section — copy pattern hiện có chính xác

**Service file pattern** (`apps/api/src/router/services/*.ts`):
- Import `config` từ `../../config` (relative path)
- Import `logger` từ `../../lib/logger`
- Không dùng `process.env` trực tiếp — chỉ dùng `config.*`
- Không dùng Node.js APIs (`fs`, `path`, `crypto`) — Bun runtime

**Router index mount** (`apps/api/src/router/index.ts`):
- Pattern: `router.use('/rpc/*', apiKeyAuth)` rồi `router.route('/rpc', rpcHealthRoute)`
- Khu vực mount: thêm vào sau các routes tương tự (xem các `router.use('/jit-sync/*', apiKeyAuth)` etc.)

**Test pattern** (`apps/api/src/__tests__/unit/*.test.ts`):
- `mock.module()` PHẢI đứng TRƯỚC `import` của module cần test (Bun module mock hoisting)
- Mock `../../config` bằng object với các keys cần thiết
- Mock `globalThis.fetch` với function trả `Response` object
- Dùng `enqueueFetch(responses[])` pattern cho sequential mocks (xem `onchain-fact-check-provider.test.ts`)

### Files Bị Ảnh Hưởng — Hiện Trạng

**`entity-wallet-rpc.ts`** — hiện có:
- `getRpcUrlForChain(chain)`: switch case đọc `config.ENTITY_WALLET_RPC_URL_*`
- `rpcCall(rpcUrl, method, params)`: fetch + parse, 4s timeout
- `verifyErc20Balance(chain, tokenAddress, walletAddress)`: gọi `eth_call` với `balanceOf` selector
- `getLatestBlockNumber(chain)`: gọi `eth_blockNumber`
- **Callers:** `entity-wallet-worker.ts` gọi `verifyErc20Balance` và `getLatestBlockNumber`; `getRpcUrlForChain` cũng được gọi

**`onchain-fact-check.ts`** — hiện có:
- `getQuickNodeMetrics()`: 4 sequential `fetch()` calls (blockNumber, getLogs×2, eth_call)
- Etherscan fallback: `getEtherscanMetrics()` → REST API call (KHÔNG migrate)
- Blockscout fallback: `getBlockscoutMetrics()` → REST API call (KHÔNG migrate)
- Provider failover logic: QuickNode → Etherscan → Blockscout (outer catch blocks)
- `source` var tracking: `'quicknode' | 'etherscan' | 'blockscout' | 'mixed'`
- Đã có fix: `ETHERSCAN_BASE_URLS` (static) + `getEtherscanApiKey(chain)` (dynamic)
- Đã có fix: `source` initialized từ `config.ONCHAIN_FACT_CHECK_PROVIDER`

**`tx-simulator.ts`** — hiện có:
- `simulateWithTenderly()`: Tenderly API — KHÔNG migrate
- `simulateWithAnvilFork()`: JSON-RPC `eth_estimateGas` qua `RPC_URL_ETHEREUM` — MIGRATE phần này
- `resolveRpcUrl()` + `CHAIN_RPC_KEYS` — XÓA sau migrate
- `TX_SIM_TIMEOUT_MS = 8000` — giữ lại, truyền vào `callRpc(opts.timeoutMs = 8000)`

### Thứ tự Implementation

1. `config.ts` — thêm vars
2. `telegram-notify.ts` — tạo mới, test
3. `rpc-client.ts` — tạo mới, test
4. `entity-wallet-rpc.ts` — migrate
5. `onchain-fact-check.ts` — migrate QuickNode calls
6. `tx-simulator.ts` — migrate
7. `rpc-health.ts` + mount trong `router/index.ts`
8. `tsc --noEmit` verify

### Edge Cases Quan Trọng

- `RPC_PROVIDERS_ETHEREUM = ""` (empty string) → `getProviderUrls` phải trả `[]`, không phải `[""]`
- Circuit state là module singleton — persist suốt process lifetime. Test cần reset state giữa các test cases (export `resetCircuitState()` chỉ cho test, hoặc re-import module)
- `sendAdminAlert` phải là fire-and-forget — caller dùng `void sendAdminAlert(...)`, không `await`
- `callRpc` trong `onchain-fact-check.ts`: outer catch của `getQuickNodeMetrics` cần bắt `AllProvidersFailedError` để fallback sang Etherscan — đây là critical path, không được để lọt lên level cao hơn
- `AbortSignal.timeout()` trong `fetchRpc`: signal từ tx-simulator (`TX_SIM_TIMEOUT_MS = 8000`) phải được forward qua `opts.timeoutMs`, không dùng hardcoded 4000ms cho tx simulation

---

## Files Summary

| File | Action | Notes |
|------|--------|-------|
| `apps/api/src/config.ts` | UPDATE | Thêm 7 vars mới |
| `apps/api/src/router/services/telegram-notify.ts` | CREATE | Fire-and-forget Telegram alerts |
| `apps/api/src/router/services/rpc-client.ts` | CREATE | Core shared client + circuit breaker |
| `apps/api/src/router/routes/rpc-health.ts` | CREATE | Health check endpoint |
| `apps/api/src/router/index.ts` | UPDATE | Mount `/rpc/health` route |
| `apps/api/src/router/services/entity-wallet-rpc.ts` | UPDATE | Migrate to rpc-client |
| `apps/api/src/router/services/onchain-fact-check.ts` | UPDATE | Migrate QuickNode JSON-RPC calls only |
| `apps/api/src/router/services/tx-simulator.ts` | UPDATE | Migrate eth_estimateGas call |
| `apps/api/src/__tests__/unit/rpc-client.test.ts` | CREATE | Circuit breaker + failover tests |
| `apps/api/src/__tests__/unit/telegram-notify.test.ts` | CREATE | Alert service tests |
