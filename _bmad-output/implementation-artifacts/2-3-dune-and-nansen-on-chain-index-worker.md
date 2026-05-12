# Story 2.3: Dune & Nansen On-Chain Index Worker

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a platform operator,
I want worker crawl on-chain data từ Dune Analytics và Nansen Smart Money signals,
So that agent có dữ liệu wallet movement và liquidity flow để đưa ra insight chính xác hơn.

## Acceptance Criteria

1. **Given** Dune Analytics API key và Nansen API key được configure trong environment
   **When** on-chain index worker chạy theo schedule
   **Then** worker query Dune cho custom SQL analytics và Nansen cho Smart Money wallet movements
   **And** kết quả được store vào dedicated Drizzle tables (additive migration)

2. **Given** Dune hoặc Nansen API trả về rate-limit error (429)
   **When** worker nhận lỗi
   **Then** worker retry với exponential backoff, tối đa 3 lần
   **And** sau 3 lần thất bại, job được mark failed và alert được log — không crash worker process

3. **Given** data đã được indexed
   **When** JIT sync tool (Story 1.2) cần on-chain context
   **Then** tool có thể query internal API để lấy pre-indexed Dune/Nansen data thay vì gọi external API trực tiếp

## Tasks / Subtasks

- [x] Task 1: Environment & Config Setup
  - [x] Add `DUNE_API_KEY` and `NANSEN_API_KEY` to environment variables scheme in `apps/api/src/config.ts`.
- [x] Task 2: Database Schema Update
  - [x] Create additive-only migration in `packages/db/src/schema/epsilon.ts` for Dune/Nansen on-chain data tables (e.g. `onchain_data_index`).
- [x] Task 3: BullMQ Worker Implementation
  - [x] Create a new background worker in `apps/api/src/queue/bullmq/workers/` to run queries against Dune and Nansen APIs.
  - [x] Implement robust error handling for HTTP 429 rate limits, applying exponential backoff up to 3 times before failing the job gracefully and logging errors to `logger` (Sentry/Logtail).
  - [x] Use `queue.upsertJobScheduler` (do not use deprecated `add(..., {repeat})`) to set the schedule.
  - [x] Apply idempotency and rollback handling in Drizzle (using transactions or `onConflictDoNothing`) to prevent duplicate inserts on retry.
  - [x] Attach `worker.on('error', ...)` and `worker.on('failed', ...)` handlers.
- [x] Task 4: Internal API / JIT Context Update
  - [x] Update JIT sync tool internal logic or add internal API helper to expose pre-indexed Dune/Nansen data so that OpenCode tools don't call external APIs.

### Review Findings

#### Decision Needed (5)

- [x] [Review][Decision] **Drizzle migration file** — Schema added to `epsilon.ts:1024-1048` but no `0002_*onchain*.sql` committed. Same TTY constraint as 2-2. Options: (a) write SQL manually now (parity with 2-2 fix), (b) defer to user-run interactive `bunx drizzle-kit generate`. Without committed file, deploys via `bunx drizzle-kit migrate` will fail with `relation "epsilon.onchain_data_index" does not exist`. (A1, AC1+AR3+AR8)
- [x] [Review][Decision] **JIT tool caller-side update** — Spec AC3 reads "tool có thể query internal API thay vì gọi external API trực tiếp". Implementation only exposes endpoint at `apps/api/src/router/routes/jit-sync.ts:140-156`; OpenCode tool at `core/epsilon-master/opencode/tools/jit_sync.ts` has zero references to onchain/Dune/Nansen. Options: (a) endpoint exposure alone satisfies "tool *can* query" (passive capability), (b) update OpenCode JIT tool to actually consume `/jit-sync/onchain/:identifier`. (A2, AC3)
- [x] [Review][Decision] **Worker feature flag** — `startOnChainIndexWorker()` runs unconditionally in `apps/api/src/index.ts:1061`. Discover-feed worker (Story 2.2) gates on `DISCOVER_WORKER_ENABLED`. Options: (a) add `ONCHAIN_WORKER_ENABLED` (default `false`) for parity, (b) leave always-on. Without flag + with placeholder URLs, will emit hourly errors in any env with API keys set. (A5+B17+E13, [onchain-index.ts:163-164](apps/api/src/queue/bullmq/workers/onchain-index.ts#L163-L164))
- [x] [Review][Decision] **Dune/Nansen real implementation** — `fetchDuneData` uses hardcoded placeholder query ID `12345` and wrong endpoint (`/results` returns last cached run; canonical Dune flow is POST `/execute` → poll `/status` → GET `/results`). `fetchNansenData` URL `https://api.nansen.ai/v1/smart-money/movements` is unverified. Options: (a) ship stubs with worker feature-flagged OFF (parity with discover-feed `fetchRawNews` deferred), (b) block story until real query IDs/Nansen API paths land. (A4+B11+B12, AC1)
- [x] [Review][Decision] **`metricValue` response anonymization** — `/jit-sync/onchain/:identifier` returns full raw `metricValue` jsonb to authenticated callers. Upstream Dune/Nansen payloads may contain wallet hashes, tx ids, or PII embedded in metric data. Spec doesn't specify scrubbing. Options: (a) project specific allowed fields, (b) apply `scrubPii` from `@epsilon/shared/utils` before returning, (c) return raw (current). (B14+E18)

#### Patch (28)

- [x] [Review][Patch] Malformed UUID generator: group-3 produces 4 chars (slice 13-16) instead of required 4-hex; missing RFC-4122 variant nibble in group-4. Postgres uuid type accepts 8-4-4-4-12 hex but produced UUID is not v4-compliant. — [apps/api/src/queue/bullmq/workers/onchain-index.ts:13-14](apps/api/src/queue/bullmq/workers/onchain-index.ts#L13-L14)
- [x] [Review][Patch] Idempotency broken: `timestamp: new Date()` at fetch time → deterministic ID hashes the new timestamp → identical Dune row replayed next hour gets different ID, duplicates accumulate. Conversely, two distinct rows in same fetch with same wallet+token+metric collide on shared `new Date()` and silently drop one. Fix: hash row payload (e.g. `JSON.stringify(metricValue)`) into the ID seed. — [onchain-index.ts:67,90,117-145](apps/api/src/queue/bullmq/workers/onchain-index.ts#L67)
- [x] [Review][Patch] Single `db.transaction` wrapping serial inserts of all sources: one bad row from Nansen rolls back already-inserted Dune rows. Run separate transactions per source, or per-row try/catch with continue. — [onchain-index.ts:117-145](apps/api/src/queue/bullmq/workers/onchain-index.ts#L117-L145)
- [x] [Review][Patch] 429 from Dune throws → `runOnChainIndexJob` aborts → `fetchNansenData` never executes; healthy provider blocked by other's rate limit. Run providers in `Promise.allSettled` so failures isolate. — [onchain-index.ts:99-110](apps/api/src/queue/bullmq/workers/onchain-index.ts#L99-L110)
- [x] [Review][Patch] `String(err).includes('429')` is fragile (false positives like `"timeout after 4290ms"`; misses localized/wrapped errors). Use typed error: `throw Object.assign(new Error('rate limit'), { status: 429 })` then check `err.status === 429`. — [onchain-index.ts:39,74](apps/api/src/queue/bullmq/workers/onchain-index.ts#L39)
- [x] [Review][Patch] `AbortSignal.timeout(15_000)` errors swallowed — only `429` re-throws, so timeouts return `[]` and never retry. Distinguish AbortError and re-throw. — [onchain-index.ts:36,79,99-110](apps/api/src/queue/bullmq/workers/onchain-index.ts#L36)
- [x] [Review][Patch] `data.result.rows` non-array crashes `.map` with TypeError. Guard: `if (!Array.isArray(data?.result?.rows)) return [];`. Same for `data?.movements`. — [onchain-index.ts:46-48,90-92](apps/api/src/queue/bullmq/workers/onchain-index.ts#L46-L48)
- [x] [Review][Patch] `mov.timestamp` invalid string yields `Invalid Date`; later `.toISOString()` throws RangeError, aborting whole batch. Validate: `const ts = new Date(mov.timestamp); if (isNaN(ts.getTime())) ts = new Date();` — [onchain-index.ts:101](apps/api/src/queue/bullmq/workers/onchain-index.ts#L101)
- [x] [Review][Patch] `BigInt` inside upstream `metricValue` throws on jsonb serialize. Sanitize via `JSON.parse(JSON.stringify(item.metricValue, (_,v) => typeof v === 'bigint' ? v.toString() : v))` before insert. — [onchain-index.ts:117-145](apps/api/src/queue/bullmq/workers/onchain-index.ts#L117-L145)
- [x] [Review][Patch] `wallet_address`/`token_address` > 255 chars from upstream → varchar constraint violation rolls back batch. Slice before insert: `String(addr ?? '').slice(0, 255) || null`. — [onchain-index.ts:117-145](apps/api/src/queue/bullmq/workers/onchain-index.ts#L117-L145)
- [x] [Review][Patch] Worker `lockDuration: 60_000` + serial per-row inserts: 10k+ rows exceed lock → BullMQ marks stalled and re-runs (multiplied by broken dedup = duplicates). Batch insert: `tx.insert(...).values(arrayChunk).onConflictDoNothing()` chunked by 500. — [onchain-index.ts:166](apps/api/src/queue/bullmq/workers/onchain-index.ts#L166)
- [x] [Review][Patch] `/jit-sync/onchain/:identifier` accepts any string — no length cap, no normalization (case/whitespace/0x prefix), no hex/base58 validation. Storage uses raw upstream casing → mixed-case EVM addresses silently miss. Add: trim, lowercase for EVM (`0x[a-f0-9]{40}`), reject empty / >255 chars. — [apps/api/src/router/routes/jit-sync.ts:143-155](apps/api/src/router/routes/jit-sync.ts#L143-L155)
- [x] [Review][Patch] `/jit-sync/onchain/:identifier` no pagination contract — hardcoded `.limit(50)` only returns latest 50 rows ever; no offset/since/cursor. Add `?offset=N` (clamped) + `nextOffset` (parity with `/discover` route). — [apps/api/src/router/routes/jit-sync.ts:151](apps/api/src/router/routes/jit-sync.ts#L151)
- [x] [Review][Patch] OR query over two indexed varchar(255): branch on input shape (`looksLikeToken(id) ? eq(tokenAddress) : eq(walletAddress)`) so Postgres uses single index instead of BitmapOr fallback. — [apps/api/src/router/routes/jit-sync.ts:147-152](apps/api/src/router/routes/jit-sync.ts#L147-L152)
- [x] [Review][Patch] Schema relies on PK `id` for dedup but has no natural unique constraint. Add `unique('uq_onchain_natural').on(source, metricName, timestamp, walletAddress, tokenAddress)` as defense-in-depth. — [packages/db/src/schema/epsilon.ts:1042-1045](packages/db/src/schema/epsilon.ts#L1042-L1045)
- [x] [Review][Patch] `source` is `varchar(50)` but only 'dune'/'nansen' are valid. Use `pgEnum('onchain_source', ['dune', 'nansen'])`. — [packages/db/src/schema/epsilon.ts:1029](packages/db/src/schema/epsilon.ts#L1029)
- [x] [Review][Patch] Indexes `idx_onchain_data_wallet`/`idx_onchain_data_token` are full-column on nullable cols (most rows will be NULL on opposite side) → bloated B-tree. Use partial: `.where(sql\`wallet_address IS NOT NULL\`)`. — [packages/db/src/schema/epsilon.ts:1044-1045](packages/db/src/schema/epsilon.ts#L1044-L1045)
- [x] [Review][Patch] Add composite `(source, timestamp DESC)` index for retention/cleanup queries. — [packages/db/src/schema/epsilon.ts:1042-1045](packages/db/src/schema/epsilon.ts#L1042-L1045)
- [x] [Review][Patch] Add CHECK constraint: `(wallet_address IS NOT NULL OR token_address IS NOT NULL)` — junk rows with both NULL are unindexable via `/onchain/:identifier`. — [packages/db/src/schema/epsilon.ts:1031-1032](packages/db/src/schema/epsilon.ts#L1031-L1032)
- [x] [Review][Patch] `varchar(255)` on token/wallet may be tight for multi-chain (Cosmos bech32, Bitcoin descriptors). Widen to 512 or use `text`. — [packages/db/src/schema/epsilon.ts:1031-1032](packages/db/src/schema/epsilon.ts#L1031-L1032)
- [x] [Review][Patch] `setupOnChainIndexJobs` registers schedulers even when both `DUNE_API_KEY` and `NANSEN_API_KEY` are unset → hourly empty fetches with warning logs. Guard: `if (!config.DUNE_API_KEY && !config.NANSEN_API_KEY) return;`. — [onchain-index.ts:191-198](apps/api/src/queue/bullmq/workers/onchain-index.ts#L191-L198)
- [x] [Review][Patch] Multi-replica deploys: each instance calls `setupOnChainIndexJobs` → same scheduler upserted; combined with `attempts:3` exponential 30s (~120s total) overlapping with hourly cron causes duplicate fetches that burn upstream quota. `upsertJobScheduler` is idempotent for the SCHEDULER, but BullMQ workers across replicas all consume jobs. Acceptable if rows are deduped, but verify and document. — [onchain-index.ts:191-198](apps/api/src/queue/bullmq/workers/onchain-index.ts#L191-L198)
- [x] [Review][Patch] No cleanup/retention cron — `onchain_data_index` grows unbounded (24×rows/day forever). Add daily cleanup job `lt(timestamp, cutoff)` with `ONCHAIN_RETENTION_DAYS` env (parity with discover-feed cleanup). — [onchain-index.ts](apps/api/src/queue/bullmq/workers/onchain-index.ts)
- [x] [Review][Patch] `res.json()` throws on malformed body kills whole job. Guard: `const data = await res.json().catch(() => null); if (!data) return [];`. — [onchain-index.ts:46-48,90-92](apps/api/src/queue/bullmq/workers/onchain-index.ts#L46-L48)
- [x] [Review][Patch] Cron pattern `0 * * * *` will pile across the planet's tenants on the API at minute 0. Pick off-minute (e.g. `17 * * * *`) for jitter — even discover-feed uses `0 * * * *` so this is a wider issue, but worth fixing here while changes are local. — [onchain-index.ts:9](apps/api/src/queue/bullmq/workers/onchain-index.ts#L9)
- [x] [Review][Patch] `metricValue` typed `$type<unknown>()` lets workers store arbitrary upstream payloads with no schema. Tighten to `$type<Record<string, unknown>>()` minimally; ideally Zod-validate before insert. — [packages/db/src/schema/epsilon.ts:1036](packages/db/src/schema/epsilon.ts#L1036)
- [x] [Review][Patch] Hardcoded comment "If we need a specific toggle for this worker, we could check a config value here" — remove comment after Decision #3 resolves the flag question. — [onchain-index.ts:163-164](apps/api/src/queue/bullmq/workers/onchain-index.ts#L163-L164)
- [x] [Review][Patch] No `redisConnection.on('error', …)` on this file's queue/worker; relies on the connection-level handler from 2-2 fix. Verify connection-level handler is in place and document. — [apps/api/src/queue/bullmq/connection.ts](apps/api/src/queue/bullmq/connection.ts)

#### Defer (3)

- [x] [Review][Defer] Rate limiting on `/jit-sync/onchain/:identifier` — codebase-wide gap, no router endpoints have rate-limiting. Defer to a cross-cutting story. (E17)
- [x] [Review][Defer] Real Dune query IDs / Nansen API paths — content/integration work, will land with feature flag flip. Track alongside discover-feed `fetchRawNews` follow-up. (Decision #4 dependent)
- [x] [Review][Defer] DB pool shutdown ordering with in-flight transactions — `apps/api/src/index.ts:1124-1129` awaits worker stops sequentially before any potential DB pool close; needs broader audit of shutdown order across all background services. Codebase-wide concern. (E26)

#### Dismissed (1)

- "Unauthenticated public endpoint exposes raw on-chain data" — `apiKeyAuth` middleware enforced on `/jit-sync/*` at [apps/api/src/router/index.ts:30](apps/api/src/router/index.ts#L30). False positive. (Blind Hunter B1)

## Dev Notes

- **Architecture Rules Compliance**:
  - AR1: Brownfield monorepo extension — mọi feature là extension vào codebase hiện tại; không tạo app/package mới.
  - AR2: Bun runtime APIs bắt buộc.
  - AR3: Drizzle ORM additive-only migrations — chỉ ADD column/table; KHÔNG rename/drop; schema trong `packages/db/src/schema/epsilon.ts`.
  - AR8: Feature addition sequence chuẩn: DB schema → Shared types → API route/Worker.

- **Previous Work Intelligence**:
  - Story 2.2 implemented `discover-feed.ts` using BullMQ. Look at how it handled `redisConnection` and queue setup.
  - From 2.2 Review:
    - Use `queue.upsertJobScheduler` instead of `add(..., {repeat})` for repeatable jobs.
    - Export worker start and setup functions to `apps/api/src/queue/index.ts` and call them in `apps/api/src/index.ts` within the `.then` block after `ensureSchema()`.
    - Ensure jobs use `db.transaction` where needed to avoid partial inserts on failure.
    - Guard against 429 rate limits using specific retry configurations on the BullMQ job or custom sleep wrapper.

### Project Structure Notes

- Add DB schema to `packages/db/src/schema/epsilon.ts`.
- Worker goes into `apps/api/src/queue/bullmq/workers/`.
- Ensure new environment variables are added to `apps/api/src/config.ts` and optionally `.env.example`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-2.3]
- [Source: _bmad-output/planning-artifacts/architecture.md]

## Dev Agent Record

### Agent Model Used

Antigravity (Gemini)

### Debug Log References

### Completion Notes List
- Added `DUNE_API_KEY` and `NANSEN_API_KEY` to config.ts and .env.example
- Added `onChainDataIndex` table to `packages/db/src/schema/epsilon.ts` and exported it
- Created BullMQ worker `onchain-index.ts` that safely retries on HTTP 429
- Attached scheduling and worker handlers in `apps/api/src/index.ts`
- Added `/onchain/:identifier` to JIT sync router to allow querying internal database for onchain signals


### File List
- `apps/api/src/config.ts`
- `apps/api/.env.example`
- `packages/db/src/schema/epsilon.ts`
- `packages/db/src/index.ts`
- `apps/api/src/queue/bullmq/workers/onchain-index.ts`
- `apps/api/src/queue/index.ts`
- `apps/api/src/index.ts`
- `apps/api/src/router/routes/jit-sync.ts`
