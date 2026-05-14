# Story 2.6: Yields APY Lookup Tool

Status: backlog

Epic: 2 — Crypto Data Infrastructure
Created: 2026-05-14
Last Reviewed: 2026-05-14 (Winston — System Architect)
FRs: FR2, FR19
NFRs: NFR2, NFR4
ARs: AR1, AR2, AR6, AR8

## Story

As a Epsilon agent tư vấn DeFi yield farming,
I want gọi tool `yields_lookup` để query APY pools theo protocol/chain/symbol từ data đã được pre-indexed,
so that agent có thể trả lời "pool nào trên Arbitrum đang có APY cao nhất?" trong < 500ms.

**Dependency:** Story 2.4 phải hoàn thành trước (cần `defillama_pools` table + 4 indexes: `idx_defillama_pools_project`, `idx_defillama_pools_chain`, `idx_defillama_pools_apy`, `idx_defillama_pools_tvl`).

## Acceptance Criteria

1. **AC1 — JIT route `/v1/router/jit-sync/yields`:**
   - `GET /v1/router/jit-sync/yields?protocol={slug}&chain={chain}&min_tvl={usd}&limit={n}&stablecoin_only={true|false}`.
   - Tất cả params optional — không có params → trả về top 20 pools theo APY (với min_tvl default 100,000 USD để filter noise).
   - Query từ `defillama_pools` table (populated bởi Story 2.4 worker).
   - Filter: `WHERE tvl_usd >= min_tvl AND (project = ? hoặc chain = ?) AND (stablecoin = ? optional)`.
   - Sort: `ORDER BY apy DESC LIMIT limit` (max 50, default 10).
   - Response: `{ pools: [...], count, query_params, source: 'db_cache', fetched_at }`.
   - **Performance target**: P95 < 500ms — đạt được nhờ indexes từ Story 2.4 (`idx_defillama_pools_apy`, `idx_defillama_pools_project`, `idx_defillama_pools_chain`, `idx_defillama_pools_tvl`).

2. **AC2 — Freshness check:**
   - Query `MAX(updated_at) FROM defillama_pools` ở đầu request.
   - Nếu `defillama_pools` empty hoặc `updated_at` > `2 * DEFILLAMA_SYNC_INTERVAL_MS` (2 giờ default) → trả về `{ source: 'no_data', error: 'Pool data stale or unavailable' }` với HTTP 200.
   - **Không** fallback realtime fetch (yields.llama.fi `/pools` trả 5-15MB → quá lớn cho request handler synchronous).

3. **AC3 — Billing:**
   - `checkCredits` trước, `deductToolCredits` sau success qua `queueMicrotask`.
   - Tool cost: `getToolCost('yields_lookup', 0)`.

4. **AC4 — OpenCode tool `yields_lookup.ts`:**
   - File: `core/epsilon-master/opencode/tools/yields_lookup.ts`.
   - Args: `protocol` (optional), `chain` (optional), `min_tvl_usd` (optional, default 100000), `limit` (optional, default 10), `stablecoin_only` (optional boolean).
   - Gọi `${EPSILON_API_URL}/v1/router/jit-sync/yields` với `Bearer ${EPSILON_TOKEN}`.
   - Timeout: `AbortSignal.timeout(2000)`.
   - Returns formatted markdown table:
     ```
     | Pool | APY | TVL | Chain | Risk |
     |------|-----|-----|-------|------|
     | USDC-USDT (Curve) | 5.23% | $45.2M | Ethereum | low |
     | ETH-stETH (Lido) | 3.80% | $28.1B | Ethereum | none |
     ```

5. **AC5 — TypeScript clean, không regression tests.**

## Tasks / Subtasks

- [ ] **Task 0: JIT route handler (AC1, AC2, AC3)**
  - [ ] 0.1 — Tạo `apps/api/src/router/routes/jit-sync-yields.ts`.
  - [ ] 0.2 — `GET /v1/router/jit-sync/yields` — parse query params (Zod schema validation).
  - [ ] 0.3 — Drizzle query với dynamic WHERE conditions (xem Dev Notes).
  - [ ] 0.4 — Freshness check: `SELECT MAX(updated_at) FROM defillama_pools` — short-circuit nếu stale.
  - [ ] 0.5 — `checkCredits` + `deductToolCredits` billing pattern.
  - [ ] 0.6 — Register route trong `apps/api/src/router/index.ts`: mount tại `/v1/router/jit-sync/yields`.
  - [ ] 0.7 — Set `Cache-Control: public, max-age=60` header (worker refresh 1h, OK cho 1 phút HTTP cache).

- [ ] **Task 1: Tool cost config (AC3)**
  - [ ] 1.1 — Thêm entry `yields_lookup` vào TOOL_COSTS map trong `apps/api/src/config.ts`.

- [ ] **Task 2: OpenCode tool (AC4)**
  - [ ] 2.1 — Tạo `core/epsilon-master/opencode/tools/yields_lookup.ts`.
  - [ ] 2.2 — Follow pattern của `jit_sync.ts`.
  - [ ] 2.3 — Args: `protocol`, `chain`, `min_tvl_usd`, `limit`, `stablecoin_only`.
  - [ ] 2.4 — Format response thành markdown table với 5 columns.

- [ ] **Task 3: TypeScript check (AC5)**
  - [ ] 3.1 — `cd apps/api && npx tsc --noEmit` — không có lỗi mới.
  - [ ] 3.2 — Test query performance: `EXPLAIN ANALYZE SELECT * FROM epsilon.defillama_pools WHERE chain = 'arbitrum' AND tvl_usd > 100000 ORDER BY apy DESC LIMIT 10` — verify uses indexes (Index Scan, not Seq Scan).

## Dev Notes

### Pattern Reference
- Route: `apps/api/src/router/routes/jit-sync.ts` cho structure.
- Tool: `core/epsilon-master/opencode/tools/jit_sync.ts` cho OpenCode tool.

### Drizzle Dynamic Query
```typescript
import { and, gte, eq, desc, sql } from 'drizzle-orm';
import { defillamaPools } from '@epsilon/db';

const conditions = [];
if (params.protocol) conditions.push(eq(defillamaPools.project, params.protocol));
if (params.chain) conditions.push(eq(defillamaPools.chain, params.chain));
if (params.min_tvl_usd) conditions.push(gte(defillamaPools.tvlUsd, String(params.min_tvl_usd)));
if (params.stablecoin_only === true) conditions.push(eq(defillamaPools.stablecoin, true));

const pools = await db
  .select()
  .from(defillamaPools)
  .where(conditions.length > 0 ? and(...conditions) : undefined)
  .orderBy(desc(defillamaPools.apy))
  .limit(Math.min(params.limit ?? 10, 50));
```

### Index Usage Verification
Postgres planner sẽ chọn index theo selectivity. Ưu tiên:
- `chain` filter highly selective → `idx_defillama_pools_chain`
- `project` filter highly selective → `idx_defillama_pools_project`
- Without filters → `idx_defillama_pools_apy DESC` cho top-N query
- `tvl_usd >= min_tvl` post-filter sau index scan

Test plan:
```sql
EXPLAIN ANALYZE
SELECT * FROM epsilon.defillama_pools
WHERE chain = 'arbitrum' AND tvl_usd > 100000
ORDER BY apy DESC LIMIT 10;
-- Expect: Index Scan on idx_defillama_pools_chain, then sort
```

### Tool Response Format
```
| Pool | APY | TVL | Chain | Risk |
|------|-----|-----|-------|------|
| USDC-USDT (Curve) | 5.23% | $45.2M | Ethereum | low |
| ETH-stETH (Lido) | 3.80% | $28.1B | Ethereum | none |
| WETH-USDC (Uniswap V3) | 12.50% | $8.4M | Arbitrum | high |
```

Risk column = `il_risk` value từ DeFiLlama (none/low/medium/high).

### Why No Realtime Fallback (AC2)
- yields.llama.fi `/pools` trả 5-15MB JSON ~16,000 pools — không phù hợp synchronous request handler.
- Worker (Story 2.4) đã refresh hàng giờ → 2-hour staleness threshold đủ cho yield farming use case (APY không thay đổi mỗi phút).
- Nếu data stale, agent nhận `source: 'no_data'` và fallback gracefully (e.g., suggest user check defillama.com directly).

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
| 2026-05-14 | Architect review (Winston): clarified dependency on Story 2.4 indexes, removed realtime fallback (oversized payload), added performance target P95 < 500ms, added stablecoin_only filter |
