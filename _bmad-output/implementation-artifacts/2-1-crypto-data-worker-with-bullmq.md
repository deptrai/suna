# Story 2.1: Crypto Data Worker với BullMQ

Status: ready-for-dev

Epic: 2 — Crypto Data Infrastructure
Created: 2026-05-09
FRs: FR2, FR5
NFRs: NFR4 (1,000 CCU), NFR5 (Worker auto-scaling)
ARs: AR1 (brownfield), AR2 (Bun runtime), AR3 (Drizzle additive-only), AR8 (feature addition sequence)

## Story

As a platform operator,
I want background worker crawl DeFiLlama TVL/APY data định kỳ chạy qua BullMQ,
so that data crypto luôn fresh trong DB để JIT sync tool (Story 1.2) có thể serve nhanh hơn từ pre-indexed data thay vì real-time fetch tốn latency.

## Acceptance Criteria

1. **AC1 — BullMQ + Redis infrastructure:**
   - `bullmq` và `ioredis` được install vào `apps/api/package.json`.
   - Redis service `redis` được thêm vào `docker-compose.dev.yml` (image `redis:7-alpine`, port `6379`).
   - Config entry `REDIS_URL: z.string().default('redis://localhost:6379')` được thêm vào `apps/api/src/config.ts`.
   - BullMQ connection sử dụng `ioredis` với URL từ `config.REDIS_URL`.

2. **AC2 — BullMQ worker infrastructure tách biệt hoàn toàn với `queue/` hiện tại:**
   - Files mới nằm trong `apps/api/src/queue/bullmq/` (subdirectory mới — KHÔNG modify các file trong `queue/` hiện tại).
   - `queue/bullmq/connection.ts`: export singleton `IORedis` connection.
   - `queue/bullmq/crypto-worker.ts`: Worker + Queue + scheduler logic.
   - `queue/bullmq/index.ts`: export `startCryptoWorker()` và `stopCryptoWorker()`.

3. **AC3 — Queue và scheduler:**
   - Queue tên `crypto-data-sync` (kebab-case theo AR convention).
   - Job scheduler ID `sync-protocol-tvl`, job name `fetch-protocol-tvl`.
   - Default interval: `CRYPTO_SYNC_INTERVAL_MS` env var (default 5 phút = 300_000ms).
   - Worker sử dụng `queue.upsertJobScheduler(schedulerId, { every: intervalMs }, { name: jobName })` (BullMQ v5.16+ API — KHÔNG dùng `add` với `repeat`).

4. **AC4 — Drizzle schema additive migration (AR3):**
   - Table `epsilon.protocol_watchlist`: seed ~15 top DeFi protocols.
   - Table `epsilon.protocol_tvl_snapshots`: upsert target cho worker.
   - Migration được generate qua `bun run db:generate` trong `packages/db/`, commit file `.sql` vào repo.
   - Schema changes thêm vào `packages/db/src/schema/epsilon.ts` (cùng file với tables hiện tại).

5. **AC5 — Worker job logic:**
   - Worker đọc tất cả active slugs từ `protocol_watchlist` một lần mỗi job run.
   - Với mỗi slug, gọi DeFiLlama service (`defillama.ts` từ Story 1.2) để fetch snapshot.
   - Upsert vào `protocol_tvl_snapshots` với `onConflictDoUpdate({ target: slug, set: { tvl_usd, ..., updated_at } })`.
   - Mỗi slug được fetch tuần tự trong cùng job (KHÔNG concurrent per-slug để tránh DeFiLlama rate-limit).
   - Job log: `[crypto-worker] Synced ${successCount}/${total} protocols in ${elapsed}ms`.

6. **AC6 — Scale-out via Worker concurrency (NFR5):**
   - Worker được khởi tạo với `concurrency: parseInt(process.env.CRYPTO_WORKER_CONCURRENCY ?? '1', 10)`.
   - Khi watchlist tăng, operator tăng `CRYPTO_WORKER_CONCURRENCY` env var — KHÔNG cần code change.
   - BullMQ tự động handle job distribution — KHÔNG cần logic custom.

7. **AC7 — No duplicate upsert:**
   - `protocol_tvl_snapshots` có `UNIQUE(slug)` constraint.
   - Worker dùng Drizzle `onConflictDoUpdate` — không `insert` thuần.
   - Concurrent worker instances chạy trong cùng BullMQ queue tự động nhận job khác nhau (BullMQ locking built-in).

8. **AC8 — API lifecycle wiring:**
   - `startCryptoWorker()` được gọi trong `ensureSchema().then()` block của `apps/api/src/index.ts` sau `startDrainer()`.
   - `stopCryptoWorker()` được gọi trong `shutdown()` function cùng block với `stopDrainer()`.
   - Cả 2 branches (`.then` + `.catch`) của `ensureSchema()` đều wire lifecycle.

9. **AC9 — JIT sync integration (Story 1.2 upgrade):**
   - `jit-sync.ts` route handler: trước khi gọi DeFiLlama, thêm DB lookup vào `protocol_tvl_snapshots` cho slug.
   - Nếu DB hit và `updated_at < CRYPTO_SYNC_INTERVAL_MS`: serve từ DB, set `source: 'db_cache'`.
   - Nếu DB miss hoặc stale: fallback sang DeFiLlama real-time (existing behavior).
   - `JitSyncResponse.source` mở rộng thành `'live' | 'cache_fresh' | 'cache_stale' | 'db_cache' | 'no_data'`.

10. **AC10 — End-to-end verification:**
    - `docker compose up redis` chạy thành công (hoặc `docker compose -f docker-compose.dev.yml up redis -d`).
    - Worker start log: `[crypto-worker] BullMQ worker started, queue: crypto-data-sync`.
    - Sau 5 phút (hoặc trigger job thủ công), `protocol_tvl_snapshots` có rows cho top protocols.
    - curl `jit-sync` endpoint cho `uniswap` → `source: 'db_cache'` nếu DB đã được populated.
    - TypeScript: `cd apps/api && npx tsc --noEmit` không lỗi mới.

## Tasks / Subtasks

- [ ] **Task 0: Install dependencies + Redis infra (AC: 1)**
  - [ ] 0.1 — `cd apps/api && bun add bullmq ioredis` — verify entries xuất hiện trong `apps/api/package.json`.
  - [ ] 0.2 — Edit `docker-compose.dev.yml`: thêm service `redis` sau service `db` (hoặc cuối services block):
    ```yaml
    redis:
      image: redis:7-alpine
      ports:
        - "6379:6379"
      restart: unless-stopped
    ```
  - [ ] 0.3 — Edit `apps/api/src/config.ts`: thêm `REDIS_URL: z.string().default('redis://localhost:6379')` vào env schema; map vào config object (sau `DEFILLAMA_API_URL`).
  - [ ] 0.4 — `docker compose -f docker-compose.dev.yml up redis -d` — verify container running.

- [ ] **Task 1: BullMQ connection module (AC: 2)**
  - [ ] 1.1 — Tạo `apps/api/src/queue/bullmq/connection.ts`:
    ```typescript
    import IORedis from 'ioredis';
    import { config } from '../../config';

    export const redisConnection = new IORedis(config.REDIS_URL, {
      maxRetriesPerRequest: null, // BullMQ requirement
    });
    ```
  - [ ] 1.2 — `maxRetriesPerRequest: null` là BullMQ requirement — PHẢI có, thiếu sẽ throw runtime error.

- [ ] **Task 2: Drizzle schema — new tables (AC: 4)**
  - [ ] 2.1 — Mở `packages/db/src/schema/epsilon.ts`. Append sau last table definition:
  - [ ] 2.2 — Table `protocolWatchlist`:
    ```typescript
    export const protocolWatchlist = epsilonSchema.table(
      'protocol_watchlist',
      {
        slug: varchar('slug', { length: 100 }).primaryKey(),
        displayName: varchar('display_name', { length: 255 }).notNull(),
        active: boolean('active').default(true).notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
      },
    );
    ```
  - [ ] 2.3 — Table `protocolTvlSnapshots`:
    ```typescript
    export const protocolTvlSnapshots = epsilonSchema.table(
      'protocol_tvl_snapshots',
      {
        slug: varchar('slug', { length: 100 }).primaryKey(),
        displayName: varchar('display_name', { length: 255 }).notNull(),
        tvlUsd: numeric('tvl_usd', { precision: 20, scale: 4 }).notNull(),
        tvlChange24hPct: numeric('tvl_change_24h_pct', { precision: 10, scale: 4 }),
        apyAvg: numeric('apy_avg', { precision: 10, scale: 4 }),
        chains: jsonb('chains').notNull().default([]).$type<string[]>(),
        rawSnapshot: text('raw_snapshot'),
        fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
      },
      (table) => [
        index('idx_protocol_snapshots_updated').on(table.updatedAt),
      ],
    );
    ```
  - [ ] 2.4 — Chạy `cd packages/db && bun run db:generate` — verify `.sql` migration file được tạo trong `packages/db/drizzle/`.
  - [ ] 2.5 — Chạy `cd packages/db && bun run db:migrate` — verify migration apply thành công.
  - [ ] 2.6 — Seed watchlist: tạo seed script `packages/db/scripts/seed-watchlist.ts` (hoặc embed trong migration SQL):
    ```typescript
    // top 15 DeFi protocols by TVL (DeFiLlama slugs)
    const WATCHLIST = [
      { slug: 'lido', displayName: 'Lido' },
      { slug: 'aave-v3', displayName: 'Aave V3' },
      { slug: 'eigenlayer', displayName: 'EigenLayer' },
      { slug: 'uniswap', displayName: 'Uniswap' },
      { slug: 'curve-dex', displayName: 'Curve DEX' },
      { slug: 'compound-v3', displayName: 'Compound V3' },
      { slug: 'makerdao', displayName: 'MakerDAO' },
      { slug: 'rocket-pool', displayName: 'Rocket Pool' },
      { slug: 'pendle', displayName: 'Pendle' },
      { slug: 'pancakeswap', displayName: 'PancakeSwap' },
      { slug: 'gmx', displayName: 'GMX' },
      { slug: 'balancer-v2', displayName: 'Balancer V2' },
      { slug: 'convex-finance', displayName: 'Convex Finance' },
      { slug: 'instadapp', displayName: 'Instadapp' },
      { slug: 'stargate', displayName: 'Stargate' },
    ];
    ```
    INSERT ON CONFLICT DO NOTHING để idempotent.

- [ ] **Task 3: Crypto worker (AC: 3, 5, 6, 7)**
  - [ ] 3.1 — Tạo `apps/api/src/queue/bullmq/crypto-worker.ts`:
  - [ ] 3.2 — Imports:
    ```typescript
    import { Queue, Worker } from 'bullmq';
    import { sql } from 'drizzle-orm';
    import { db } from '../../shared/db';
    import { protocolWatchlist, protocolTvlSnapshots } from '@epsilon/db';
    import { fetchProtocolSnapshot } from '../../router/services/defillama';
    import { redisConnection } from './connection';
    import { config } from '../../config';
    ```
  - [ ] 3.3 — Constants:
    ```typescript
    const QUEUE_NAME = 'crypto-data-sync';
    const SCHEDULER_ID = 'sync-protocol-tvl';
    const JOB_NAME = 'fetch-protocol-tvl';
    const INTERVAL_MS = parseInt(process.env.CRYPTO_SYNC_INTERVAL_MS ?? '300000', 10);
    ```
  - [ ] 3.4 — Queue instance: `const cryptoQueue = new Queue(QUEUE_NAME, { connection: redisConnection });`
  - [ ] 3.5 — Worker instance:
    ```typescript
    let cryptoWorker: Worker | null = null;

    async function processJob() {
      const start = Date.now();
      const protocols = await db
        .select({ slug: protocolWatchlist.slug })
        .from(protocolWatchlist)
        .where(eq(protocolWatchlist.active, true));

      let successCount = 0;
      for (const { slug } of protocols) {
        try {
          const snapshot = await fetchProtocolSnapshot(slug, {});
          await db
            .insert(protocolTvlSnapshots)
            .values({
              slug,
              displayName: snapshot.name,
              tvlUsd: String(snapshot.tvl_usd),
              tvlChange24hPct: snapshot.tvl_change_24h_pct != null ? String(snapshot.tvl_change_24h_pct) : null,
              apyAvg: snapshot.apy_avg != null ? String(snapshot.apy_avg) : null,
              chains: snapshot.chains,
              rawSnapshot: null,
              fetchedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: protocolTvlSnapshots.slug,
              set: {
                displayName: snapshot.name,
                tvlUsd: String(snapshot.tvl_usd),
                tvlChange24hPct: snapshot.tvl_change_24h_pct != null ? String(snapshot.tvl_change_24h_pct) : null,
                apyAvg: snapshot.apy_avg != null ? String(snapshot.apy_avg) : null,
                chains: snapshot.chains,
                fetchedAt: new Date(),
                updatedAt: new Date(),
              },
            });
          successCount++;
        } catch (err) {
          console.warn(`[crypto-worker] Failed to sync ${slug}:`, err instanceof Error ? err.message : err);
        }
      }
      const elapsed = Date.now() - start;
      console.log(`[crypto-worker] Synced ${successCount}/${protocols.length} protocols in ${elapsed}ms`);
    }
    ```
  - [ ] 3.6 — `startCryptoWorker()`:
    ```typescript
    export async function startCryptoWorker() {
      const concurrency = parseInt(process.env.CRYPTO_WORKER_CONCURRENCY ?? '1', 10);
      cryptoWorker = new Worker(QUEUE_NAME, processJob, {
        connection: redisConnection,
        concurrency,
      });
      cryptoWorker.on('failed', (job, err) => {
        console.error(`[crypto-worker] Job ${job?.id} failed:`, err.message);
      });
      await cryptoQueue.upsertJobScheduler(
        SCHEDULER_ID,
        { every: INTERVAL_MS },
        { name: JOB_NAME, data: {} },
      );
      console.log(`[crypto-worker] BullMQ worker started, queue: ${QUEUE_NAME}`);
    }
    ```
  - [ ] 3.7 — `stopCryptoWorker()`:
    ```typescript
    export async function stopCryptoWorker() {
      await cryptoWorker?.close();
      await cryptoQueue.close();
    }
    ```

- [ ] **Task 4: BullMQ barrel export (AC: 2)**
  - [ ] 4.1 — Tạo `apps/api/src/queue/bullmq/index.ts`:
    ```typescript
    export { startCryptoWorker, stopCryptoWorker } from './crypto-worker';
    ```

- [ ] **Task 5: Lifecycle wiring trong index.ts (AC: 8)**
  - [ ] 5.1 — Edit `apps/api/src/index.ts`: thêm import:
    ```typescript
    import { startCryptoWorker, stopCryptoWorker } from './queue/bullmq';
    ```
    (Sau import `{ queueApp, startDrainer, stopDrainer } from './queue'`.)
  - [ ] 5.2 — Trong `ensureSchema().then()` block, thêm sau `startDrainer()`:
    ```typescript
    startCryptoWorker().catch((err) =>
      console.error('[startup] Failed to start crypto worker:', err),
    );
    ```
  - [ ] 5.3 — Thêm vào `.catch()` branch tương tự (sau `startDrainer()`).
  - [ ] 5.4 — Trong `shutdown()` function, thêm sau `stopDrainer()`:
    ```typescript
    await stopCryptoWorker();
    ```

- [ ] **Task 6: JIT sync DB cache integration (AC: 9)**
  - [ ] 6.1 — Edit `apps/api/src/types.ts`: mở rộng `source` field trong `JitSyncResponse`:
    ```typescript
    source: 'live' | 'cache_fresh' | 'cache_stale' | 'db_cache' | 'no_data';
    ```
  - [ ] 6.2 — Edit `apps/api/src/router/routes/jit-sync.ts`: sau credit check, trước DeFiLlama fetch, thêm DB lookup:
    ```typescript
    // DB cache lookup (populated by BullMQ crypto worker)
    const dbRow = await db
      .select()
      .from(protocolTvlSnapshots)
      .where(eq(protocolTvlSnapshots.slug, parsed.data.protocol_slug))
      .limit(1)
      .then((rows) => rows[0] ?? null);

    const dbCacheFresh = dbRow &&
      (Date.now() - new Date(dbRow.updatedAt).getTime()) < INTERVAL_MS;

    if (dbCacheFresh && dbRow) {
      // serve from pre-indexed DB data — fast path
      const data: ProtocolSnapshot = {
        slug: dbRow.slug,
        name: dbRow.displayName,
        tvl_usd: parseFloat(dbRow.tvlUsd),
        tvl_change_24h_pct: dbRow.tvlChange24hPct != null ? parseFloat(dbRow.tvlChange24hPct) : null,
        apy_avg: dbRow.apyAvg != null ? parseFloat(dbRow.apyAvg) : null,
        chains: dbRow.chains as string[],
      };
      // continue to billing deduction + format response with source: 'db_cache'
    }
    // else: fallback to existing DeFiLlama real-time fetch (no change)
    ```
  - [ ] 6.3 — Import `protocolTvlSnapshots` từ `@epsilon/db` trong route file.
  - [ ] 6.4 — `INTERVAL_MS` trong route file: import từ env var `parseInt(process.env.CRYPTO_SYNC_INTERVAL_MS ?? '300000', 10)` — KHÔNG hardcode.

- [ ] **Task 7: End-to-end verification (AC: 10)**
  - [ ] 7.1 — `cd apps/api && npx tsc --noEmit` — không có lỗi mới từ story này.
  - [ ] 7.2 — Start Redis: `docker compose -f docker-compose.dev.yml up redis -d`.
  - [ ] 7.3 — Start API: verify log `[crypto-worker] BullMQ worker started, queue: crypto-data-sync`.
  - [ ] 7.4 — Trigger job ngay lập tức thay vì đợi 5 phút:
    ```typescript
    // trong REPL hoặc test script
    await cryptoQueue.add('fetch-protocol-tvl', {});
    ```
    Hoặc thay đổm env: `CRYPTO_SYNC_INTERVAL_MS=5000` khi dev.
  - [ ] 7.5 — Verify DB có data:
    ```sql
    SELECT slug, tvl_usd, updated_at FROM epsilon.protocol_tvl_snapshots LIMIT 5;
    ```
  - [ ] 7.6 — curl jit-sync sau khi DB populated:
    ```bash
    curl -X POST http://localhost:8008/v1/router/jit-sync \
      -H "Authorization: Bearer <token>" \
      -H "Content-Type: application/json" \
      -d '{"protocol_slug":"uniswap"}'
    ```
    Expect: `source: "db_cache"` trong response.
  - [ ] 7.7 — Verify fallback: test với slug không có trong watchlist → `source: "live"` (DeFiLlama real-time).

## Dev Notes

### CRITICAL BROWNFIELD WARNING — `queue/` ≠ BullMQ

**`apps/api/src/queue/` đang tồn tại là KHÔNG PHẢI BullMQ.** Epic spec nói "BullMQ queue đã tồn tại tại `apps/api/src/queue/`" — đây là thông tin sai trong epic spec. Thực tế:

| Item | Thực tế |
|------|---------|
| `apps/api/src/queue/` hiện tại | Custom file-system session queue cho OpenCode session messages |
| `queue/storage.ts` | Lưu pending prompts vào `<DATA_DIR>/queue/<sessionId>.json` |
| `queue/drainer.ts` | Polling drainer 2s, gửi messages tới OpenCode sessions |
| `queue/routes.ts` | Hono REST API cho session queue CRUD |
| BullMQ | **CHƯA được install** — `bun add bullmq ioredis` là bước đầu tiên |
| Redis | **KHÔNG có trong docker-compose** — phải thêm vào |

**ĐỪNG modify `queue/` hiện tại.** Tất cả BullMQ code đặt trong `queue/bullmq/` subdirectory mới.

---

### Architecture Compliance

**AR1 (Brownfield):** KHÔNG tạo app/package mới. Files mới:
```
apps/api/src/queue/bullmq/
├── connection.ts       (new)
├── crypto-worker.ts    (new)
└── index.ts            (new)
packages/db/src/schema/epsilon.ts  (MODIFIED — append tables)
packages/db/drizzle/<timestamp>_crypto-tables.sql  (new migration)
apps/api/src/index.ts  (MODIFIED — lifecycle wiring)
apps/api/src/router/routes/jit-sync.ts  (MODIFIED — DB cache lookup)
apps/api/src/types.ts  (MODIFIED — source field)
```

**AR2 (Bun runtime):** BullMQ v5.76.6 runs fine với Bun. `ioredis` là bundled peer dep nhưng phải install explicitly.

**AR3 (Drizzle additive-only):** KHÔNG drop hoặc rename columns. Chỉ `ALTER TABLE ADD COLUMN` / `CREATE TABLE`. Schema file `epsilon.ts` append-only.

**AR8 (Feature addition sequence):** Task 0 (install) → Task 1 (connection) → Task 2 (schema) → Task 3 (worker) → Task 4 (exports) → Task 5 (lifecycle) → Task 6 (JIT integration) → Task 7 (verify). KHÔNG đảo thứ tự.

---

### BullMQ v5.76.6 API — Critical Patterns

**Scheduler (KHÔNG dùng legacy `repeat` option):**
```typescript
// ✅ CORRECT — v5.16+ upsertJobScheduler API
await queue.upsertJobScheduler(
  'sync-protocol-tvl',           // scheduler ID (stable, idempotent)
  { every: 300_000 },            // interval in ms
  { name: 'fetch-protocol-tvl', data: {} },
);

// ❌ WRONG — legacy API bị deprecate trong v5
queue.add('job', data, { repeat: { every: 300_000 } });
```

**IORedis connection — required options:**
```typescript
const connection = new IORedis(config.REDIS_URL, {
  maxRetriesPerRequest: null,  // REQUIRED — thiếu sẽ throw: "BULL_UNKNOWN_EXCEPTION"
});
```

**Worker close — graceful shutdown:**
```typescript
await worker.close();  // drain current jobs before closing
await queue.close();   // close queue connection
```

---

### Drizzle Upsert Pattern

```typescript
await db.insert(protocolTvlSnapshots)
  .values({ slug, displayName, tvlUsd: String(tvl_usd), ... })
  .onConflictDoUpdate({
    target: protocolTvlSnapshots.slug,  // UNIQUE constraint column
    set: {
      tvlUsd: sql`excluded.tvl_usd`,   // hoặc explicit value
      updatedAt: new Date(),
    },
  });
```

`numeric` Drizzle type mapping: TypeScript nhận `string`, không phải `number`. Cần `String(number)` khi insert, `parseFloat(string)` khi đọc.

---

### DB Schema Design Notes

**`protocol_watchlist`**: PKs là `slug` (DeFiLlama slug = stable identifier). `active` flag cho phép disable một protocol không cần xóa row. Không cần auto-increment ID — slug là natural key.

**`protocol_tvl_snapshots`**: PKs cũng là `slug` (1 row per protocol, upsert in-place). `fetched_at` = thời điểm DeFiLlama trả về data. `updated_at` = thời điểm worker upsert. JIT sync route dùng `updated_at` để check freshness.

**`rawSnapshot` column**: Reserved `text` column để lưu full DeFiLlama JSON response trong tương lai — set `null` trong story này.

---

### JIT Sync Integration (Task 6) — Logic Flow

```
POST /v1/router/jit-sync
  → checkCredits
  → DB lookup (protocol_tvl_snapshots WHERE slug = ?)
    → fresh (updated_at < INTERVAL_MS ago) → serve {source: 'db_cache'}, deduct credits
    → stale/miss → DeFiLlama real-time fetch (existing behavior)
      → success → cache in-memory + DB? (NO — worker owns DB writes)
      → fail → in-memory stale fallback
```

**QUAN TRỌNG:** Worker owns DB writes. JIT sync route chỉ READ từ DB, KHÔNG write vào `protocol_tvl_snapshots`. In-memory cache (`jit-cache.ts`) vẫn được dùng cho real-time path — không xóa.

---

### Pattern References

| File mới/modified | Pattern reference |
|---|---|
| `queue/bullmq/connection.ts` | Xem BullMQ docs — IORedis connection requirement |
| `queue/bullmq/crypto-worker.ts` | Pattern: `pool/index.ts` (startAutoReplenish lifecycle) |
| `packages/db/src/schema/epsilon.ts` | Append sau `poolResources` table — same `epsilonSchema.table()` pattern |
| `router/routes/jit-sync.ts` DB lookup | Pattern: `shared/db.ts` select pattern dùng trong `billing/` |

---

### Environment Variables mới

| Variable | Default | Purpose |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379` | BullMQ + IORedis connection URL |
| `CRYPTO_SYNC_INTERVAL_MS` | `300000` (5 min) | Scheduler interval |
| `CRYPTO_WORKER_CONCURRENCY` | `1` | BullMQ Worker concurrency (scale-out) |

Add to `.env.example` hoặc `docker-compose.dev.yml` environment block.

---

### Scale-out (NFR5)

BullMQ built-in concurrency handles NFR5. Không cần custom queue partitioning hay pub/sub.

- **Concurrency = 1:** 1 job at a time; mỗi job crawl tất cả slugs tuần tự (~15 protocols × ~1.2s = ~18s per run).
- **Concurrency = 3:** 3 jobs chạy song song — hữu ích nếu scheduler fire rate tăng.
- **Horizontal scaling:** Multiple API instances kết nối cùng 1 Redis → BullMQ lock prevents duplicate job processing automatically.

---

### TypeScript Import Path cho DB tables

```typescript
// Nếu @epsilon/db export từ packages/db/src/schema/epsilon.ts
import { protocolWatchlist, protocolTvlSnapshots } from '@epsilon/db';
// hoặc
import { protocolWatchlist, protocolTvlSnapshots } from '@epsilon/db/schema';
```

Kiểm tra `packages/db/src/schema/index.ts` để xác định export path chính xác trước khi code.

## Review Findings
<!-- Dev agent: append code review findings here after implementation -->

- [ ] [Review][Decision] Out-of-Scope Code Added — The diff introduces workers, routes, and DB tables for `discover` and `onchain-worker`. These appear to belong to Story 2.2 or other epics. Should we remove them from this branch or keep them?
- [ ] [Review][Patch] Modification of Existing Queue Files (AC2 violation) — Revert changes to `apps/api/src/queue/index.ts`.
- [ ] [Review][Patch] Incorrect Queue Name and Job IDs (AC3 violation) — Update worker and scheduler to use `crypto-data-sync`.
- [ ] [Review][Patch] Use of Deprecated BullMQ API (AC3 violation) — Update to `queue.upsertJobScheduler`.
- [ ] [Review][Patch] Hardcoded Scheduler Interval (AC3 violation) — Use `CRYPTO_SYNC_INTERVAL_MS` env var.
- [ ] [Review][Patch] Incorrect Database Tables Created (AC4 violation) — Remove out-of-spec tables and create `protocol_watchlist` and `protocol_tvl_snapshots` with seed data.
- [ ] [Review][Patch] Worker Logic Ignores Spec (AC5 violation) — Update worker to fetch active slugs from DB and log correctly.
- [ ] [Review][Patch] Hardcoded Worker Concurrency (AC6 violation) — Parse `CRYPTO_WORKER_CONCURRENCY` from env.
- [ ] [Review][Patch] Incorrect API Lifecycle Wiring (AC8 violation) — Use `startCryptoWorker()`/`stopCryptoWorker()` instead of scheduling directly.
- [ ] [Review][Patch] Missing JIT Sync DB Cache Integration (AC9 violation) — Implement DB cache lookup in `jit-sync.ts`.
- [ ] [Review][Patch] In-Memory Cache Poisoning via Object Mutation — Avoid mutating the cached `response` object directly in `jit-sync.ts`.
- [ ] [Review][Patch] Dangerous DB Migration Auto-Accept Script — Fix or remove `generate_expect.exp` which blindly answers "yes" to Drizzle prompts.
- [ ] [Review][Patch] Ungraceful Shutdown of BullMQ Workers — `await cryptoWorker.close()` and ensure BullMQ `Queue` instances are also closed during shutdown.
- [ ] [Review][Patch] Job Scheduling Race Condition on Startup — Do not invoke schedulers directly on startup without handling clusters.
- [ ] [Review][Patch] Missing Unhandled Error Listener on Redis Connection — Attach an `.on(error)` handler to `IORedis`.
- [ ] [Review][Patch] Missing API Response Structure Validation & Unsafe Array Assumption — Validate DeFiLlama response format and handle `SyntaxError` on WAF/CDN HTML responses.
- [ ] [Review][Patch] Potential PostgreSQL UPSERT Failure on Duplicate Slugs — Ensure unique slugs in batch inserts.
- [ ] [Review][Patch] Numeric Field Overflow from Unbounded External Data — Validate and bound `tvl` and `apy` values before insertion.
- [ ] [Review][Patch] Silent Failure of Schedulers on Redis Outage — Handle and retry scheduling if Redis is unavailable at startup.
- [ ] [Review][Patch] Duplicate Imports — Remove duplicate `dedupedFetch` import in `jit-sync.ts`.
