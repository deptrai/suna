# Story 2.2.1: On-chain Fact Checking Layer (Deep Dive)

Status: review

Epic: 2 — Crypto Data Infrastructure
Created: 2026-05-17
FRs: FR2, FR5
NFRs: NFR4, NFR5, NFR8, NFR9
ARs: AR1, AR2, AR3, AR5, AR6, AR8

**Parent:** Story 2.2 (AI-Generated Discover Feed) — `done`. Story 2.2.1 extends the Discover publishing pipeline with on-chain verification before positive news is published.

## Story

As a user đọc tin tức thị trường,
I want AI tự động đối chiếu tin tức tích cực về partnerships/listings/launches với dữ liệu on-chain thực tế của token và dev/treasury wallets qua QuickNode RPC multi-chain được cấu hình,
so that tôi không bị FOMO khi nội dung marketing tích cực đang che giấu insider/dev selling.

## Acceptance Criteria

1. **AC1 — Worker is default-off and scoped to Discover publish-time fact checks:**
   - Add config in `apps/api/src/config.ts`:
     - `ONCHAIN_FACT_CHECK_WORKER_ENABLED` default `false`.
     - `ONCHAIN_FACT_CHECK_INTERVAL_MS` default `300_000`.
     - `ONCHAIN_FACT_CHECK_LOOKBACK_HOURS` default `24`.
     - `ONCHAIN_FACT_CHECK_DUMP_THRESHOLD_PCT` default `5`.
     - `ONCHAIN_FACT_CHECK_MAX_WALLETS_PER_TOKEN` default `10`.
     - `ONCHAIN_FACT_CHECK_MAX_TRANSFERS_PER_WALLET` default `200`.
     - `ONCHAIN_FACT_CHECK_PROVIDER` default `quicknode`.
     - `ONCHAIN_FACT_CHECK_CHAINS` default `ethereum`.
     - `ONCHAIN_FACT_CHECK_RPC_URL_<CHAIN>` per configured chain, e.g. `ONCHAIN_FACT_CHECK_RPC_URL_ETHEREUM`, `ONCHAIN_FACT_CHECK_RPC_URL_BASE`, `ONCHAIN_FACT_CHECK_RPC_URL_POLYGON`, `ONCHAIN_FACT_CHECK_RPC_URL_ARBITRUM`.
   - Worker must not run unless enabled. If required provider keys are missing, worker logs a clear skip reason and does not crash the API.
   - QuickNode HTTP RPC is the default MVP provider for on-chain evidence. Etherscan/Blockscout/Moralis are fallback or supplemental sources only.
   - Multi-chain support is config-driven by `ONCHAIN_FACT_CHECK_CHAINS`; worker must not scan all chains or all token logs by default.
   - Scope is the Discover feed pipeline. This is not an OpenCode tool in MVP unless a later story explicitly exposes one.

2. **AC2 — Token/project wallet watchlist schema is explicit; no hallucinated dev wallets:**
   - Add additive Drizzle schema in `packages/db/src/schema/epsilon.ts` for `project_wallet_watchlist`:
     - `id uuid` primary key.
     - `chain varchar(32)` not null.
     - `token_address varchar(128)` not null, lowercase for EVM.
     - `token_symbol varchar(32)` nullable.
     - `project_slug varchar(128)` nullable.
     - `wallet_address varchar(128)` not null, lowercase for EVM.
     - `wallet_role varchar(32)` not null: `dev`, `treasury`, `team`, `foundation`, `market_maker`, `exchange`, `unknown`.
     - `label text` nullable.
     - `source varchar(64)` not null: `manual`, `arkham`, `quicknode`, `goplus`, `etherscan`, `blockscout`, `other`.
     - `confidence numeric(5,4)` nullable.
     - `active boolean` default `true` not null.
     - `metadata jsonb` default `{}`.
     - `created_at`, `updated_at` timestamps.
   - Unique index on `(chain, token_address, wallet_address)`.
   - Indexes on `(chain, token_address, active)` and `(wallet_address)`.
   - If no watchlist wallet exists for the token, fact check status must be `insufficient_wallet_context`; the system must not invent dev/treasury addresses from article text.

3. **AC3 — Fact-check result schema persists audit evidence:**
   - Add additive table `onchain_fact_checks`:
     - `id uuid` primary key.
     - `discover_feed_id uuid` nullable FK-like reference to `discover_feeds.id` if available.
     - `chain varchar(32)` not null.
     - `token_address varchar(128)` not null.
     - `token_symbol varchar(32)` nullable.
     - `article_title text` nullable.
     - `article_sentiment varchar(32)` not null: `positive`, `neutral`, `negative`, `unknown`.
     - `status varchar(32)` not null: `passed`, `flagged`, `insufficient_wallet_context`, `provider_unavailable`, `skipped`.
     - `wallets_checked integer` default `0` not null.
     - `net_outflow_pct numeric(10,4)` nullable.
     - `largest_wallet_outflow_pct numeric(10,4)` nullable.
     - `transfer_count integer` default `0` not null.
     - `risk_level warning_level` default `none` not null.
     - `risk_factors jsonb` default `[]`.
     - `evidence jsonb` default `{}` with sanitized provider source, tx hashes, wallet roles, and calculation inputs.
     - `checked_at`, `created_at`, `updated_at` timestamps.
   - Indexes on `(chain, token_address, checked_at DESC)`, `(status, checked_at DESC)`, `(risk_level, checked_at DESC)`.
   - Migration must use the next available sequence at implementation time. Current repo has `0004_token_social_signals.sql`; Story 2.1.1 and 2.1.2 are ready-for-dev and may reserve `0005`/`0006`, so do not assume a fixed number. If both ship first, use `0007_onchain_fact_checks.sql`.

4. **AC4 — QuickNode RPC provider adapter is primary; existing EVM data sources are fallback/supplemental:**
   - Create service module `apps/api/src/router/services/onchain-fact-check.ts`.
   - Implement backend-only QuickNode JSON-RPC calls for configured chains:
     - `eth_getLogs` for bounded ERC-20 `Transfer` event lookup by token contract, block/time window, and wallet topic filters where possible.
     - `eth_call` for ERC-20 `balanceOf(wallet)` when current token balance is needed.
     - latest block reads as needed to estimate 24h block window per chain.
   - Reuse existing chain/provider patterns from `token-transactions.ts` and `token-holders.ts` only as fallback/supplemental:
     - Etherscan-compatible `module=account&action=tokentx` may be used if QuickNode RPC is unavailable or log filtering is insufficient.
     - Blockscout fallback may be used when a chain instance is configured.
     - Moralis owners endpoint remains useful for current top holders, but 24h wallet selling requires transfer-history calculation.
   - The service must support a wallet-scoped token-transfer query: token contract + wallet address + lookback window.
   - Do not place QuickNode/provider API keys in OpenCode/sandbox. Keys remain backend-only.

5. **AC5 — Dump detection algorithm is deterministic and conservative:**
   - For each active watched wallet for `(chain, token_address)`:
     - Fetch ERC-20 transfers for the token involving that wallet over the last `ONCHAIN_FACT_CHECK_LOOKBACK_HOURS`.
     - Compute net token outflow as outgoing transfers minus incoming transfers.
     - Estimate previous wallet balance as `current_balance + net_outflow` when current balance is available; otherwise mark balance basis as `transfer_only` with lower confidence.
     - Compute `wallet_outflow_pct = net_outflow / previous_balance * 100` when denominator is known and positive.
   - Aggregate `net_outflow_pct` across watched dev/treasury/team/foundation wallets.
   - Flag `High Risk: Insider Selling Detected` when positive article sentiment and aggregate outflow is greater than `ONCHAIN_FACT_CHECK_DUMP_THRESHOLD_PCT` default `5`.
   - If evidence is incomplete, downgrade to `medium` or `low` and include `confidence`/`missing_inputs` in evidence instead of overclaiming.

6. **AC6 — Discover worker integrates fact-check before publishing positive items:**
   - Extend `apps/api/src/queue/bullmq/workers/discover-feed.ts` after AI summarization and before DB insert.
   - For each AI item:
     - Classify whether the item is positive/promotional (`partnership`, `listing`, `launch`, `funding`, `mainnet`, `integration`, `exchange listing`, similar terms).
     - Extract or resolve token contract/chain only when article/source data includes a reliable token address or a configured mapping exists. Do not infer contract addresses from ticker alone unless mapping exists in DB/config.
     - Enqueue or call fact-check service with an 8s per-item budget. If timeout, publish with `status=provider_unavailable` only if the item is otherwise valid, and record the failure for retry.
   - When fact check returns `flagged`, set Discover item `isAnomaly=true`, `warningLevel='high'` or `critical`, and prefix/append clear wording: `High Risk: Insider Selling Detected`.
   - When status is `insufficient_wallet_context`, publish normally but persist audit row; do not add a high-risk label.

7. **AC7 — Dedicated BullMQ queue handles retries and backfills:**
   - Create `apps/api/src/queue/bullmq/workers/onchain-fact-check-worker.ts`.
   - Queue name: `onchain-fact-check`.
   - Job names:
     - `fact-check-discover-item` for publish-time checks.
     - `refresh-recent-positive-feed` for retrying recent positive items with provider failures.
   - Scheduler uses `queue.upsertJobScheduler`, not deprecated repeat options.
   - Concurrency default `1`; retries use exponential backoff for 429/5xx provider failures.
   - Export lifecycle functions from `apps/api/src/queue/index.ts` and wire startup/shutdown in `apps/api/src/index.ts` following `discover-feed.ts` and `social-sentiment-worker.ts` patterns.

8. **AC8 — API route exposes cached fact-check results for internal UI/admin/debug, not direct provider spam:**
   - Create `apps/api/src/router/routes/onchain-fact-check.ts` mounted at `POST /v1/router/onchain-fact-check` behind `combinedAuth`.
   - Request schema:
     - `chain`, `token_address`, optional `token_symbol`, optional `discover_feed_id`, optional `article_title`, optional `article_sentiment`, optional `force_refresh`, optional `session_id`.
   - Default behavior is cache-first: return the latest `onchain_fact_checks` row for the token within the configured lookback unless `force_refresh=true` and user has credits.
   - Live provider calls require `checkCredits`. Deduct using tool key `onchain_fact_check` only when live upstream work is performed. Cached reads should cost `0` unless product later decides otherwise.
   - Response must include `success`, `status`, `risk_level`, `risk_factors`, `net_outflow_pct`, `wallets_checked`, `source`, `checked_at`, `cache_status`, and sanitized `evidence`.

9. **AC9 — Frontend Discover feed displays fact-check badges safely:**
   - Extend API projection in `apps/api/src/discover/routes.ts` only with fields needed by the UI. Do not leak raw provider responses or wallet labels beyond sanitized evidence.
   - Minimal viable approach: encode warning through existing `isAnomaly` + `warningLevel` + summary text. If richer UI is added, update shared types and `apps/web/src/app/(dashboard)/discover/` components.
   - Badge text must be factual and non-advisory: use `On-chain risk detected`, `Insider selling signal`, or similar. Do not render buy/sell advice.

10. **AC10 — Tests and validation:**
    - Unit tests for dump calculation:
      - aggregate outflow `>5%` on positive article -> flagged high.
      - outflow `<=5%` -> passed/none.
      - no wallet context -> insufficient_wallet_context.
      - missing current balance -> lower confidence transfer-only result.
    - Service tests mock Etherscan/Blockscout JSON shapes and rate-limit/provider errors.
    - Route tests verify cache-first, credit check on live refresh, and no billing on cached response.
    - Worker test verifies Discover item mutation only when flagged.
    - Run `bun test` for relevant API tests and `bun run --cwd apps/api typecheck` or project-equivalent typecheck. If unrelated repo debt blocks typecheck, document exact unrelated errors.

## Tasks / Subtasks

- [x] **Task 0: Config and environment docs (AC1)**
  - [x] 0.1 — Add `ONCHAIN_FACT_CHECK_WORKER_ENABLED`, `ONCHAIN_FACT_CHECK_INTERVAL_MS`, `ONCHAIN_FACT_CHECK_LOOKBACK_HOURS`, `ONCHAIN_FACT_CHECK_DUMP_THRESHOLD_PCT`, `ONCHAIN_FACT_CHECK_MAX_WALLETS_PER_TOKEN`, `ONCHAIN_FACT_CHECK_MAX_TRANSFERS_PER_WALLET`, `ONCHAIN_FACT_CHECK_PROVIDER`, `ONCHAIN_FACT_CHECK_CHAINS`, and per-chain `ONCHAIN_FACT_CHECK_RPC_URL_<CHAIN>` values to `apps/api/src/config.ts`.
  - [x] 0.2 — Update `apps/api/.env.example` with an "On-chain Fact Checking Worker" section.
  - [x] 0.3 — Ensure startup logs skip reasons when disabled or providers are unconfigured.

- [x] **Task 1: DB schema and migration (AC2, AC3)**
  - [x] 1.1 — Add `projectWalletWatchlist` and `onchainFactChecks` to `packages/db/src/schema/epsilon.ts`.
  - [x] 1.2 — Export new tables from `packages/db/src/index.ts`.
  - [x] 1.3 — Create next migration with no collision against Story 2.1.1/2.1.2 migrations.
  - [x] 1.4 — Include indexes and unique constraints exactly as specified.

- [x] **Task 2: Fact-check service module (AC4, AC5)**
  - [x] 2.1 — Create `apps/api/src/router/services/onchain-fact-check.ts`.
  - [x] 2.2 — Implement QuickNode JSON-RPC adapter for `eth_getLogs`, `eth_call`, and latest block reads using configured per-chain RPC URLs.
  - [x] 2.3 — Implement wallet-scoped ERC-20 transfer reconstruction from `Transfer` logs, bounded by token contract, wallet, and lookback window.
  - [x] 2.4 — Implement Etherscan-compatible/Blockscout fallback only when QuickNode is unavailable or explicitly disabled.
  - [x] 2.5 — Implement current balance lookup when available; otherwise mark `transfer_only` evidence.
  - [x] 2.6 — Implement deterministic dump scoring and risk factor generation.
  - [x] 2.7 — Sanitize provider errors and raw responses before storing or returning.

- [x] **Task 3: Worker queue (AC6, AC7)**
  - [x] 3.1 — Create `apps/api/src/queue/bullmq/workers/onchain-fact-check-worker.ts`.
  - [x] 3.2 — Implement `fact-check-discover-item` job.
  - [x] 3.3 — Implement `refresh-recent-positive-feed` retry/backfill job.
  - [x] 3.4 — Use `upsertJobScheduler` with the configured interval.
  - [x] 3.5 — Add worker `error` and `failed` handlers.

- [x] **Task 4: Discover feed integration (AC6, AC9)**
  - [x] 4.1 — Extend `apps/api/src/queue/bullmq/workers/discover-feed.ts` to classify positive/promotional items before insert.
  - [x] 4.2 — Resolve token/chain only from reliable source data or configured mappings.
  - [x] 4.3 — Run fact check with timeout and graceful fallback.
  - [x] 4.4 — Mutate title/summary/warning fields only when result is confidently `flagged`.
  - [x] 4.5 — Ensure idempotency still works after summary/title changes.

- [x] **Task 5: API route (AC8)**
  - [x] 5.1 — Create `apps/api/src/router/routes/onchain-fact-check.ts`.
  - [x] 5.2 — Mount under `router.use('/onchain-fact-check/*', combinedAuth)` and `router.route('/onchain-fact-check', onchainFactCheck)` in `apps/api/src/router/index.ts`.
  - [x] 5.3 — Implement cache-first behavior and `force_refresh` billing gate.
  - [x] 5.4 — Use tool cost key `onchain_fact_check` if pricing config exists; otherwise add it deliberately with product-approved default.

- [x] **Task 6: Queue lifecycle wiring (AC7)**
  - [x] 6.1 — Export `startOnchainFactCheckWorker`, `setupOnchainFactCheckJobs`, `stopOnchainFactCheckWorker` from `apps/api/src/queue/index.ts`.
  - [x] 6.2 — Start/setup in `startBackgroundServices()` in `apps/api/src/index.ts`.
  - [x] 6.3 — Stop in shutdown handler alongside existing workers.

- [x] **Task 7: Frontend/shared type update if richer badge is added (AC9)**
  - [x] 7.1 — Prefer existing `isAnomaly`/`warningLevel` first.
  - [x] 7.2 — If adding structured fact-check fields to `/v1/discover`, add shared types before frontend changes.
  - [x] 7.3 — Ensure no raw wallet metadata or provider payload leaks into public Discover response.

- [x] **Task 8: Tests (AC10)**
  - [x] 8.1 — Add unit tests for scoring and status mapping.
  - [x] 8.2 — Add provider adapter tests with mocked Etherscan/Blockscout responses.
  - [x] 8.3 — Add route tests for cache/live/billing paths.
  - [x] 8.4 — Add worker test for Discover mutation behavior.
  - [x] 8.5 — Run relevant `bun test` and API typecheck.

## Dev Notes

### Critical Brownfield Guardrails

- Do not break Story 2.2 public Discover feed. Existing route `apps/api/src/discover/routes.ts` is public and intentionally projects only safe fields.
- Do not make the Discover worker depend on provider success. Provider timeout/errors should degrade to audit rows and retries, not block all news publishing.
- Do not infer dev wallets from tickers, project names, or article text. Use `project_wallet_watchlist`, future Story 2.1.2 entity labels, or explicit provider evidence only.
- Do not expose provider keys or raw provider payloads to OpenCode/sandbox/frontend.
- Keep migrations additive-only. No enum/table drops or destructive changes.

### Previous Story Intelligence To Apply

- From Story 2.1.1 and 2.1.2 planning: backend workers/services own provider credentials; Agent/OpenCode only reads Chainlens API/DB when a tool exists.
- From Story 2.1.1: provider cost/volume can explode. QuickNode is configured per chain and must be scoped by token/watchlist/lookback; avoid full-chain scanning.
- From Story 2.1.2: wallet/entity labels are cached DB facts. This story should consume those facts when available rather than calling premium identity providers inline.
- From Story 2.2.2: Discover alpha injection is already integrated in `discover-feed.ts`; add fact-checking as another conservative enrichment step, not a competing feed pipeline.
- Migration ordering is risky because new stories 2.1.1 and 2.1.2 are ready-for-dev but not implemented. Pick the next available migration sequence when coding.

### Current Code Patterns To Reuse

- `apps/api/src/queue/bullmq/workers/discover-feed.ts`
  - Lazy Queue/Worker initialization.
  - `queue.upsertJobScheduler`.
  - `worker.on('error')` and `worker.on('failed')` handlers.
  - AI summarization via OpenRouter and `generateObject`.
  - PII scrub before DB insert.
  - Idempotent insert with deterministic UUID and `onConflictDoNothing`.
- `apps/api/src/queue/bullmq/workers/social-sentiment-worker.ts`
  - Feature-flagged worker startup.
  - Sequential provider fetch to respect rate limits.
  - Per-token try/catch with partial success.
  - Numeric values stored as strings for Drizzle `numeric` columns.
- `apps/api/src/router/services/token-transactions.ts`
  - Etherscan-compatible chain map that can be reused as fallback shape.
  - Blockscout fallback.
  - Provider error normalization and empty-state handling.
- `apps/api/src/router/routes/token-holders.ts` and `token-transactions.ts`
  - Cache-first route pattern.
  - `combinedAuth` route protection.
  - `checkCredits` before live work.
  - Billing only when live provider work is done for holder route; follow that more conservative model.
- `packages/db/src/schema/epsilon.ts`
  - Use `epsilonSchema.table`.
  - Index definitions use Drizzle `index`/`uniqueIndex`.
  - Existing `warningLevelEnum` already includes `critical` and `alpha`.

### Provider/Chain Notes

- MVP should target EVM chains already represented in the repo: `ethereum`, `arbitrum`, `base`, `polygon`, plus compatible chains only when existing config supports them.
- QuickNode HTTP RPC is the default provider for this story. Configure one URL per chain; if a chain has no URL, skip that chain with a clear `provider_unavailable`/unconfigured status.
- Use `eth_getLogs` for bounded ERC-20 Transfer event scans and `eth_call` for `balanceOf`. Bound every call by contract, wallet/topic filters where possible, and lookback block window.
- Etherscan API V2 docs describe a unified API/key model across supported chains. Treat Etherscan-compatible `tokentx` as fallback/supplemental only, not the primary MVP provider.
- Blockscout account `tokentx` can be used as fallback, but instance behavior may differ. Treat it as best-effort and test error/empty states.
- Moralis token owners endpoint is useful for top holders/current ownership but does not by itself prove 24h dev selling. Use it only as supplemental context unless wallet-scoped transfer history exists.

### Suggested Risk Factor Codes

```typescript
type OnchainFactCheckStatus =
  | 'passed'
  | 'flagged'
  | 'insufficient_wallet_context'
  | 'provider_unavailable'
  | 'skipped';

type OnchainRiskFactorCode =
  | 'dev_wallet_dump_gt_threshold'
  | 'treasury_wallet_dump_gt_threshold'
  | 'team_wallet_net_outflow'
  | 'large_transfer_to_exchange'
  | 'insufficient_wallet_context'
  | 'provider_rate_limited'
  | 'transfer_only_confidence';
```

### Suggested API Response Shape

```typescript
interface OnchainFactCheckResponse {
  success: boolean;
  status: 'passed' | 'flagged' | 'insufficient_wallet_context' | 'provider_unavailable' | 'skipped';
  risk_level: 'none' | 'low' | 'medium' | 'high' | 'critical' | 'alpha';
  risk_factors: Array<{ code: string; label: string; severity: 'low' | 'medium' | 'high' | 'critical' }>;
  chain: string;
  token_address: string;
  token_symbol?: string;
  wallets_checked: number;
  net_outflow_pct: number | null;
  largest_wallet_outflow_pct: number | null;
  transfer_count: number;
  checked_at: string;
  cache_status: 'live' | 'cache_fresh' | 'cache_stale';
  source: 'db_cache' | 'etherscan' | 'blockscout' | 'mixed';
  evidence?: {
    lookback_hours: number;
    threshold_pct: number;
    wallet_roles: string[];
    tx_hashes_sample: string[];
    confidence?: number;
    missing_inputs?: string[];
  };
}
```

### Testing Notes

- Keep scoring logic pure and exported for tests. Do not test it only through worker side effects.
- Mock `fetch` for provider adapter tests. Do not call QuickNode, Etherscan, Blockscout, or Moralis in unit tests.
- Use seeded DB rows for route cache tests.
- Ensure tests cover stale/cache behavior because provider failures are expected under rate limits.

### Latest Technical Information Checked

- QuickNode Ethereum docs document standard JSON-RPC methods such as `eth_getLogs`; QuickNode SDK docs list core RPC functions for balance/log reads. Sources: https://www.quicknode.com/docs/ethereum/eth_getLogs, https://www.quicknode.com/docs/quicknode-sdk/Core/Core%20RPC%20Functions
- Etherscan API V2: official docs describe unified API across supported chains with one account/API key model.
- Etherscan ERC-20 transfers endpoint: `module=account&action=tokentx` is the official endpoint family for token transfer history.
- Moralis ERC20 owners endpoint: official docs expose `GET /erc20/{token_address}/owners`, matching the repo's current `token-holders.ts` integration.
- Blockscout account API: official docs include `tokentx` for ERC-20 token transfer events and token account balance support.
- BullMQ: current worker scheduling should use Job Schedulers / `upsertJobScheduler`, matching existing repo code.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-2.2.1]
- [Source: _bmad-output/planning-artifacts/prd.md#Product-Vision-and-Moat]
- [Source: _bmad-output/planning-artifacts/prd.md#Background-Data-Workers]
- [Source: _bmad-output/planning-artifacts/architecture.md#API-Pricing-Breakdown]
- [Source: _bmad-output/implementation-artifacts/2-2-ai-generated-discover-feed.md]
- [Source: _bmad-output/implementation-artifacts/2-2-2-social-sentiment-narrative-clustering.md]
- [Source: apps/api/src/queue/bullmq/workers/discover-feed.ts]
- [Source: apps/api/src/queue/bullmq/workers/social-sentiment-worker.ts]
- [Source: apps/api/src/router/services/token-transactions.ts]
- [Source: apps/api/src/router/services/token-holders.ts]
- [Source: packages/db/src/schema/epsilon.ts]
- [Etherscan API V2](https://docs.etherscan.io/etherscan-v2)
- [Etherscan ERC20 Token Transfers](https://docs.etherscan.io/api-reference/endpoint/tokentx)
- [QuickNode eth_getLogs](https://www.quicknode.com/docs/ethereum/eth_getLogs)
- [QuickNode SDK Core RPC Functions](https://www.quicknode.com/docs/quicknode-sdk/Core/Core%20RPC%20Functions)
- [Moralis ERC20 Token Holders](https://docs.moralis.com/web3-data-api/evm/reference/get-token-holders)
- [Blockscout Account API](https://docs.blockscout.com/devs/apis/rpc/account)
- [BullMQ Job Schedulers](https://docs.bullmq.io/guide/job-schedulers)

## Dev Agent Record

### Agent Model Used

GPT-5 (Codex)

### Debug Log References

- `bun test apps/api/src/__tests__/unit/onchain-fact-check-service.test.ts`
- `bun test apps/api/src/__tests__/unit/onchain-fact-check-route.test.ts`
- `bun test apps/api/src/__tests__/unit/onchain-fact-check-worker.test.ts`
- `bun test apps/api/src/__tests__/unit/onchain-fact-check-service.test.ts apps/api/src/__tests__/unit/onchain-fact-check-route.test.ts apps/api/src/__tests__/unit/onchain-fact-check-worker.test.ts`
- `bun run --cwd apps/api typecheck` (fails due unrelated pre-existing repo debt in billing/admin/oauth/platform/unit test areas)

### Completion Notes List

- Added on-chain fact-check config surface and env docs (`ONCHAIN_FACT_CHECK_*`, per-chain QuickNode RPC URLs).
- Added additive DB schema for `project_wallet_watchlist` and `onchain_fact_checks` with migration `0007_onchain_fact_checks.sql`.
- Implemented `onchain-fact-check` service with QuickNode JSON-RPC primary path (`eth_getLogs`, `eth_call`, latest block), Etherscan/Blockscout fallback, deterministic scoring, and cache-first flow.
- Added dedicated BullMQ worker/queue `onchain-fact-check` with jobs `fact-check-discover-item` and `refresh-recent-positive-feed`, scheduler via `upsertJobScheduler`, and lifecycle/error handlers.
- Integrated Discover worker pre-insert fact-check trigger for positive/promotional items with reliable `0x...` token address extraction and non-fatal timeout fallback persisted to audit table.
- Added authenticated API route `POST /v1/router/onchain-fact-check` (cache-first, `force_refresh` credit gate, billing only on live refresh).
- Added targeted unit tests for scoring, route billing/cache behavior, and worker mutation behavior.

### File List

- `apps/api/src/config.ts`
- `apps/api/.env.example`
- `packages/db/src/schema/epsilon.ts`
- `packages/db/src/index.ts`
- `packages/db/drizzle/0007_onchain_fact_checks.sql`
- `apps/api/src/router/services/onchain-fact-check.ts`
- `apps/api/src/queue/bullmq/workers/onchain-fact-check-worker.ts`
- `apps/api/src/router/routes/onchain-fact-check.ts`
- `apps/api/src/router/index.ts`
- `apps/api/src/queue/index.ts`
- `apps/api/src/index.ts`
- `apps/api/src/queue/bullmq/workers/discover-feed.ts`
- `apps/api/src/__tests__/unit/onchain-fact-check-service.test.ts`
- `apps/api/src/__tests__/unit/onchain-fact-check-route.test.ts`
- `apps/api/src/__tests__/unit/onchain-fact-check-worker.test.ts`

### Change Log

- 2026-05-17: Implemented Story 2.2.1 on-chain fact-check layer end-to-end (config, DB schema/migration, service, worker, route, discover integration, tests); set story status to `review`.
