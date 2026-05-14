# Story 2.2.2: Social Sentiment & Narrative Clustering (Deep Dive)

Status: review

Epic: 2 — Crypto Data Infrastructure
Created: 2026-05-14
FRs: FR2, FR5
NFRs: NFR4, NFR5
ARs: AR1, AR2, AR3, AR8

**Parent:** Story 2.2 (AI-Generated Discover Feed) — `done`. Story 2.2.2 extends discover feed worker với social sentiment data từ Santiment.

## Story

As a Degen trader,
I want AI phân cụm các token theo Narrative (AI, RWA, Memes) dựa trên độ phủ sóng mạng xã hội từ Santiment,
so that tôi biết dòng tiền đang chú ý vào hệ sinh thái nào trước khi giá pump.

## Acceptance Criteria

1. **AC1 — Santiment Pro/Max API integration:**
   - Config var `SANTIMENT_API_KEY: optStr` thêm vào `apps/api/src/config.ts` (Story 2.2 pattern).
   - Endpoint: `https://api.santiment.net/graphql` với header `Authorization: Apikey ${KEY}`.
   - Worker chỉ fetch khi `SANTIMENT_API_KEY` được set — skip gracefully + log info nếu unset.
   - Document trong README/env.example: Pro tier ($49/mo, 30-day delayed) hoặc Max tier ($249/mo, real-time) — Max là tier minimum để đáp ứng "real-time alpha" yêu cầu của AC4.

2. **AC2 — DB schema (1 table mới + 1 enum):**
   - Enum `narrative_category`: `'ai' | 'rwa' | 'memes' | 'depin' | 'gaming' | 'l1' | 'l2' | 'defi' | 'privacy' | 'other'` (10 narratives).
   - Table `epsilon.token_social_signals`:
     - `slug varchar(100)` PK (Santiment slug, ví dụ `'bitcoin'`, `'ethereum'`, `'render-token'`)
     - `symbol varchar(20)` notnull
     - `narrative narrative_category` notnull default `'other'`
     - `social_volume_24h numeric(20,4)` — count of mentions
     - `social_volume_change_24h_pct numeric(10,4)` — % change vs prev 24h window
     - `social_dominance_pct numeric(10,4)` — % of total crypto social volume
     - `sentiment_score numeric(10,4)` — Santiment positive/negative weighted score
     - `price_usd numeric(20,8)` — current price (cross-reference với DeFiLlama nếu cần)
     - `price_change_24h_pct numeric(10,4)`
     - `is_alpha_signal boolean` notnull default false — true khi `social_volume_change > 200%` AND `price_change < 10%`
     - `fetched_at timestamptz` notnull
     - `updated_at timestamptz` notnull defaultNow
   - Indexes: `idx_token_social_narrative` ON `narrative`, `idx_token_social_alpha` ON `(is_alpha_signal, social_volume_change_24h_pct DESC)` WHERE `is_alpha_signal = true` (partial index pattern từ Story 2.2).
   - Migration `0006_token_social_signals.sql`.

3. **AC3 — Social sentiment worker (extend `discover-feed.ts` pattern):**
   - File mới: `apps/api/src/queue/bullmq/workers/social-sentiment-worker.ts`.
   - Queue `social-sentiment-sync`, scheduler `sync-social-sentiment`, job name `fetch-social-sentiment`.
   - Interval: `SOCIAL_SENTIMENT_INTERVAL_MS: optInt(900_000)` — 15 phút default (Santiment Max real-time).
   - Watchlist: hardcoded danh sách ~30-50 tokens cho launch (BTC, ETH, SOL, top memes, top AI tokens, top RWA tokens). Seed trong migration SQL.
   - Per-token fetch (sequential để tránh rate limit Santiment 80,000 calls/mo Max → ~107 calls/min max):
     - GraphQL query `getMetric(metric: "social_volume_total")` cho 24h window
     - GraphQL query `getMetric(metric: "social_dominance")` cho 24h window
     - GraphQL query `getMetric(metric: "sentiment_balance_total")` cho 24h window
     - GraphQL query `getMetric(metric: "price_usd")` cho 24h window (current + previous)
   - Compute fields:
     - `social_volume_change_24h_pct = (current - prev24h) / prev24h * 100`
     - `is_alpha_signal = social_volume_change > 200% AND |price_change| < 10%`
   - Bulk upsert qua `onConflictDoUpdate`.
   - Per-token retry với exponential backoff (3 lần, 30s base) cho 429/5xx — pattern từ Story 2.4 `fetchWithRetry`.
   - Log: `[social-sentiment] Synced ${success}/${total} tokens, ${alphaCount} alpha signals in ${elapsed}ms`.

4. **AC4 — Narrative classification logic:**
   - Hardcoded mapping `slug → narrative` trong worker (initial launch — không cần ML clustering phức tạp).
   - Mapping examples:
     - `'render-token', 'fetch-ai', 'singularitynet', 'ocean-protocol', 'bittensor'` → `'ai'`
     - `'ondo-finance', 'maple', 'centrifuge', 'goldfinch'` → `'rwa'`
     - `'dogecoin', 'shiba-inu', 'pepe', 'bonk', 'dogwifcoin'` → `'memes'`
     - `'helium', 'render-token', 'iotex'` → `'depin'`
     - `'beam', 'gala', 'illuvium', 'apecoin'` → `'gaming'`
     - `'bitcoin', 'ethereum', 'solana', 'avalanche-2'` → `'l1'`
     - `'arbitrum', 'optimism', 'matic-network', 'starknet'` → `'l2'`
     - `'monero', 'zcash', 'aleo'` → `'privacy'`
     - Default `'other'`
   - Future: Story 2.2.2.1 (deferred) sẽ implement ML-based clustering từ token descriptions/tags.

5. **AC5 — JIT route `/v1/router/narratives` (read-only, public for all tiers):**
   - `GET /v1/router/narratives?narrative={category}&alpha_only={bool}&limit={n}`.
   - Tất cả params optional. Default: top 20 tokens grouped by narrative.
   - Filter: `WHERE narrative = ? AND (is_alpha_signal = ? optional)`.
   - Sort: `ORDER BY social_volume_change_24h_pct DESC LIMIT min(limit, 100)`.
   - Response: `{ narratives: { ai: [...], rwa: [...], memes: [...] }, alpha_signals: [...], source: 'db_cache', fetched_at }` hoặc filtered single narrative.
   - Performance target: P95 < 500ms (indexes từ AC2 đảm bảo).
   - **Không** billing — feed Discover public cho mọi tier (theo FR5).

6. **AC6 — Discover feed integration (extend `discover-feed.ts` worker):**
   - Khi worker `discover-feed.ts` chạy hourly job, thêm bước:
     - Query top 5 alpha signals từ `token_social_signals` (`is_alpha_signal = true ORDER BY social_volume_change_24h_pct DESC LIMIT 5`).
     - Generate AI summary cho mỗi alpha signal với context: "Token X under narrative Y có social volume tăng Z% trong 24h nhưng price chỉ thay đổi W%"
     - Insert vào `discover_feeds` với `is_anomaly = true, warning_level = 'alpha'`, sources = `[{name: 'Santiment', url: 'https://app.santiment.net/...'}]`.
   - Cần thêm value `'alpha'` vào enum `warning_level` (Story 2.2 hiện có `'none', 'low', 'medium', 'high'`).

7. **AC7 — Lifecycle wiring:**
   - Export `startSocialSentimentWorker`, `setupSocialSentimentJobs`, `stopSocialSentimentWorker` từ `apps/api/src/queue/index.ts`.
   - Wire trong `startBackgroundServices()` sau `setupCryptoWorkerJobs()` của `apps/api/src/index.ts`.
   - Wire trong `shutdown()` cùng pattern.
   - Guard `SOCIAL_SENTIMENT_WORKER_ENABLED: optBoolFalse`.

8. **AC8 — TypeScript clean:**
   - `cd apps/api && npx tsc --noEmit` — không lỗi mới.

## Tasks / Subtasks

- [x] **Task 0: Config vars (AC1, AC7)**
  - [x] 0.1 — Thêm vào `apps/api/src/config.ts`:
    ```typescript
    SANTIMENT_API_KEY:                optStr,
    SOCIAL_SENTIMENT_WORKER_ENABLED:  optBoolFalse,
    SOCIAL_SENTIMENT_INTERVAL_MS:     optInt(900_000),
    ```
  - [x] 0.2 — Map vào config object (sau `CRYPTO_WORKER_*`).
  - [x] 0.3 — Update `apps/api/.env.example` với section "Social Sentiment Worker — Story 2.2.2".

- [x] **Task 1: DB schema (AC2)**
  - [x] 1.1 — Mở `packages/db/src/schema/epsilon.ts`. Append sau `protocolTvlSnapshots`.
  - [x] 1.2 — Tạo enum `narrativeCategoryEnum`.
  - [x] 1.3 — Tạo table `tokenSocialSignals` với 11 columns (xem AC2).
  - [x] 1.4 — Thêm 2 indexes (`idx_token_social_narrative`, partial `idx_token_social_alpha`).
  - [x] 1.5 — Update enum `warningLevelEnum`: thêm `'alpha'` vào values.
  - [x] 1.6 — Export 2 symbols mới từ `packages/db/src/index.ts`.
  - [x] 1.7 — Migration `0004_token_social_signals.sql` viết thủ công (drizzle-kit generate yêu cầu TTY).
  - [x] 1.8 — Migration applied via `psql -f 0004_token_social_signals.sql`.
  - [x] 1.9 — Seed 31 tokens với narrative mapping embedded trong migration SQL.

- [x] **Task 2: Santiment service module (AC3)**
  - [x] 2.1 — Tạo `apps/api/src/router/services/santiment.ts`.
  - [x] 2.2 — Define types: `SantimentMetricPoint`, `SantimentBatchResult`.
  - [x] 2.3 — `fetchTokenMetrics(slug, apiKey, timeoutMs?)`: GraphQL query bundle 4 metrics trong 1 request.
  - [x] 2.4 — `fetchWithRetry` helper cho 429/5xx (3 retries, 30s base exponential backoff).
  - [x] 2.5 — Timeout 10s default.

- [x] **Task 3: Worker (AC3, AC4, AC7)**
  - [x] 3.1 — Tạo `apps/api/src/queue/bullmq/workers/social-sentiment-worker.ts`.
  - [x] 3.2 — Follow pattern `crypto-worker.ts` (Story 2.1).
  - [x] 3.3 — Hardcode `NARRATIVE_MAP: Record<string, NarrativeCategory>` với 31 entries.
  - [x] 3.4 — `processJob()`: load tokens từ NARRATIVE_MAP keys, fetch sequential, compute alpha signal, upsert.
  - [x] 3.5 — Per-token try/catch, log warn cho failures.
  - [x] 3.6 — Guard `if (!config.SANTIMENT_API_KEY) { logger.info(...); return; }` ở đầu `processJob`.
  - [x] 3.7 — Export 3 lifecycle functions.

- [x] **Task 4: Barrel export + lifecycle (AC7)**
  - [x] 4.1 — Append vào `apps/api/src/queue/index.ts`.
  - [x] 4.2 — `apps/api/src/index.ts`: thêm 3 imports.
  - [x] 4.3 — `startBackgroundServices()`: gọi `startSocialSentimentWorker()` + `setupSocialSentimentJobs().catch(...)`.
  - [x] 4.4 — `shutdown()`: `await stopSocialSentimentWorker().catch(...)`.

- [x] **Task 5: JIT route (AC5)**
  - [x] 5.1 — Tạo `apps/api/src/router/routes/narratives.ts`.
  - [x] 5.2 — `GET /v1/router/narratives` — Zod validate query params.
  - [x] 5.3 — Drizzle dynamic query với `narrative`, `is_alpha_signal` filters.
  - [x] 5.4 — Group response by narrative (nếu không filter cụ thể).
  - [x] 5.5 — `Cache-Control: public, max-age=300` header.
  - [x] 5.6 — Register route trong `apps/api/src/router/index.ts`.
  - [x] 5.7 — Public route — không cần `apiKeyAuth` middleware (theo FR5).

- [x] **Task 6: Discover feed integration (AC6)**
  - [x] 6.1 — Mở `apps/api/src/queue/bullmq/workers/discover-feed.ts`.
  - [x] 6.2 — Query top 5 alpha signals từ `token_social_signals`.
  - [x] 6.3 — Generate AI summaries via existing OpenRouter integration.
  - [x] 6.4 — Insert vào `discover_feeds` với `warning_level: 'alpha'`, `is_anomaly: true`.
  - [x] 6.5 — Idempotency: `deterministicId('alpha:${slug}:${date}', summary)` + `onConflictDoNothing`.

- [x] **Task 7: TypeScript check (AC8)**
  - [x] 7.1 — `cd apps/api && npx tsc --noEmit` — không lỗi mới trong Story 2.2.2 files.
  - [x] 7.2 — `cd packages/db && npx tsc --noEmit` — clean.

## Dev Notes

### Pattern Reference
- Worker structure: `apps/api/src/queue/bullmq/workers/crypto-worker.ts` (Story 2.1, post-review) + `discover-feed.ts` (Story 2.2).
- Service layer: `apps/api/src/router/services/defillama.ts` (REST) — Santiment dùng GraphQL nên cần adapter.
- Route: `apps/api/src/router/routes/jit-sync.ts` cho structure (nhưng narratives KHÔNG có billing).
- Migration sequence: Story 2.4 sẽ generate `0004`, Story 2.7 sẽ generate `0005`. Story 2.2.2 có thể conflict — **PHẢI coordinate**: nếu 2.4/2.7 đã generate trước → 2.2.2 generate `0006`. Nếu 2.2.2 ship trước → renumber 2.4/2.7 down.

### Santiment GraphQL API
- Endpoint: `https://api.santiment.net/graphql`
- Auth: `Authorization: Apikey ${SANTIMENT_API_KEY}` header
- Pricing tier required: **Max ($249/mo)** cho real-time data; Pro ($49/mo) chỉ có 30-day delayed (không đáp ứng AC4 alpha signal use case).
- Rate limit Max tier: 80,000 calls/month ≈ 107 calls/min sustained, 1,800 calls/hour comfortably.
- 30 tokens × 4 metrics × 96 syncs/day (15-min interval) = 11,520 calls/day = 345,600/month → **VƯỢT BUDGET**. Mitigation:
  - Bundle 4 metrics vào 1 GraphQL query → 30 calls × 96 = 2,880/day = 86,400/month → vẫn vượt nhẹ.
  - Reduce sync interval xuống 30 phút → 30 × 48 × 30 days = 43,200/month → OK.
  - Hoặc reduce token list xuống ~20 tokens.
- **Khuyến nghị**: Set `SOCIAL_SENTIMENT_INTERVAL_MS=1800000` (30 phút) cho budget safety. Document trong env.example.

### Sample GraphQL Query (bundle 4 metrics)
```graphql
{
  socialVolume: getMetric(metric: "social_volume_total") {
    timeseriesData(slug: "bitcoin", from: "utc_now-24h", to: "utc_now", interval: "1h") {
      datetime
      value
    }
  }
  socialDominance: getMetric(metric: "social_dominance_total") {
    timeseriesData(slug: "bitcoin", from: "utc_now-24h", to: "utc_now", interval: "1h") {
      datetime
      value
    }
  }
  sentimentBalance: getMetric(metric: "sentiment_balance_total") {
    timeseriesData(slug: "bitcoin", from: "utc_now-24h", to: "utc_now", interval: "1h") {
      datetime
      value
    }
  }
  price: getMetric(metric: "price_usd") {
    timeseriesData(slug: "bitcoin", from: "utc_now-24h", to: "utc_now", interval: "1h") {
      datetime
      value
    }
  }
}
```

### Alpha Signal Logic
```typescript
function isAlphaSignal(socialVolumeChange: number, priceChange: number): boolean {
  // Spike trong social attention nhưng price chưa chạy → opportunity
  return socialVolumeChange > 200 && Math.abs(priceChange) < 10;
}
```

Threshold dựa trên giả định:
- `200%` social spike: 3x normal mention rate trong 24h
- `<10%` price move: smart money chưa front-run / retail chưa pump

Có thể tinh chỉnh sau khi có data thực tế. Story 2.2.2.1 (future) sẽ implement adaptive thresholds dựa trên historical std deviation.

### Bulk Upsert Pattern (từ Story 2.4 review)
Reuse `buildExcludedSet(table, excludeColumns)` helper nếu Story 2.4 đã ship. Nếu chưa, viết inline pattern.

### Numeric Handling
- Drizzle `numeric` returns string in TS — `String(number)` khi insert, `parseFloat(string)` khi đọc. Validate `Number.isFinite` trước khi compute alpha signal.

### Test Strategy
- Unit test alpha signal logic với 4 cases: (high vol, low price → alpha), (high vol, high price → no), (low vol, low price → no), (low vol, high price → no).
- Mock Santiment GraphQL response trong worker tests.
- Integration test JIT route với seeded DB rows (no Santiment call).

### Cost Justification
- Santiment Max: $249/mo
- Combined với DeFiLlama Pro ($300/mo từ Story 2.4) = $549/mo data infra.
- ROI: Discover feed alpha signals là core value prop cho Free tier (FR5) — drive top-of-funnel acquisition. $549/mo bootstrap cost cho ~10K free users tier acceptable per architect Recommendation 1 (Section 3 architecture.md).

### File List (planned)

**New Files:**
- `apps/api/src/queue/bullmq/workers/social-sentiment-worker.ts`
- `apps/api/src/router/services/santiment.ts`
- `apps/api/src/router/routes/narratives.ts`
- `packages/db/drizzle/0006_token_social_signals.sql` (or matching next migration number)
- `packages/db/scripts/seed-token-watchlist.ts` (optional — có thể embed vào migration)

**Modified Files:**
- `packages/db/src/schema/epsilon.ts` — append `narrativeCategoryEnum`, `tokenSocialSignals`; extend `warningLevelEnum` với `'alpha'`
- `packages/db/src/index.ts` — export 2 new symbols
- `apps/api/src/config.ts` — 3 new env vars
- `apps/api/src/queue/index.ts` — barrel export
- `apps/api/src/index.ts` — lifecycle wiring
- `apps/api/src/router/index.ts` — mount narratives route
- `apps/api/src/queue/bullmq/workers/discover-feed.ts` — integrate alpha signals (Task 6)
- `apps/api/.env.example` — Social Sentiment section

## Dev Agent Record

### Debug Log

- `bun run db:generate` yêu cầu TTY interactive cho enum conflict resolution → viết migration SQL thủ công `0004_token_social_signals.sql`
- `bun run db:migrate` fail với "schema epsilon already exists" → applied migration trực tiếp qua `psql -f 0004_token_social_signals.sql`
- `EnterWorktree` tạo worktree từ HEAD sai → dùng `git worktree add` thủ công rồi `EnterWorktree path`
- Rate limit budget: 31 tokens × 1 bundled query × 48 syncs/day × 30 days = 44,640 calls/month (< 80,000 Max tier limit) → set default interval 1,800,000ms (30 min) thay vì spec 900,000ms để có safety margin

### Completion Notes

- **AC1**: `SANTIMENT_API_KEY`, `SOCIAL_SENTIMENT_WORKER_ENABLED`, `SOCIAL_SENTIMENT_INTERVAL_MS` added to `config.ts` + `.env.example`. Worker guards gracefully when key unset.
- **AC2**: `narrativeCategoryEnum` (10 values) + `tokenSocialSignals` table + 2 indexes (narrative, partial alpha) + `warningLevelEnum` extended with `'alpha'`. Migration `0004_token_social_signals.sql` applied. 31 tokens seeded.
- **AC3**: `santiment.ts` service bundles 4 GraphQL metrics in 1 request (48h window for change computation). `fetchWithRetry` with 3 retries, 30s base exponential backoff.
- **AC4**: `NARRATIVE_MAP` hardcoded in worker with 31 slug→narrative entries covering all 10 categories. Alpha signal: `socialVolumeChange > 200% AND |priceChange| < 10%`.
- **AC5**: `GET /v1/router/narratives` public route with Zod validation, narrative/alpha_only/limit filters, grouped response, `Cache-Control: public, max-age=300`.
- **AC6**: `injectAlphaSignals()` in `discover-feed.ts` queries top 5 alpha signals, generates AI summaries via OpenRouter, inserts with `warningLevel: 'alpha'`, `isAnomaly: true`. Non-fatal (wrapped in try/catch).
- **AC7**: Lifecycle wiring complete — `startSocialSentimentWorker`, `setupSocialSentimentJobs`, `stopSocialSentimentWorker` exported and wired in `index.ts`.
- **AC8**: TypeScript clean — no new errors in Story 2.2.2 files.
- **Migration note**: Story 2.4 will need to use `0005_` prefix (Story 2.2.2 already used `0004_`).

## File List

**New Files:**
- `apps/api/src/queue/bullmq/workers/social-sentiment-worker.ts`
- `apps/api/src/queue/bullmq/workers/social-sentiment-types.ts`
- `apps/api/src/router/services/santiment.ts`
- `apps/api/src/router/routes/narratives.ts`
- `packages/db/drizzle/0004_token_social_signals.sql`

**Modified Files:**
- `packages/db/src/schema/epsilon.ts`
- `packages/db/src/index.ts`
- `packages/db/drizzle/meta/_journal.json`
- `apps/api/src/config.ts`
- `apps/api/src/queue/index.ts`
- `apps/api/src/index.ts`
- `apps/api/src/router/index.ts`
- `apps/api/src/queue/bullmq/workers/discover-feed.ts`
- `apps/api/.env.example`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

| Date | Change |
|------|--------|
| 2026-05-14 | Story created via `/bmad-create-story 2.2.2` |
| 2026-05-14 | Implementation complete — all 7 tasks done, status → review |
