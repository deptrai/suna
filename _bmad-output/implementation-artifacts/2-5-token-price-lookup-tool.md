# Story 2.5: Token Price Lookup Tool

Status: backlog

Epic: 2 — Crypto Data Infrastructure
Created: 2026-05-14
Last Reviewed: 2026-05-14 (Winston — System Architect)
FRs: FR2, FR19
NFRs: NFR2, NFR4
ARs: AR1, AR2, AR6, AR8

**Dependency:** Story 2.4 phải hoàn thành trước (cần `getDefillamaUrl` helper và `DEFILLAMA_PRO_API_KEY` config var).

## Story

As a Epsilon agent xử lý crypto query,
I want gọi tool `price_lookup` để lấy giá realtime của bất kỳ token nào theo contract address,
so that agent có thể trả lời "giá USDC trên Ethereum hiện tại là bao nhiêu?" với data chính xác thay vì training data lỗi thời.

## Acceptance Criteria

1. **AC1 — JIT route `/v1/router/jit-sync/price`:**
   - `GET /v1/router/jit-sync/price?coins={chain}:{address},{chain}:{address},...`
   - Tối đa 100 tokens per request (URL length constraint).
   - Endpoint mapping (extend helper `getDefillamaUrl` từ Story 2.4 để support coins endpoint, hoặc add separate helper):

     | Mode | URL |
     |---|---|
     | Free (no proKey) | `https://coins.llama.fi/prices/current/{coins}` |
     | Pro (proKey set) | `https://pro-api.llama.fi/{KEY}/coins/prices/current/{coins}` |

   - In-memory cache TTL 5 phút (key = sorted coin list hash).
   - Response: `{ coins: { "ethereum:0x...": { price, symbol, timestamp, confidence, decimals } }, source: 'cache_fresh'|'live', fetched_at }`.

2. **AC2 — Billing:**
   - `checkCredits` trước, `deductToolCredits` sau khi success (queueMicrotask để không block response).
   - Tool cost: `getToolCost('price_lookup', 0)` — entry mới trong `getToolCost` config.

3. **AC3 — OpenCode tool `price_lookup.ts`:**
   - File: `core/epsilon-master/opencode/tools/price_lookup.ts`.
   - Args: `coins` (string, comma-separated `chain:address` format, required), `session_id` (optional).
   - Gọi `${EPSILON_API_URL}/v1/router/jit-sync/price?coins={coins}` với `Bearer ${EPSILON_TOKEN}`.
   - Timeout: `AbortSignal.timeout(2000)` (2s).
   - Returns formatted string: "ETH: $3,245.50 (conf 0.99) | USDC: $1.00 (conf 0.99) | ..."

4. **AC4 — Validation:**
   - Validate `chain:address` format trước khi gọi API. Regex: `/^[a-z0-9-]+:0x[a-f0-9]{40}$/i` cho EVM, hoặc `/^coingecko:[a-z0-9-]+$/i` cho CoinGecko ID.
   - EVM addresses lowercase-normalize.
   - Max 100 tokens per call — return error rõ ràng nếu vượt: `{ success: false, error: "Maximum 100 tokens per request" }`.
   - Reject empty `coins` param với 400.

5. **AC5 — TypeScript clean, không regression tests.**

## Tasks / Subtasks

- [ ] **Task 0: Extend getDefillamaUrl helper (AC1)**
  - [ ] 0.1 — Mở `apps/api/src/router/services/defillama.ts`.
  - [ ] 0.2 — Thêm endpoint key `'coin-prices'` vào `LlamaEndpoint` type.
  - [ ] 0.3 — Update `getDefillamaUrl(endpoint, proKey?)` để support `'coin-prices'`:
    ```typescript
    case 'coin-prices': {
      // Caller phải append /{coins} vào URL trả về
      if (proKey) return `https://pro-api.llama.fi/${proKey}/coins/prices/current`;
      return 'https://coins.llama.fi/prices/current';
    }
    ```
  - [ ] 0.4 — Hoặc thêm helper riêng `getCoinPricesUrl(proKey?: string): string` nếu signature không match.

- [ ] **Task 1: Price cache service (AC1)**
  - [ ] 1.1 — Tạo `apps/api/src/router/services/price-cache.ts`.
  - [ ] 1.2 — Pattern giống `apps/api/src/router/services/jit-cache.ts`: `Map<string, { data: PriceData; expiresAt: number }>` với TTL 300_000ms.
  - [ ] 1.3 — Cache key = sort(coins).join(',').toLowerCase() (deterministic).
  - [ ] 1.4 — Export `getCachedPrice(key)`, `setCachedPrice(key, data)`, `dedupedFetchPrices(key, fetcher)`.

- [ ] **Task 2: JIT route handler (AC1, AC2, AC4)**
  - [ ] 2.1 — Tạo `apps/api/src/router/routes/jit-sync-price.ts`.
  - [ ] 2.2 — `GET /v1/router/jit-sync/price` handler — parse `coins` query param.
  - [ ] 2.3 — Validate: max 100 tokens, format `chain:address` hoặc `coingecko:id`, lowercase-normalize EVM.
  - [ ] 2.4 — In-memory cache lookup trước.
  - [ ] 2.5 — `checkCredits` + try-catch fetch từ DeFiLlama coins API (timeout 2s).
  - [ ] 2.6 — `deductToolCredits` qua `queueMicrotask` (non-blocking).
  - [ ] 2.7 — Register route trong `apps/api/src/router/index.ts`: mount tại `/v1/router/jit-sync/price`.

- [ ] **Task 3: Tool cost config (AC2)**
  - [ ] 3.1 — Mở `apps/api/src/config.ts`, tìm `TOOL_COSTS` map.
  - [ ] 3.2 — Thêm entry `price_lookup: { base: <number> }` (xác nhận với product team về cost — placeholder 0 nếu chưa set).

- [ ] **Task 4: OpenCode tool (AC3, AC4)**
  - [ ] 4.1 — Tạo `core/epsilon-master/opencode/tools/price_lookup.ts`.
  - [ ] 4.2 — Follow pattern `core/epsilon-master/opencode/tools/jit_sync.ts` CHÍNH XÁC.
  - [ ] 4.3 — Args: `coins` (required), `session_id` (optional).
  - [ ] 4.4 — Validate format trước khi gọi API (cùng regex như AC4).
  - [ ] 4.5 — Format response: "ETH: $3,245.50 (conf 0.99) | USDC: $1.00 (conf 0.99) | ..."

- [ ] **Task 5: TypeScript check (AC5)**
  - [ ] 5.1 — `cd apps/api && npx tsc --noEmit` — không có lỗi mới.

## Dev Notes

### Pattern Reference
- Route: `apps/api/src/router/routes/jit-sync.ts` cho route handler structure (auth middleware, billing pattern).
- Cache: `apps/api/src/router/services/jit-cache.ts` cho cache + dedupe pattern.
- Tool: `core/epsilon-master/opencode/tools/jit_sync.ts` cho OpenCode tool structure.
- Helper: Story 2.4 đã add `getDefillamaUrl` — extend instead of duplicate.

### DeFiLlama Coins API
- Free: `https://coins.llama.fi/prices/current/{coins}` (no auth)
- Pro: `https://pro-api.llama.fi/{KEY}/coins/prices/current/{coins}`
- Format `coins`: `ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` (chain:address, comma-separated)
- Special: `coingecko:bitcoin`, `coingecko:ethereum` cho native tokens
- Response shape:
  ```json
  {
    "coins": {
      "ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": {
        "decimals": 6,
        "price": 1.0,
        "symbol": "USDC",
        "timestamp": 1747200000,
        "confidence": 0.99
      }
    }
  }
  ```

### Coin Format Validation
```typescript
const EVM_COIN = /^[a-z0-9-]+:0x[a-f0-9]{40}$/i;
const COINGECKO_COIN = /^coingecko:[a-z0-9-]+$/i;

function isValidCoin(coin: string): boolean {
  return EVM_COIN.test(coin) || COINGECKO_COIN.test(coin);
}

function normalizeCoin(coin: string): string {
  // EVM addresses lowercase, coingecko IDs as-is
  if (EVM_COIN.test(coin)) {
    const [chain, addr] = coin.split(':');
    return `${chain.toLowerCase()}:${addr.toLowerCase()}`;
  }
  return coin.toLowerCase();
}
```

### Tool Response Format
```
ETH: $3,245.50 (conf 0.99)
USDC: $1.00 (conf 0.99)
WBTC: $67,234.00 (conf 0.98)
```

### URL Length Constraint
- Average coin string ~50 chars (chain prefix + 0x address). 100 coins ~5,000 chars.
- DeFiLlama Coins API endpoint accepts up to ~8,000 chars in URL — 100 coins safe.
- Browser URL limit ~2,000 chars but đây là server-to-server, không phải browser.

## Dev Agent Record

### Debug Log
(empty)

### Completion Notes
(empty)

## File List

(empty — to be filled during implementation)

## Change Log

| Date | Change |
|------|--------|
| 2026-05-14 | Story created |
| 2026-05-14 | Architect review (Winston): added Pro vs Free endpoint mapping, extend `getDefillamaUrl` from Story 2.4, marked dependency on 2.4 explicit |
