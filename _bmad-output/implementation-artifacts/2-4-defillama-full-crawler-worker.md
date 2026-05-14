# Story 2.4: DeFiLlama Full Crawler Worker

Status: ready-for-dev

Epic: 2 — Crypto Data Infrastructure
Created: 2026-05-14
Last Reviewed: 2026-05-14 (Winston — System Architect)
FRs: FR2
NFRs: NFR4, NFR5
ARs: AR1, AR2, AR3, AR8

## Story

As a platform operator,
I want một BullMQ worker crawl toàn bộ 5 data categories từ DeFiLlama (TVL protocols, Yield pools, DEX volumes, Fees/Revenue, Stablecoins) mỗi giờ,
so that agent có đầy đủ dữ liệu DeFi pre-indexed trong DB để serve nhanh mà không cần gọi external API realtime.

## Acceptance Criteria

1. **AC1 — Config vars (dùng helpers sẵn có trong `config.ts`):**
   - `DEFILLAMA_PRO_API_KEY: optStr` — optional. Khi có key, worker dùng Pro endpoints; khi không, fallback Free endpoints.
   - `DEFILLAMA_WORKER_ENABLED: optBoolFalse` — guard giống `CRYPTO_WORKER_ENABLED`. Default false.
   - `DEFILLAMA_SYNC_INTERVAL_MS: optInt(3_600_000)` — default 1 giờ.
   - **PHẢI dùng `optStr`/`optBoolFalse`/`optInt` helpers — KHÔNG viết zod transform thủ công** (consistency với pattern repo).

2. **AC2 — DB schema (5 tables mới, additive AR3, có indexes cho query patterns):**

   **`epsilon.defillama_protocols`** (~7,000 rows):
   - `slug varchar(100)` PK, `name varchar(255)`, `category varchar(100)`, `chains jsonb`, `tvl_usd numeric(20,4)`, `tvl_change_1d_pct numeric(10,4)`, `tvl_change_7d_pct numeric(10,4)`, `mcap_usd numeric(20,4)`, `staking_usd numeric(20,4)`, `borrowed_usd numeric(20,4)`, `fetched_at timestamptz`, `updated_at timestamptz`
   - Indexes: `idx_defillama_protocols_category` ON `category`, `idx_defillama_protocols_tvl` ON `tvl_usd`

   **`epsilon.defillama_pools`** (~16,000 rows):
   - `pool_id varchar(100)` PK (DeFiLlama trả UUID nhưng giữ varchar để safe với edge cases), `chain varchar(100)`, `project varchar(100)`, `symbol varchar(100)`, `tvl_usd numeric(20,4)`, `apy numeric(10,6)`, `apy_base numeric(10,6)`, `apy_reward numeric(10,6)`, `stablecoin boolean`, `il_risk varchar(50)`, `exposure varchar(50)`, `apy_mean_30d numeric(10,6)`, `volume_usd_1d numeric(20,4)`, `fetched_at timestamptz`, `updated_at timestamptz`
   - Indexes (yêu cầu cho Story 2.6 query patterns): `idx_defillama_pools_project` ON `project`, `idx_defillama_pools_chain` ON `chain`, `idx_defillama_pools_apy` ON `apy DESC`, `idx_defillama_pools_tvl` ON `tvl_usd DESC`

   **`epsilon.defillama_dex_volumes`**:
   - `protocol_slug varchar(100)` PK, `name varchar(255)`, `chains jsonb`, `total_24h numeric(20,4)`, `total_7d numeric(20,4)`, `total_alltime numeric(20,4)`, `change_1d_pct numeric(10,4)`, `fetched_at`, `updated_at`
   - Index: `idx_defillama_dex_total_24h` ON `total_24h DESC`

   **`epsilon.defillama_fees`**:
   - `protocol_slug varchar(100)` PK, `name varchar(255)`, `total_24h numeric(20,4)`, `total_7d numeric(20,4)`, `total_alltime numeric(20,4)`, `change_1d_pct numeric(10,4)`, `data_type varchar(20)` (fees|revenue), `fetched_at`, `updated_at`
   - Index: `idx_defillama_fees_total_24h` ON `total_24h DESC`

   **`epsilon.defillama_stablecoins`**:
   - `stablecoin_id integer` PK, `name varchar(255)`, `symbol varchar(50)`, `peg_type varchar(50)`, `peg_mechanism varchar(50)`, `circulating_usd numeric(20,4)`, `chains jsonb`, `price numeric(10,6)`, `fetched_at`, `updated_at`

   - Migration `0004_defillama_tables.sql` được generate qua `bun run db:generate` và commit.

3. **AC3 — Endpoint URL mapping (Pro vs Free khác nhau, KHÔNG chỉ swap base URL):**

   Cần helper `getDefillamaUrl(endpoint, proKey?)`. Pro paths khác Free paths:

   | Endpoint key | Free URL | Pro URL (proKey set) |
   |---|---|---|
   | `protocols` | `https://api.llama.fi/protocols` | `https://pro-api.llama.fi/{KEY}/api/protocols` |
   | `pools` | `https://yields.llama.fi/pools` | `https://pro-api.llama.fi/{KEY}/yields/pools` |
   | `dexs` | `https://api.llama.fi/overview/dexs` | `https://pro-api.llama.fi/{KEY}/api/overview/dexs` |
   | `fees` | `https://api.llama.fi/overview/fees` | `https://pro-api.llama.fi/{KEY}/api/overview/fees` |
   | `stablecoins` | `https://stablecoins.llama.fi/stablecoins` | `https://pro-api.llama.fi/{KEY}/stablecoins/stablecoins` |

   Query params (luôn gửi cả Free và Pro để giảm payload):
   - `dexs`, `fees`: append `?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`
   - `stablecoins`: append `?includePrices=true`

   Worker job:
   - Queue: `defillama-sync`, Scheduler ID: `sync-defillama-full`, Job name: `fetch-defillama-all`.
   - Interval: `config.DEFILLAMA_SYNC_INTERVAL_MS` (default 3,600,000ms).
   - Mỗi job run: fetch 5 endpoints tuần tự → bulk upsert từng table → log tổng kết.
   - Bulk upsert dùng Drizzle `onConflictDoUpdate` với batch size 500 rows/insert.
   - Log: `[defillama-worker] Synced protocols=${n} pools=${n} dexs=${n} fees=${n} stables=${n} in ${elapsed}ms`.

4. **AC4 — Per-category retry, không abort toàn job (resolved retry conflict):**
   - **Per-category retry inline**: mỗi fetch trong `processJob()` được wrap trong helper `fetchWithRetry(url, opts, retries=3, baseDelayMs=60_000)` — exponential backoff (60s, 120s, 240s) khi gặp 429 hoặc 5xx.
   - **BullMQ job-level retry**: `attempts: 1` (không retry toàn job) — chỉ retry per-category trong code.
   - Nếu 1 category fail tất cả retries → log warn + tiếp tục các categories còn lại; KHÔNG throw → job vẫn complete success.
   - Timeout 30s per fetch (`AbortSignal.timeout(30_000)`).
   - Log warn cho từng category fail: `[defillama-worker] Failed to sync ${category} after ${retries} retries: ${error}`.

5. **AC5 — Lifecycle wiring:**
   - `startDefillamaWorker()` + `setupDefillamaWorkerJobs()` trong `startBackgroundServices()` của `apps/api/src/index.ts` (sau `setupCryptoWorkerJobs()`).
   - `stopDefillamaWorker()` trong `shutdown()` (sau `stopCryptoWorker()`).
   - Pattern giống `startCryptoWorker` / `stopCryptoWorker` từ Story 2.1.
   - Khi `DEFILLAMA_WORKER_ENABLED=false`: log info `[defillama-worker] worker disabled (DEFILLAMA_WORKER_ENABLED=false)` và return null.

6. **AC6 — Two-tier cache strategy trong `jit-sync.ts` (resolved cache priority conflict):**

   Story 2.1 worker maintain ~15 hot protocols ở `protocol_tvl_snapshots` (refresh 5 phút). Story 2.4 worker maintain ~7,000 protocols ở `defillama_protocols` (refresh 1 giờ). Lookup priority:

   ```
   1. Slug có trong protocol_watchlist (active)? 
      → Dùng protocol_tvl_snapshots (hot tier, fresher)
   2. Otherwise: dùng defillama_protocols (full tier)
   3. Cả 2 miss/stale: fallback in-memory cache → live DeFiLlama fetch (existing logic)
   ```

   Implementation:
   - `jit-sync.ts` import thêm `defillamaProtocols` và `protocolWatchlist` từ `@epsilon/db`.
   - Trước khi query `protocol_tvl_snapshots`, check `protocolWatchlist.active = true AND slug = ?`.
   - Nếu trong watchlist → flow hiện tại (`protocol_tvl_snapshots` lookup, freshness `CRYPTO_SYNC_INTERVAL_MS`).
   - Nếu không trong watchlist → query `defillama_protocols`, freshness `DEFILLAMA_SYNC_INTERVAL_MS`.
   - Cả hai branch set `source: 'db_cache'`.
   - Backward compatible: behavior cho 15 protocols hot không đổi.

7. **AC7 — TypeScript clean:**
   - `cd apps/api && npx tsc --noEmit` không có lỗi mới từ story này.
   - Test smoke: `cd apps/api && bun test src/__tests__/unit/` — không regression.

## Tasks / Subtasks

- [ ] **Task 0: Config vars mới (AC1)**
  - [ ] 0.1 — Thêm vào `apps/api/src/config.ts` envSchema (block sau `CRYPTO_WORKER_CONCURRENCY`):
    ```typescript
    DEFILLAMA_PRO_API_KEY:        optStr,
    DEFILLAMA_WORKER_ENABLED:     optBoolFalse,
    DEFILLAMA_SYNC_INTERVAL_MS:   optInt(3_600_000),
    ```
  - [ ] 0.2 — Map vào config object (sau `CRYPTO_WORKER_CONCURRENCY`).

- [ ] **Task 1: DB Schema — 5 tables mới (AC2)**
  - [ ] 1.1 — Mở `packages/db/src/schema/epsilon.ts`, append sau `protocolTvlSnapshots`.
  - [ ] 1.2 — Tạo table `defillamaProtocols` với 2 indexes (category, tvl_usd).
  - [ ] 1.3 — Tạo table `defillamaPools` với 4 indexes (project, chain, apy DESC, tvl_usd DESC).
  - [ ] 1.4 — Tạo table `defillamaDexVolumes` với 1 index (total_24h DESC).
  - [ ] 1.5 — Tạo table `defillamaFees` với 1 index (total_24h DESC).
  - [ ] 1.6 — Tạo table `defillamaStablecoins`.
  - [ ] 1.7 — Export tất cả 5 tables từ `packages/db/src/index.ts` (block sau `protocolTvlSnapshots`).
  - [ ] 1.8 — `cd packages/db && bun run db:generate` — verify `0004_defillama_tables.sql` được tạo.
  - [ ] 1.9 — `cd packages/db && bun run db:migrate` — verify migration apply thành công.

- [ ] **Task 2: DeFiLlama service functions với endpoint helper (AC3)**
  - [ ] 2.1 — Mở `apps/api/src/router/services/defillama.ts`.
  - [ ] 2.2 — Thêm helper `getDefillamaUrl(endpoint: 'protocols'|'pools'|'dexs'|'fees'|'stablecoins', proKey?: string): string` — return full URL theo bảng mapping AC3.
  - [ ] 2.3 — Thêm `fetchWithRetry(url, opts, retries=3, baseDelayMs=60_000)` helper — exponential backoff cho 429/5xx, timeout 30s.
  - [ ] 2.4 — Thêm `fetchAllProtocols(proKey?: string): Promise<DefillamaProtocolRow[]>` — dùng `getDefillamaUrl('protocols', proKey)` + `fetchWithRetry`.
  - [ ] 2.5 — Thêm `fetchAllPools(proKey?: string): Promise<DefillamaPoolRow[]>`.
  - [ ] 2.6 — Thêm `fetchDexVolumes(proKey?: string): Promise<DefillamaDexVolumeRow[]>` — pass query params `excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`.
  - [ ] 2.7 — Thêm `fetchFees(proKey?: string): Promise<DefillamaFeeRow[]>` — same query params.
  - [ ] 2.8 — Thêm `fetchStablecoins(proKey?: string): Promise<DefillamaStablecoinRow[]>` — query param `includePrices=true`.
  - [ ] 2.9 — Định nghĩa TypeScript interfaces cho từng response type (export từ file).

- [ ] **Task 3: defillama-worker.ts (AC3, AC4, AC5)**
  - [ ] 3.1 — Tạo `apps/api/src/queue/bullmq/workers/defillama-worker.ts`.
  - [ ] 3.2 — Follow pattern của `crypto-worker.ts` (Story 2.1): `startWorker()` sync, `setupJobs()` async, `stopWorker()` async.
  - [ ] 3.3 — `processJob()`: fetch 5 categories tuần tự, mỗi fetch wrap trong try/catch riêng + logger.warn nếu fail.
  - [ ] 3.4 — Bulk upsert per category: chunk 500 rows, dùng helper `buildExcludedSet(table, pkColumn)` để generate `set` clause tự động (xem Dev Notes).
  - [ ] 3.5 — BullMQ Worker `attempts: 1, removeOnComplete: 100, removeOnFail: 1000` — không job-level retry (chỉ per-category retry inline).
  - [ ] 3.6 — Export `startDefillamaWorker()`, `setupDefillamaWorkerJobs()`, `stopDefillamaWorker()`.
  - [ ] 3.7 — Log disabled state khi `DEFILLAMA_WORKER_ENABLED=false`.

- [ ] **Task 4: Barrel export (AC5)**
  - [ ] 4.1 — Thêm vào `apps/api/src/queue/index.ts`:
    ```typescript
    export { startDefillamaWorker, setupDefillamaWorkerJobs, stopDefillamaWorker } from './bullmq/workers/defillama-worker';
    ```

- [ ] **Task 5: Lifecycle wiring (AC5)**
  - [ ] 5.1 — `apps/api/src/index.ts` line ~35: thêm `startDefillamaWorker, setupDefillamaWorkerJobs, stopDefillamaWorker` vào import từ `./queue`.
  - [ ] 5.2 — `startBackgroundServices()` (line ~1062): gọi `startDefillamaWorker()` và `setupDefillamaWorkerJobs().catch(...)` sau `setupCryptoWorkerJobs()`.
  - [ ] 5.3 — `shutdown()` (line ~1121): `await stopDefillamaWorker().catch(...)` sau `stopCryptoWorker()`.

- [ ] **Task 6: JIT sync two-tier cache (AC6)**
  - [ ] 6.1 — `apps/api/src/router/routes/jit-sync.ts`: import `defillamaProtocols`, `protocolWatchlist` từ `@epsilon/db`.
  - [ ] 6.2 — Trước DB cache lookup, query `protocolWatchlist` để check slug có trong hot tier không.
  - [ ] 6.3 — Branch:
    - In watchlist → query `protocol_tvl_snapshots`, freshness `CRYPTO_SYNC_INTERVAL_MS` (existing logic, no behavior change).
    - Not in watchlist → query `defillama_protocols`, freshness `DEFILLAMA_SYNC_INTERVAL_MS` (default 1h).
  - [ ] 6.4 — Cả hai branch set `source: 'db_cache'` khi hit fresh row.
  - [ ] 6.5 — Fallback chain unchanged: in-memory cache → live fetch → stale-fallback.
  - [ ] 6.6 — Test backward compat: `curl POST /v1/router/jit-sync { protocol_slug: "uniswap" }` (uniswap trong watchlist) vẫn return từ `protocol_tvl_snapshots`.

- [ ] **Task 7: TypeScript check (AC7)**
  - [ ] 7.1 — `cd apps/api && npx tsc --noEmit` — không có lỗi mới.
  - [ ] 7.2 — `cd apps/api && bun test src/__tests__/unit/` — không regression.

## Dev Notes

### Pattern Reference
- Worker structure: `apps/api/src/queue/bullmq/workers/crypto-worker.ts` (Story 2.1) — copy structure CHÍNH XÁC.
- `upsertJobScheduler` với `{ every: intervalMs }` — KHÔNG dùng cron pattern.
- Service functions: `apps/api/src/router/services/defillama.ts` — append vào file hiện có.

### DeFiLlama API: Free vs Pro paths
**Critical:** Pro endpoints có path prefix khác Free. KHÔNG chỉ swap base URL.

```typescript
// apps/api/src/router/services/defillama.ts
type LlamaEndpoint = 'protocols' | 'pools' | 'dexs' | 'fees' | 'stablecoins';

export function getDefillamaUrl(endpoint: LlamaEndpoint, proKey?: string): string {
  if (proKey) {
    const base = `https://pro-api.llama.fi/${proKey}`;
    switch (endpoint) {
      case 'protocols':   return `${base}/api/protocols`;
      case 'pools':       return `${base}/yields/pools`;
      case 'dexs':        return `${base}/api/overview/dexs?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`;
      case 'fees':        return `${base}/api/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`;
      case 'stablecoins': return `${base}/stablecoins/stablecoins?includePrices=true`;
    }
  }
  switch (endpoint) {
    case 'protocols':   return 'https://api.llama.fi/protocols';
    case 'pools':       return 'https://yields.llama.fi/pools';
    case 'dexs':        return 'https://api.llama.fi/overview/dexs?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true';
    case 'fees':        return 'https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true';
    case 'stablecoins': return 'https://stablecoins.llama.fi/stablecoins?includePrices=true';
  }
}
```

### Per-category Retry Helper
```typescript
async function fetchWithRetry(
  url: string,
  retries = 3,
  baseDelayMs = 60_000,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (res.status === 429 || res.status >= 500) {
        if (attempt === retries) return res;
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt === retries) throw lastErr;
      const delay = baseDelayMs * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
```

### Bulk Upsert Helper
Thay vì viết 50 dòng `set: { col1: sql\`excluded.col1\`, ... }` cho 5 tables, dùng helper:

```typescript
import { getTableColumns, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

function buildExcludedSet<T extends PgTable>(
  table: T,
  excludeColumns: string[] = [],
): Record<string, unknown> {
  const cols = getTableColumns(table);
  const result: Record<string, unknown> = {};
  for (const [name, col] of Object.entries(cols)) {
    if (excludeColumns.includes(name) || name === 'createdAt') continue;
    result[name] = sql.raw(`excluded.${(col as { name: string }).name}`);
  }
  return result;
}

// Usage trong worker:
await db.insert(defillamaProtocols)
  .values(batch)
  .onConflictDoUpdate({
    target: defillamaProtocols.slug,
    set: buildExcludedSet(defillamaProtocols, ['slug']),
  });
```

### Numeric Handling
- Drizzle `numeric` type returns `string` in TypeScript — `String(number)` khi insert, `parseFloat(string)` khi đọc.
- Validate bounds: skip row nếu `tvl_usd` là NaN hoặc Infinity.

### Memory Considerations
- `/protocols` ~3-8MB JSON (~7,000 objects), `/pools` ~5-15MB (~16,000 objects).
- Peak memory trong job có thể spike ~500MB. Chunk insert 500 rows/batch và release reference sau từng batch.
- **Production deploy note:** worker nên chạy process riêng (qua `WORKER_ONLY=true` env split — chưa có nhưng cân nhắc nếu deploy VPS small).

### Two-tier Cache Logic (AC6)
```typescript
// Pseudo-code cho jit-sync.ts upgrade
const inWatchlist = await db.select({ slug: protocolWatchlist.slug })
  .from(protocolWatchlist)
  .where(and(eq(protocolWatchlist.slug, slug), eq(protocolWatchlist.active, true)))
  .limit(1)
  .then(rows => rows.length > 0);

if (inWatchlist) {
  // Hot tier — existing logic from Story 2.1, freshness CRYPTO_SYNC_INTERVAL_MS
  const dbRow = await db.select().from(protocolTvlSnapshots).where(eq(protocolTvlSnapshots.slug, slug)).limit(1).then(r => r[0]);
  if (dbRow && (Date.now() - dbRow.updatedAt.getTime()) < CRYPTO_INTERVAL_MS) { /* serve, source='db_cache' */ }
} else {
  // Full tier — new (Story 2.4), freshness DEFILLAMA_SYNC_INTERVAL_MS
  const dbRow = await db.select().from(defillamaProtocols).where(eq(defillamaProtocols.slug, slug)).limit(1).then(r => r[0]);
  if (dbRow && (Date.now() - dbRow.updatedAt.getTime()) < DEFILLAMA_INTERVAL_MS) {
    // Map defillamaProtocols → ProtocolSnapshot shape
    data = {
      slug: dbRow.slug, name: dbRow.name,
      tvl_usd: parseFloat(dbRow.tvlUsd),
      tvl_change_24h_pct: dbRow.tvlChange1dPct ? parseFloat(dbRow.tvlChange1dPct) : null,
      apy_avg: null, // defillama_protocols doesn't track aggregate APY
      chains: dbRow.chains as string[],
    };
    source = 'db_cache';
    fetched_at = dbRow.fetchedAt.toISOString();
  }
}
// Fallback: in-memory cache → live fetch (unchanged)
```

### DB Export Pattern
Sau khi thêm tables vào `packages/db/src/schema/epsilon.ts`, export trong `packages/db/src/index.ts`:
```typescript
// Sau protocolTvlSnapshots
defillamaProtocols,
defillamaPools,
defillamaDexVolumes,
defillamaFees,
defillamaStablecoins,
```

### Migration Sequence Constraint
- Story 2.4 generate `0004_defillama_tables.sql`. **PHẢI commit migration trước khi start Story 2.5/2.6/2.7** để tránh sequence conflict (2 stories cùng generate `0005_*.sql`).
- Story 2.7 sẽ generate `0005_defillama_pro_tables.sql` (depends on 2.4).

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
| 2026-05-14 | Architect review (Winston): fixed Pro vs Free endpoint paths (AC3), per-category retry (AC4), pool_id type clarification (AC2), added 8 indexes for Story 2.6 query patterns (AC2), two-tier cache strategy (AC6), config helpers consistency (AC1) |
