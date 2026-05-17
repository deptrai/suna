# Story 2.3.1: VIP API Smart Money Flow & Token God Mode

Status: review

Epic: 2 — Crypto Data Infrastructure
Created: 2026-05-17
FRs: FR2, FR5, FR8, FR9
NFRs: NFR4, NFR5, NFR8, NFR9
ARs: AR1, AR2, AR3, AR5, AR6, AR8

**Parent:** Story 2.3 (Dune & Nansen On-Chain Index Worker) — `done`. Story 2.3.1 deepens the existing on-chain indexer with Nansen Smart Money and Token God Mode endpoints, short-TTL cache, billing guardrails, and an Agent-safe internal API/tool boundary.

## Story

As a quant trader using Chainlens,
I want hệ thống tận dụng Nansen API cho Smart Money Flow và Token God Mode theo chain/token được cấu hình,
so that Agent có thể trả lời câu hỏi như "ví cá mập/smart money nào đang mua token này trong 1 giờ qua?" mà không để OpenCode gọi Nansen trực tiếp hoặc đốt provider credits không kiểm soát.

## Acceptance Criteria

1. **AC1 — Provider config, default-off, and cost safety:**
   - Add config in `apps/api/src/config.ts`:
     - `NANSEN_API_BASE_URL` default `https://api.nansen.ai/api/v1`.
     - `NANSEN_API_KEY` existing value remains backend-only.
     - `NANSEN_SMART_MONEY_WORKER_ENABLED` default `false`.
     - `NANSEN_SMART_MONEY_CHAINS` default `ethereum,base,arbitrum,polygon,solana`.
     - `NANSEN_SMART_MONEY_SYNC_INTERVAL_MS` default `300_000` (5 minutes) for hot-token refresh.
     - `NANSEN_SMART_MONEY_CACHE_TTL_MS` default `300_000` (5 minutes).
     - `NANSEN_SMART_MONEY_CONCURRENCY` default `1`.
     - `NANSEN_SMART_MONEY_TOP_N` default `20`.
     - `NANSEN_SMART_MONEY_LOOKBACK_HOURS` default `1` for Token God Mode top buyers/sellers.
     - `NANSEN_SMART_MONEY_MAX_LIVE_CALLS_PER_REQUEST` default `3`.
   - Worker and live route must not call Nansen if `NANSEN_SMART_MONEY_WORKER_ENABLED=false` or `NANSEN_API_KEY` is missing.
   - Startup must log skip reasons clearly and must not crash API.
   - Multi-chain is allowlist/config-driven. Do not query `all` chains by default and do not scan all Nansen-supported chains.

2. **AC2 — Nansen service wrapper with strict provider boundary:**
   - Create `apps/api/src/router/services/nansen.ts` or extend a single existing Nansen service module; do not duplicate provider clients.
   - Use `fetch` with headers:
     - `Content-Type: application/json`
     - `Accept: application/json`
     - `apikey: config.NANSEN_API_KEY`
   - Supported MVP endpoints:
     - `POST /smart-money/holdings` for aggregated smart money holdings and 24h balance changes.
     - `POST /smart-money/netflow` for Smart Money token net flows.
     - `POST /tgm/who-bought-sold` for token-specific top buyers/sellers over a date range.
     - `POST /tgm/flows` for token-specific flow trends by label such as `smart_money` and `exchange`.
   - Every provider error must be sanitized before returning to route/tool. Never return API key, full request headers, raw provider URL with secrets, or unrestricted raw payload.
   - Handle 401/403/402/429 distinctly: unconfigured/forbidden/payment-required/rate-limited are different operator actions.

3. **AC3 — Respect Nansen credit/rate-limit model:**
   - Rate-limit protection must assume current official limits of 20 requests/sec and 300 requests/minute per API key.
   - Endpoint credit model must be encoded in comments/config for developer awareness:
     - Smart Money endpoints cost 5 Nansen credits per call on Pro.
     - TGM `who-bought-sold` and `flows` cost 1 Nansen credit per call on Pro.
     - Free plan consumes 10x credits for these endpoint classes.
   - Backend Chainlens billing must charge user/internal credits only for live Nansen calls. Cache hits cost `0` unless product explicitly decides otherwise.
   - If Epic 7.1 atomic credit controls are not fully available for Tier 1, do not expose live Nansen-backed queries to Tier 1.
   - API must fall back to fresh/stale DB cache when Nansen returns 429/402/403 and cached data exists.

4. **AC4 — Dedicated normalized DB cache tables:**
   - Add additive Drizzle schema in `packages/db/src/schema/epsilon.ts`; export symbols from `packages/db/src/index.ts`.
   - Required table `nansen_smart_money_flows`:
     - `id uuid` primary key.
     - `chain varchar(32)` not null.
     - `token_address varchar(128)` not null.
     - `token_symbol varchar(64)` nullable.
     - `metric_type varchar(64)` not null: `holdings`, `netflow`, `tgm_who_bought`, `tgm_who_sold`, `tgm_flow_smart_money`, `tgm_flow_exchange`.
     - `time_window varchar(32)` not null, e.g. `1h`, `24h`, `7d`.
     - `direction varchar(32)` nullable: `inflow`, `outflow`, `buy`, `sell`, `neutral`.
     - `amount_usd numeric(24,4)` nullable.
     - `net_flow_usd numeric(24,4)` nullable.
     - `wallet_count integer` nullable.
     - `trader_count integer` nullable.
     - `top_wallets jsonb` default `[]` with sanitized address/label/volume data.
     - `flow_breakdown jsonb` default `{}`.
     - `risk_factors jsonb` default `[]`.
     - `source varchar(32)` default `nansen` not null.
     - `provider_credit_cost integer` nullable.
     - `cache_expires_at timestamptz` not null.
     - `fetched_at`, `created_at`, `updated_at` timestamps.
   - Required table `nansen_token_god_mode_cache`:
     - `id uuid` primary key.
     - `chain varchar(32)` not null.
     - `token_address varchar(128)` not null.
     - `token_symbol varchar(64)` nullable.
     - `summary jsonb` default `{}` with normalized TGM summary.
     - `top_buyers jsonb` default `[]`.
     - `top_sellers jsonb` default `[]`.
     - `smart_money_flows jsonb` default `{}`.
     - `exchange_flows jsonb` default `{}`.
     - `status varchar(32)` default `complete` not null: `queued`, `complete`, `partial`, `provider_unavailable`, `rate_limited`, `forbidden`.
     - `source varchar(32)` default `nansen` not null.
     - `provider_credit_cost integer` nullable.
     - `cache_expires_at timestamptz` not null.
     - `fetched_at`, `created_at`, `updated_at` timestamps.
   - Indexes:
     - `idx_nansen_flows_token_time` on `(chain, token_address, metric_type, fetched_at DESC)`.
     - `idx_nansen_flows_expires` on `cache_expires_at`.
     - `idx_nansen_tgm_token` on `(chain, token_address)`.
     - `idx_nansen_tgm_expires` on `cache_expires_at`.
     - unique indexes for `(chain, token_address, metric_type, time_window, source)` and `(chain, token_address, source)`.
   - Migration must use the next available sequence at implementation time. Current committed migrations end at `0004_token_social_signals.sql`, while Stories 2.1.1/2.1.2/2.2.1 may add `0005`/`0006`/`0007`; coordinate sequence and do not overwrite another story's migration.

5. **AC5 — Worker extends Story 2.3 safely instead of replacing it:**
   - Do not delete or break `apps/api/src/queue/bullmq/workers/onchain-index.ts` or existing `onChainDataIndex` behavior.
   - Create a dedicated worker `apps/api/src/queue/bullmq/workers/nansen-smart-money-worker.ts` or add clearly separated jobs to `onchain-index.ts` only if this does not make the existing worker harder to reason about. Prefer a dedicated file.
   - Queue name: `nansen-smart-money-sync`.
   - Job names:
     - `refresh-smart-money-netflow`
     - `refresh-token-god-mode`
     - `refresh-hot-token-watchlist`
     - `cleanup-expired-nansen-cache`
   - Scheduler uses `queue.upsertJobScheduler`, not deprecated repeat options.
   - Concurrency default `1`; retries use exponential backoff on 429/5xx only.
   - Healthy endpoint results should commit even if another endpoint fails. Use `Promise.allSettled` or per-endpoint transactions.

6. **AC6 — Hot token trigger model is query/watchlist driven, not full market scan:**
   - Background worker refreshes only:
     - configured watchlist tokens,
     - tokens recently requested through the API route,
     - tokens flagged by Discover/social/mempool/fact-check pipelines as hot,
     - stale cache entries that are still inside active watchlist scope.
   - Initial watchlist can be a small operator-configured list; do not call Nansen for every token in a chain.
   - If a token has signs of pump/dump from existing DB signals, enqueue `refresh-token-god-mode` with short TTL.
   - If no Nansen chain support exists for a chain, return `unsupported_chain` without provider call.

7. **AC7 — API route exposes cache-first Smart Money/TGM data:**
   - Create route `apps/api/src/router/routes/smart-money-flow.ts`, mounted behind `combinedAuth` at `POST /v1/router/smart-money-flow`.
   - Request schema:
     - `chain` required.
     - `token_address` required for TGM mode.
     - optional `token_symbol`.
     - `mode` enum: `token_god_mode`, `smart_money_netflow`, `top_buyers`, `top_sellers`, `exchange_flows`.
     - `lookback_hours` optional, default `1`, max `168`.
     - `limit` optional, default `20`, max `100`.
     - `force_refresh` optional default `false`.
     - `session_id` optional.
   - Default behavior: read DB cache first. If cache is fresh, return `cache_status='cache_fresh'`, cost `0`, no Nansen call.
   - If cache stale/missing and live provider enabled, route can enqueue a job and wait up to 8s for result; otherwise return cached stale data with `analysis_status='queued'`.
   - `force_refresh=true` requires credit check and live provider budget; still capped by `NANSEN_SMART_MONEY_MAX_LIVE_CALLS_PER_REQUEST`.

8. **AC8 — OpenCode tool wrapper is Tier 2 only and internal-API only:**
   - Create `core/epsilon-master/opencode/tools/smart_money_flow.ts` using `tool()` from `@opencode-ai/plugin`.
   - Tool calls only `EPSILON_API_URL/v1/router/smart-money-flow` with `Authorization: Bearer ${EPSILON_TOKEN}`.
   - Tool must never receive or use `NANSEN_API_KEY`.
   - Add `smart_money_flow: allow` to `core/epsilon-master/opencode/agents/chainlens-tier2.md`.
   - Add/confirm `smart_money_flow: deny` or absence in `chainlens-tier1.md` until Epic 7.1 billing and Tier 1 limits are explicitly ready.
   - Update `core/epsilon-master/opencode/tools/README.md` with provider boundary, tier, cache behavior, and billing behavior.

9. **AC9 — Response is compact, normalized, and attribution-safe:**
   - Response must include:
     - `success`, `mode`, `chain`, `token_address`, `token_symbol`, `risk_level`, `summary`, `top_buyers`, `top_sellers`, `smart_money_flows`, `exchange_flows`, `source`, `cache_status`, `fetched_at`, `cache_expires_at`, `cost`.
   - Do not dump full Nansen raw payload by default.
   - Include attribution fields for UI/tool output: `provider: 'nansen'`, `attribution: 'Powered by Nansen API'` when returning Nansen-derived data.
   - Follow Nansen redistribution constraints: Smart Money endpoints are restricted-by-default in docs, so public/free Discover-style redistribution must use only allowed summaries or remain behind authenticated Tier 2 access.

10. **AC10 — Optional compatibility with existing `onChainDataIndex`:**
    - After normalized tables are written, optionally write a compact `smart_money_movement` row to `onChainDataIndex` for existing `/market/smart-money` and `/jit-sync/onchain/:identifier` compatibility.
    - Compatibility write must be sanitized and must not include raw provider payload.
    - Do not rely on the existing synthetic placeholder wallet from `onchain-index.ts` for top buyer/seller answers. Token God Mode top buyer/seller data must use real Nansen response fields when available.

11. **AC11 — Tests and verification:**
    - Unit tests for Nansen service:
      - `apikey` header is present.
      - request body shapes for holdings/netflow/who-bought-sold/flows.
      - 401/402/403/429/5xx sanitized handling.
      - unsupported chain short-circuits without fetch.
    - Unit tests for normalization/scoring:
      - top buyers sorted by bought USD.
      - top sellers sorted by sold USD.
      - exchange inflow -> sell pressure risk factor.
      - exchange outflow + smart money inflow -> accumulation signal.
    - Route tests:
      - cache hit costs `0` and does not call provider.
      - live refresh requires credits.
      - rate-limit falls back to stale cache.
      - response excludes raw payload by default.
    - Worker tests:
      - scheduler uses `upsertJobScheduler`.
      - per-endpoint failures do not rollback healthy endpoint rows.
      - cleanup deletes expired cache rows.
    - Tool wrapper test or smoke import with mocked `fetch`.
    - Run relevant `bun test` and `bun run --cwd apps/api typecheck`; document unrelated baseline failures if any.

## Tasks / Subtasks

- [x] **Task 0: Config and provider boundary (AC1, AC2, AC3)**
  - [x] 0.1 — Add Nansen smart-money config vars to `apps/api/src/config.ts`.
  - [x] 0.2 — Update `apps/api/.env.example` with a `Nansen Smart Money / Token God Mode` section.
  - [x] 0.3 — Ensure `NANSEN_API_KEY` is never exposed to OpenCode, frontend, logs, or error responses.
  - [x] 0.4 — Add comments for Nansen credits/rate limits near service calls or config.

- [x] **Task 1: DB schema and migration (AC4, AC10)**
  - [x] 1.1 — Add `nansenSmartMoneyFlows` and `nansenTokenGodModeCache` tables to `packages/db/src/schema/epsilon.ts`.
  - [x] 1.2 — Export tables from `packages/db/src/index.ts`.
  - [x] 1.3 — Create next migration without colliding with Stories 2.1.1/2.1.2/2.2.1.
  - [x] 1.4 — Add indexes and unique keys exactly as specified.
  - [x] 1.5 — Optional compatibility write contract for `onChainDataIndex` if needed by existing market UI.

- [x] **Task 2: Nansen service wrapper (AC2, AC3, AC9, AC11)**
  - [x] 2.1 — Create `apps/api/src/router/services/nansen.ts`.
  - [x] 2.2 — Implement `fetchSmartMoneyHoldings(chains, filters, pagination)`.
  - [x] 2.3 — Implement `fetchSmartMoneyNetflow(chains, filters, pagination)`.
  - [x] 2.4 — Implement `fetchTgmWhoBoughtSold(chain, tokenAddress, buyOrSell, dateRange, pagination, filters)`.
  - [x] 2.5 — Implement `fetchTgmFlows(chain, tokenAddress, label, dateRange, pagination, filters)`.
  - [x] 2.6 — Add timeout, response shape guards, typed provider errors, and redacted logging.

- [x] **Task 3: Normalization and signal scoring (AC4, AC9, AC10, AC11)**
  - [x] 3.1 — Create pure normalization helpers for top buyers, top sellers, smart money flows, and exchange flows.
  - [x] 3.2 — Compute risk/signal factors: `smart_money_accumulation`, `smart_money_distribution`, `exchange_inflow_sell_pressure`, `exchange_outflow_accumulation`, `high_buyer_concentration`, `provider_partial_data`.
  - [x] 3.3 — Ensure numeric conversion handles strings, nulls, NaN, and large values safely.
  - [x] 3.4 — Add unit tests for signal scoring and sorting.

- [x] **Task 4: Worker implementation (AC5, AC6, AC11)**
  - [x] 4.1 — Create `apps/api/src/queue/bullmq/workers/nansen-smart-money-worker.ts`.
  - [x] 4.2 — Implement queue singleton pattern (`_queue`, `_worker`) and lifecycle exports.
  - [x] 4.3 — Implement `refresh-smart-money-netflow` job for configured chain batches.
  - [x] 4.4 — Implement `refresh-token-god-mode` job for hot token requests.
  - [x] 4.5 — Implement cleanup job for expired cache.
  - [x] 4.6 — Use `Promise.allSettled`/per-endpoint transactions so partial success commits.
  - [x] 4.7 — Add worker `error` and `failed` handlers.

- [x] **Task 5: Queue lifecycle wiring (AC5)**
  - [x] 5.1 — Export `startNansenSmartMoneyWorker`, `setupNansenSmartMoneyJobs`, `stopNansenSmartMoneyWorker`, `getNansenSmartMoneyQueue` from `apps/api/src/queue/index.ts`.
  - [x] 5.2 — Start/setup in `startBackgroundServices()` in `apps/api/src/index.ts`.
  - [x] 5.3 — Stop in shutdown handler alongside existing workers.
  - [x] 5.4 — Keep disabled worker silent except for one clear startup skip log.

- [x] **Task 6: API route (AC7, AC8, AC9)**
  - [x] 6.1 — Create `apps/api/src/router/routes/smart-money-flow.ts`.
  - [x] 6.2 — Mount route with `combinedAuth` in `apps/api/src/router/index.ts`.
  - [x] 6.3 — Implement cache-first lookup and stale fallback.
  - [x] 6.4 — Implement live refresh guard with `checkCredits` and `NANSEN_SMART_MONEY_MAX_LIVE_CALLS_PER_REQUEST`.
  - [x] 6.5 — Deduct with tool key `smart_money_flow` only when live provider work is performed.
  - [x] 6.6 — Add `smart_money_flow` pricing to `TOOL_PRICING` with product-approved value; if unsure, start conservative and document.

- [x] **Task 7: OpenCode tool and permissions (AC8, AC9)**
  - [x] 7.1 — Create `core/epsilon-master/opencode/tools/smart_money_flow.ts`.
  - [x] 7.2 — Validate args locally: chain allowlist, token address max length, lookback max, limit max.
  - [x] 7.3 — Call only Chainlens internal API with `EPSILON_TOKEN`.
  - [x] 7.4 — Add Tier 2 permission and deny/omit Tier 1.
  - [x] 7.5 — Update tools README.

- [x] **Task 8: Tests and typecheck (AC11)**
  - [x] 8.1 — Add service tests with mocked `fetch`.
  - [x] 8.2 — Add normalization/scoring tests.
  - [x] 8.3 — Add route cache/live/billing tests.
  - [x] 8.4 — Add worker lifecycle/job tests.
  - [x] 8.5 — Add OpenCode tool wrapper smoke test if project has pattern for tool tests.
  - [x] 8.6 — Run relevant tests and typecheck.

### Review Findings

- [x] [Review][Patch] Nansen wrapper request/response shapes do not match current Nansen API docs; bodies use camelCase/top-level fields while docs use `token_address`, `buy_or_sell`, `date`, `pagination`, and snake_case responses. [apps/api/src/router/services/nansen.ts:125]
- [x] [Review][Patch] Configured `NANSEN_SMART_MONEY_CHAINS` allowlist is ignored; route/service use a hardcoded supported-chain set instead of the operator-configured chain scope. [apps/api/src/router/services/nansen.ts:18]
- [x] [Review][Patch] Unsupported chains and missing provider config are collapsed into queued success, bypassing the intended `unsupported_chain` response and creating jobs that cannot succeed. [apps/api/src/router/routes/smart-money-flow.ts:144]
- [x] [Review][Patch] Cache-miss queue path always enqueues `refresh-token-god-mode`, so `smart_money_netflow` misses do not enqueue a netflow refresh. [apps/api/src/router/routes/smart-money-flow.ts:146]
- [x] [Review][Patch] Default live-call cap `3` silently skips the exchange-flow provider call even when `mode='exchange_flows'`, then marks the response as live/successful. [apps/api/src/router/routes/smart-money-flow.ts:188]
- [x] [Review][Patch] Provider 429/402/403 handling is incomplete: TGM failures are swallowed into billed partial live responses, 403 has no stale fallback, and netflow fallback queries the TGM cache table. [apps/api/src/router/routes/smart-money-flow.ts:195]
- [x] [Review][Patch] Cache keys ignore `lookback_hours`/`timeWindow`, so requests for different windows can receive a fresh cache row from the wrong window. [apps/api/src/router/routes/smart-money-flow.ts:103]
- [x] [Review][Patch] Token address normalization lowercases all cache keys, which breaks case-sensitive Solana token addresses and can desync worker writes from route reads. [apps/api/src/router/routes/smart-money-flow.ts:76]
- [x] [Review][Patch] `smart_money_netflow` incorrectly requires `token_address` even though the spec only requires it for TGM modes. [apps/api/src/router/routes/smart-money-flow.ts:43]
- [x] [Review][Patch] Live billing gate checks only the default `$0.01` minimum and ignores `deductToolCredits` failure, so live Nansen data can be returned without successfully charging the configured tool cost. [apps/api/src/router/routes/smart-money-flow.ts:172]
- [x] [Review][Patch] Scheduled netflow worker performs unscoped per-chain netflow calls and writes `tokenAddress='ALL'`, violating the watchlist/hot-token model and producing rows the API route does not read. [apps/api/src/queue/bullmq/workers/nansen-smart-money-worker.ts:103]
- [x] [Review][Patch] Worker retry/error policy is inverted relative to spec: generic attempts retry fatal 402/403, while 429-style non-fatal errors are logged and may not retry as intended. [apps/api/src/queue/bullmq/workers/nansen-smart-money-worker.ts:63]
- [x] [Review][Patch] TGM worker writes an empty `partial` cache row even when all provider calls fail, masking provider outage/quota/auth problems as usable cache. [apps/api/src/queue/bullmq/workers/nansen-smart-money-worker.ts:169]
- [x] [Review][Patch] Required test coverage is missing for holdings request bodies, current Nansen request/response shapes, worker cleanup deletion, time-window cache selection, exchange-flow live cap, and netflow stale fallback. [apps/api/src/__tests__/unit/nansen-service.test.ts:51]

## Dev Notes

### Critical Brownfield Guardrails

- Do not replace Story 2.3's `onchain-index.ts` behavior. It currently powers generic on-chain index and market smart-money endpoint compatibility.
- Do not let OpenCode or sandbox call Nansen directly. The only allowed path is OpenCode tool -> Chainlens API -> backend provider service/cache.
- Do not hardcode Nansen API paths from older beta docs. Use `/api/v1` endpoints from current docs unless explicitly gated behind a legacy adapter.
- Do not call Nansen `chains: ['all']` by default. Use `NANSEN_SMART_MONEY_CHAINS` and batch carefully.
- Do not put unrestricted raw Nansen payload in public or Tier 1 responses. Nansen redistribution docs mark some Smart Money endpoints restricted-by-default.
- Do not make live Nansen calls on every Agent prompt. Cache-first is mandatory.
- Do not skip billing/credit checks for live provider work in cloud mode.

### Previous Story Intelligence To Apply

- From Story 2.1.1: provider streams/calls can explode cost; scope by configured chain, token, router/watchlist, and threshold.
- From Story 2.1.2: provider-specific labels/data should be cached and normalized; tool responses should expose compact risk factors, not raw provider payloads.
- From Story 2.2.1: multi-chain behavior is allowlist/config-driven and must not scan every chain by default.
- From Story 2.3 review: isolate provider failures with `Promise.allSettled`, use typed 429 errors, validate provider response shapes, sanitize JSONB, chunk inserts, add cleanup/retention, and keep worker feature-flagged off by default.
- From Story 2.3 current code: existing `fetchNansenData()` uses `POST https://api.nansen.ai/api/v1/smart-money/holdings` with `apikey` header but stores synthetic wallet placeholders. Story 2.3.1 must use real TGM buyer/seller/flow data for answerable top-wallet questions.
- From billing routes: `token-holders.ts` correctly bills only live provider calls and skips cache hits; follow that model, not `contract-risk.ts` which bills even cache hits.

### Current Code To Preserve

- `apps/api/src/queue/bullmq/workers/onchain-index.ts`
  - Feature-flagged by `ONCHAIN_WORKER_ENABLED`.
  - Uses `queue.upsertJobScheduler`.
  - Has cleanup job and 30-day retention.
  - Fetches DefiLlama protocol metrics and basic Nansen holdings into `onChainDataIndex`.
- `packages/db/src/schema/epsilon.ts`
  - Existing `onChainDataIndex` table with source enum `dune | nansen`.
  - Additive-only changes only.
- `apps/api/src/router/routes/jit-sync.ts`
  - Existing `/onchain/:identifier` returns projected fields only, not raw `metricValue`.
  - Do not break existing `jit_sync` tool behavior.
- `apps/api/src/market/routes.ts`
  - `/market/smart-money` parses `metricName='smart_money_movement'`; keep compatibility if dashboard depends on it.
- `core/epsilon-master/opencode/tools/jit_sync.ts`
  - Existing tool can read generic pre-indexed on-chain data. New `smart_money_flow` tool should be more specific and Tier 2 only.

### Nansen Provider Notes

- Base URL: `https://api.nansen.ai/api/v1`.
- Authentication: `apikey` header, lowercase per current Nansen docs.
- Current official rate limits: 20 requests/sec and 300 requests/minute per API key.
- Smart Money endpoints include `/smart-money/holdings` and `/smart-money/netflow`.
- Token God Mode endpoints include `/tgm/who-bought-sold` and `/tgm/flows`.
- Nansen docs list broad multi-chain support, but endpoint support varies by chain. Validate per endpoint and return `unsupported_chain` rather than retrying unsupported chains.
- Older `/api/beta` docs and old architecture assumptions may be stale. Do not use beta endpoints unless v1 endpoint is missing and implementation comments explain why.

### Suggested API Response Shape

```typescript
interface SmartMoneyFlowResponse {
  success: boolean;
  mode: 'token_god_mode' | 'smart_money_netflow' | 'top_buyers' | 'top_sellers' | 'exchange_flows';
  chain: string;
  token_address: string;
  token_symbol?: string;
  risk_level: 'none' | 'low' | 'medium' | 'high' | 'critical';
  summary: {
    smart_money_net_flow_usd?: number | null;
    exchange_net_flow_usd?: number | null;
    top_buyer_count?: number | null;
    top_seller_count?: number | null;
    signal?: string;
  };
  top_buyers: Array<{ address: string; label?: string; bought_volume_usd: number; sold_volume_usd?: number }>;
  top_sellers: Array<{ address: string; label?: string; sold_volume_usd: number; bought_volume_usd?: number }>;
  smart_money_flows: Record<string, unknown>;
  exchange_flows: Record<string, unknown>;
  risk_factors: Array<{ code: string; label: string; severity: 'low' | 'medium' | 'high' | 'critical' }>;
  source: 'db_cache' | 'nansen' | 'stale_cache';
  cache_status: 'cache_fresh' | 'cache_stale' | 'live' | 'queued';
  fetched_at: string | null;
  cache_expires_at: string | null;
  cost: number;
  attribution?: 'Powered by Nansen API';
}
```

### Testing Notes

- Mock `fetch` for every Nansen service test; never call live Nansen in CI.
- Use fake timers or injected `now` for TTL/cache tests.
- Keep normalization logic pure and exported to avoid testing only through route/worker side effects.
- Test that raw provider payload does not appear in public response by checking for fields only present in fixtures.
- Test that `force_refresh=false` never calls Nansen when fresh cache exists.

### Latest Technical Information Checked

- Nansen Authentication docs require all requests to include API key in `apikey` header. Source: https://docs.nansen.ai/getting-started/authentication
- Nansen Rate Limits docs state current limits are 20 requests/second and 300 requests/minute, with 429 on exceeded limits. Source: https://docs.nansen.ai/getting-started/rate-limits
- Nansen Credits docs state Pro plan Smart Money endpoints cost 5 credits/call and TGM `who-bought-sold`/`flows` cost 1 credit/call; Free plan consumes 10x credits for these classes. Source: https://docs.nansen.ai/getting-started/credits
- Nansen Smart Money docs list `/api/v1/smart-money/holdings` and `/api/v1/smart-money/netflow`, supported chains, and smart money labels. Source: https://docs.nansen.ai/api/smart-money
- Nansen Token God Mode docs list `/api/v1/tgm/who-bought-sold` for top buyers/sellers and `/api/v1/tgm/flows` for smart-money/exchange flow analytics. Sources: https://docs.nansen.ai/api/token-god-mode/who-bought-sold and https://docs.nansen.ai/api/token-god-mode/flows
- Nansen Supported Chains docs state endpoint support varies by chain and provide examples for single-chain, multi-chain, and all-chain queries. Source: https://docs.nansen.ai/reference/chains
- Nansen Data Redistribution Guidelines require attribution for public/commercial use and mark some Smart Money endpoints restricted-by-default. Source: https://docs.nansen.ai/guides

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-2.3.1]
- [Source: _bmad-output/planning-artifacts/architecture.md#2.4-Smart-Money-Flow-and-VIP-Analytics]
- [Source: _bmad-output/implementation-artifacts/2-3-dune-and-nansen-on-chain-index-worker.md]
- [Source: _bmad-output/implementation-artifacts/2-1-1-mempool-sniffing-mev-tracking.md]
- [Source: _bmad-output/implementation-artifacts/2-1-2-entity-hacker-wallet-tracking.md]
- [Source: _bmad-output/implementation-artifacts/2-2-1-on-chain-fact-checking-layer.md]
- [Source: apps/api/src/queue/bullmq/workers/onchain-index.ts]
- [Source: apps/api/src/router/routes/jit-sync.ts]
- [Source: apps/api/src/market/routes.ts]
- [Source: packages/db/src/schema/epsilon.ts]
- [Nansen Authentication](https://docs.nansen.ai/getting-started/authentication)
- [Nansen Rate Limits](https://docs.nansen.ai/getting-started/rate-limits)
- [Nansen Credits & Pricing](https://docs.nansen.ai/getting-started/credits)
- [Nansen Smart Money](https://docs.nansen.ai/api/smart-money)
- [Nansen TGM Who Bought/Sold](https://docs.nansen.ai/api/token-god-mode/who-bought-sold)
- [Nansen TGM Flows](https://docs.nansen.ai/api/token-god-mode/flows)
- [Nansen Supported Chains](https://docs.nansen.ai/reference/chains)
- [Nansen Data Redistribution Guidelines](https://docs.nansen.ai/guides)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Bun `.resolves.not.toThrow()` does not work correctly — use try/catch pattern instead (verified against Bun v1.3.12).
- `mock.module` paths resolve relative to the TEST FILE, not the module under test.
- `isolation = true` in bunfig.toml only isolates files discovered by glob, not files passed explicitly on CLI — run test files separately to avoid mock bleeding.
- When all error classes map to the same mock class, `instanceof` checks in `isFatal()` misidentify non-fatal errors as fatal — use two distinct error classes: `FakeNansenError` (non-fatal) and `FakeFatalError` (fatal).
- Nansen API rows use camelCase field names (`boughtVolumeUsd`, `soldVolumeUsd`, `address`), not snake_case. Normalized output is snake_case.
- `exchange_outflow_accumulation` signal requires BOTH `exNet < 0` AND `smNet > 0`.
- Project logger signature is `logger.info(message: string, context?)`, not pino-style `logger.info({...}, message)`.

### Completion Notes List

- All 10 Nansen config vars added to `apps/api/src/config.ts`; worker is default-off (`NANSEN_SMART_MONEY_WORKER_ENABLED=false`).
- `NANSEN_API_KEY` is never exposed in error messages, logs, or API responses — enforced by `nansenPost()` helper sanitizing all error outputs.
- DB schema: `nansenSmartMoneyFlows` and `nansenTokenGodModeCache` added additively; migration `0009_nansen_smart_money.sql` created.
- Nansen service (`nansen.ts`): 5 typed fetch functions with distinct error classes for 401/402/403/429/5xx; `canCallNansen()` guards chain support.
- Normalization service (`nansen-normalize.ts`): pure functions for buyers/sellers/flows, 6 signal factors, `deriveRiskLevel`, `buildSignalSummary`.
- Worker (`nansen-smart-money-worker.ts`): BullMQ singleton, 4 job types, `Promise.allSettled` for partial TGM success, exponential backoff on 429/5xx only.
- Route (`smart-money-flow.ts`): `POST /v1/router/smart-money-flow`, cache-first (TGM + netflow tables), `checkCredits` before live call, `deductToolCredits` only on success, `attribution: 'Powered by Nansen API'` in all responses.
- OpenCode tool (`smart_money_flow.ts`): Tier 2 only, calls only `EPSILON_API_URL/v1/router/smart-money-flow`, never `NANSEN_API_KEY`.
- Tests: 88 tests total across 4 files — 40 normalization, 24 service, 14 route, 10 worker — all passing. No new typecheck errors in story files.
- Pre-existing typecheck errors in `dune-labels.ts`, `sandbox-cloud.ts`, `sandbox-provision-poller.ts`, and various `__tests__` files are unrelated to this story and were present before implementation.

### File List

**New files:**
- `apps/api/src/router/services/nansen.ts`
- `apps/api/src/router/services/nansen-normalize.ts`
- `apps/api/src/queue/bullmq/workers/nansen-smart-money-worker.ts`
- `apps/api/src/router/routes/smart-money-flow.ts`
- `core/epsilon-master/opencode/tools/smart_money_flow.ts`
- `packages/db/migrations/0009_nansen_smart_money.sql`
- `apps/api/src/__tests__/unit/nansen-normalize.test.ts`
- `apps/api/src/__tests__/unit/nansen-service.test.ts`
- `apps/api/src/__tests__/unit/smart-money-flow-route.test.ts`
- `apps/api/src/__tests__/unit/nansen-worker.test.ts`

**Modified files:**
- `apps/api/src/config.ts`
- `apps/api/.env.example`
- `apps/api/src/index.ts`
- `apps/api/src/queue/index.ts`
- `apps/api/src/router/index.ts`
- `packages/db/src/schema/epsilon.ts`
- `packages/db/src/index.ts`
- `core/epsilon-master/opencode/agents/chainlens-tier2.md`
- `core/epsilon-master/opencode/agents/chainlens-tier1.md`
- `core/epsilon-master/opencode/tools/README.md`

## Change Log

- 2026-05-17: Story implemented — Nansen Smart Money Flow & Token God Mode full stack (config, schema, service, normalization, worker, route, OpenCode tool, tests). All 88 new unit tests pass. No new typecheck errors introduced.
