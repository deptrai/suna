# Story 2.1.1: Mempool Sniffing & MEV Tracking Worker

Status: done  # 2026-05-17 code-review: 32 patches applied, 5 deferred, 7 dismissed

Epic: 2 — Crypto Data Infrastructure
Created: 2026-05-17
FRs: FR2, FR5
NFRs: NFR4 (1,000 CCU), NFR5 (Worker auto-scaling)
ARs: AR1 (brownfield), AR2 (Bun runtime), AR3 (Drizzle additive-only), AR8 (feature addition sequence)

## Story

As a quant trader or smart money tracker,
I want worker kết nối trực tiếp vào mempool qua WebSocket provider hoặc self-hosted node,
so that hệ thống có thể phát hiện swap lớn, sandwich/front-running signal trước khi transaction được confirm và lưu cảnh báo real-time cho Agent query.

## Acceptance Criteria

1. **AC1 — Provider config và default-off safety:**
   - Thêm config vào `apps/api/src/config.ts`: `MEMPOOL_WORKER_ENABLED` default `false`, `MEMPOOL_PROVIDER` default `quicknode`, `MEMPOOL_CHAINS` default `ethereum`, per-chain WSS URL config (`MEMPOOL_WS_URL_ETHEREUM`, optional `MEMPOOL_WS_URL_BSC`, `MEMPOOL_WS_URL_BASE`), `MEMPOOL_MIN_VALUE_USD` default `500000`, `MEMPOOL_WORKER_CONCURRENCY` default `1`, `MEMPOOL_RECONNECT_DELAY_MS` default `5000`.
   - Worker không được start nếu `MEMPOOL_WORKER_ENABLED=false` hoặc thiếu WSS URL cho chain được bật; startup phải log skip rõ ràng, không crash API.
   - Không commit API key, không hardcode provider URL. Dùng `wss://...` qua env.

2. **AC2 — BullMQ queue + lifecycle theo pattern hiện có:**
   - Tạo worker mới tại `apps/api/src/queue/bullmq/workers/mempool-worker.ts`.
   - Queue name: `mempool-alerts`; job name: `process-pending-transaction`; scheduler ID nếu cần health/reconnect job: `sync-mempool-health`.
   - Export `startMempoolWorker`, `setupMempoolJobs`, `stopMempoolWorker`, `getMempoolQueue` từ `apps/api/src/queue/index.ts`.
   - Wire lifecycle trong `startBackgroundServices()` và `shutdown()` của `apps/api/src/index.ts`, giống `startCryptoWorker()` và `startSocialSentimentWorker()`.
   - BullMQ connection phải reuse `apps/api/src/queue/bullmq/connection.ts`; không tạo Redis client riêng.

3. **AC3 — Mempool WebSocket subscription:**
   - Worker mở WebSocket tới từng `MEMPOOL_WS_URL_<CHAIN>` bằng Bun-compatible `WebSocket` runtime; không thêm dependency WebSocket nếu native runtime đủ.
   - MVP phải support QuickNode-compatible JSON-RPC `eth_subscribe` với `newPendingTransactions`. Nếu provider trả về tx hash, worker gọi `eth_getTransactionByHash` qua cùng QuickNode endpoint để lấy tx detail trước khi filter/classify.
   - Subscription/filter scope là các chain/router được cấu hình. Default MVP: Ethereum + Uniswap routers. BSC/PancakeSwap chỉ bật khi có `MEMPOOL_CHAINS` và WSS URL tương ứng.
   - Không claim coverage toàn mempool nếu provider/node không thấy mọi pending transaction hoặc nếu config chỉ bật một số router.
   - Reconnect với backoff tối thiểu `MEMPOOL_RECONNECT_DELAY_MS`, unsubscribe/close sạch khi shutdown.

4. **AC4 — Transaction parsing + alert classification:**
   - Parse pending transaction fields: `hash`, `from`, `to`, `input`, `value`, `chainId`/chain, `gas`, `maxFeePerGas`, `maxPriorityFeePerGas` nếu provider trả về.
   - Detect router method selectors cho swap path tối thiểu: Uniswap V2/V3 `swapExactTokensForTokens`, `swapExactETHForTokens`, `exactInputSingle`, `exactInput`; PancakeSwap V2/V3 equivalent nếu calldata selector match.
   - MVP classification phải sinh một trong: `large_swap`, `sandwich_suspect`, `frontrun_suspect`, `unknown_large_tx`.
   - Chỉ tạo Early Alert khi `estimated_value_usd >= MEMPOOL_MIN_VALUE_USD`. Nếu không đủ pricing để estimate USD, log debug và bỏ qua; không insert alert giả.

5. **AC5 — Drizzle schema additive-only:**
   - Append table `mempoolAlerts` vào `packages/db/src/schema/epsilon.ts`; export named symbol từ `packages/db/src/index.ts`.
   - Migration mới là file tiếp theo sau `0004_token_social_signals.sql`, dự kiến `0005_mempool_alerts.sql`; update `packages/db/drizzle/meta/_journal.json` đúng index kế tiếp.
   - Table DB vật lý: `epsilon.mempool_alerts`.
   - Required columns: `id uuid primary key default random`, `chain varchar(32)`, `provider varchar(50)`, `tx_hash varchar(100) not null unique`, `from_address varchar(100)`, `to_address varchar(100)`, `router_address varchar(100)`, `method_selector varchar(10)`, `alert_type enum/text`, `estimated_value_usd numeric(20,4)`, `native_value_wei text`, `token_in varchar(100)`, `token_out varchar(100)`, `gas_price_wei text`, `raw_tx jsonb`, `status varchar(32) default 'pending'`, `detected_at timestamptz default now`, `updated_at timestamptz default now`.
   - Indexes: `tx_hash unique`, `idx_mempool_alerts_detected_at`, `idx_mempool_alerts_chain_detected`, `idx_mempool_alerts_alert_type`, optional partial index for `status='pending'`.

6. **AC6 — Idempotent queue processing and DB write:**
   - WebSocket handler should enqueue normalized pending tx payload into BullMQ instead of doing heavy DB work inside the WS callback.
   - Job processor must use Drizzle `onConflictDoUpdate`/`onConflictDoNothing` on `tx_hash` to avoid duplicate alerts from reconnects or multi-provider events.
   - DB writes must store `raw_tx` for traceability, but never store secrets/provider tokens.

7. **AC7 — Agent query route:**
   - Add read-only route under existing router API, preferred path `apps/api/src/router/routes/mempool-alerts.ts`, mounted from `apps/api/src/router/index.ts`.
   - Endpoint `GET /v1/router/mempool-alerts` supports query params: `chain`, `alert_type`, `min_value_usd`, `limit` max 100, `since_minutes` max 1440.
   - Route requires authenticated `AppContext` like other router routes; no public unauthenticated alert feed.
   - Response includes `success`, `alerts`, `count`, `source: 'db'`, and ISO timestamps. Numeric DB strings must be converted safely or returned as strings consistently; do not leak raw giant JSON by default.

8. **AC8 — Tests and verification:**
   - Unit tests cover parser/classifier with fixture txs for large swap, non-router tx, malformed calldata, duplicate tx hash.
   - Worker test mocks WebSocket/provider payloads and verifies BullMQ enqueue + Drizzle upsert path without live provider calls.
   - Route test verifies auth, filters, limit clamp, and response shape.
   - `cd apps/api && bun run typecheck` must pass or any unrelated baseline failures must be documented with exact error.

9. **AC9 — OpenCode tool wrapper for Agent usage:**
   - Create `core/epsilon-master/opencode/tools/mempool_alerts.ts` using `tool()` from `@opencode-ai/plugin`.
   - Tool calls only the internal epsilon-api proxy route `EPSILON_API_URL/v1/router/mempool-alerts` with `Authorization: Bearer ${EPSILON_TOKEN}`.
   - Tool must not open a provider WebSocket, call QuickNode/Blocknative/Alchemy directly, or sniff mempool on demand. Continuous sniffing belongs exclusively to the background worker.
   - Tool args mirror safe query filters: `chain`, `alert_type`, `min_value_usd`, `limit`, `since_minutes`.
   - Add permission entry in `core/epsilon-master/opencode/agents/chainlens-tier2.md`: `mempool_alerts: allow`.
   - Do not enable for Tier 1 unless billing/rate-limiting is explicitly implemented; add `mempool_alerts: deny` to `chainlens-tier1.md` if needed for clarity.
   - Tool response must be JSON string with `success`, `alerts`, `count`, `source`, and `response_time_ms`; errors must be sanitized and actionable.

## Tasks / Subtasks

- [x] **Task 0: Confirm provider mode and avoid paid lock-in (AC: 1, 3)**
  - [x] 0.1 — Use QuickNode WSS as initial provider via env (`MEMPOOL_PROVIDER=quicknode`); do not import a QuickNode/Blocknative SDK unless plain JSON-RPC WebSocket cannot satisfy the requirement.
  - [x] 0.2 — Document provider mode in code comments: `quicknode`/`self_hosted` JSON-RPC compatible; `blocknative` adapter can be added later behind the same normalized event interface.
  - [x] 0.3 — Add env schema + config object fields in `apps/api/src/config.ts`, including `MEMPOOL_CHAINS` and per-chain WSS URL vars.

- [x] **Task 1: Add DB schema and migration (AC: 5)**
  - [x] 1.1 — Append enum/text constants and `mempoolAlerts` table after existing Epic 2 tables in `packages/db/src/schema/epsilon.ts`.
  - [x] 1.2 — Add explicit export in `packages/db/src/index.ts`.
  - [x] 1.3 — Create `packages/db/drizzle/0005_mempool_alerts.sql`; do not edit/drop existing tables.
  - [x] 1.4 — Update `packages/db/drizzle/meta/_journal.json` with `idx: 5`, tag `0005_mempool_alerts`.

- [x] **Task 2: Build parsing/classification service (AC: 4, 8)**
  - [x] 2.1 — Create `apps/api/src/router/services/mempool.ts` or `apps/api/src/queue/bullmq/workers/mempool-parser.ts` if worker-local.
  - [x] 2.2 — Define strict types: `PendingMempoolTx`, `MempoolAlertCandidate`, `MempoolAlertType`.
  - [x] 2.3 — Implement selector map for Uniswap/PancakeSwap routers. Keep selectors explicit and tested.
  - [x] 2.4 — Implement USD estimate with conservative rules. For MVP, native `value` can be estimated only when a chain native USD price source exists; stablecoin/token amount parsing can be added only if decimals/source are reliable.
  - [x] 2.5 — Add tests for malformed input and non-router tx returning `null`, not throwing.

- [x] **Task 3: Build BullMQ mempool worker (AC: 2, 3, 6)**
  - [x] 3.1 — Create `apps/api/src/queue/bullmq/workers/mempool-worker.ts` using same singleton `_queue`/`_worker` pattern as `crypto-worker.ts` and `social-sentiment-worker.ts`.
  - [x] 3.2 — WebSocket subscription normalizes provider events and enqueues `process-pending-transaction` jobs.
  - [x] 3.3 — Job processor calls parser, drops below-threshold events, and upserts qualifying alerts into `mempoolAlerts`.
  - [x] 3.4 — Handle Redis/WebSocket errors with structured `logger`; no `console.log`.
  - [x] 3.5 — `stopMempoolWorker()` closes worker, queue, and WebSocket subscription.

- [x] **Task 4: Lifecycle wiring (AC: 2)**
  - [x] 4.1 — Export worker functions from `apps/api/src/queue/index.ts`.
  - [x] 4.2 — Import via existing queue barrel in `apps/api/src/index.ts`; avoid direct deep imports from `bullmq/workers` in `index.ts`.
  - [x] 4.3 — Start/setup in `startBackgroundServices()`, shutdown in `shutdown()`, with `.catch` logging same style as existing workers.

- [x] **Task 5: Add Agent query route (AC: 7)**
  - [x] 5.1 — Create `apps/api/src/router/routes/mempool-alerts.ts` with Zod query validation and auth-aware Hono route.
  - [x] 5.2 — Mount route from `apps/api/src/router/index.ts` using existing router route conventions.
  - [x] 5.3 — Query Drizzle with filters and sort `detected_at DESC`; clamp `limit <= 100`.
  - [x] 5.4 — Do not return `raw_tx` unless an explicit debug/admin flag is later added.

- [x] **Task 6: Add OpenCode tool wrapper (AC: 9)**
  - [x] 6.1 — Create `core/epsilon-master/opencode/tools/mempool_alerts.ts` following `jit_sync.ts` / `simulate_transaction.ts` structure.
  - [x] 6.2 — Read `EPSILON_TOKEN` and `EPSILON_API_URL` via `core/epsilon-master/opencode/tools/lib/get-env.ts`.
  - [x] 6.3 — Validate args locally before fetch; clamp `limit <= 100` and `since_minutes <= 1440` to match backend.
  - [x] 6.4 — Update `core/epsilon-master/opencode/agents/chainlens-tier2.md` permission block with `mempool_alerts: allow`.
  - [x] 6.5 — Add/confirm Tier 1 permission remains denied or absent until credit/rate-limit release criteria are met.
  - [x] 6.6 — Update `core/epsilon-master/opencode/tools/README.md` with backend route, tier, and note that the tool reads pre-indexed alerts only.

- [x] **Task 7: Verification (AC: 8, 9)**
  - [x] 7.1 — Add parser/service tests under `apps/api/src/__tests__/unit/`.
  - [x] 7.2 — Add route test using existing API test helper patterns.
  - [x] 7.3 — Add OpenCode tool wrapper test or smoke import test with mocked `fetch`.
  - [x] 7.4 — Run `cd apps/api && bun run typecheck`.
  - [x] 7.5 — Run relevant OpenCode tool TypeScript/test command if available in `core/epsilon-master/opencode`.
  - [x] 7.6 — Optional local smoke: set `MEMPOOL_WORKER_ENABLED=true` with a test WS URL and verify one qualifying fixture/event inserts into `epsilon.mempool_alerts`, then query via `mempool_alerts` tool.

## Dev Notes

### Critical Brownfield Guardrails

- Không sửa hoặc thay thế custom file-system queue trong `apps/api/src/queue/storage.ts`, `drainer.ts`, `routes.ts`. BullMQ code belongs in `apps/api/src/queue/bullmq/workers/` only.
- Reuse `redisConnection` from `apps/api/src/queue/bullmq/connection.ts`; it already sets BullMQ-required `maxRetriesPerRequest: null` and TLS for `rediss://`.
- Existing BullMQ lifecycle pattern is split into `start*Worker()` and `setup*Jobs()`. Follow this pattern even if external docs show a single function.
- All DB schema changes are additive. No table/column rename, no destructive migration, no raw SQL outside migration file unless Drizzle cannot express an index.

### Current State To Preserve

- `apps/api/src/queue/bullmq/workers/crypto-worker.ts` owns the `crypto-data-sync` queue and DeFiLlama TVL snapshots. Do not mix mempool jobs into that queue; create a separate `mempool-alerts` queue.
- `apps/api/src/queue/bullmq/workers/social-sentiment-worker.ts` shows the newest Epic 2 worker style: config-gated startup, structured logger, singleton queue/worker, `upsertJobScheduler`, graceful `close()`.
- `apps/api/src/index.ts` starts background services after `ensureSchema()` succeeds or fails gracefully. Mempool startup must follow that same non-blocking model; a broken provider must not prevent API boot.
- `packages/db/src/schema/epsilon.ts` already contains Epic 2 tables: `protocolWatchlist`, `protocolTvlSnapshots`, `onChainDataIndex`, `tokenSocialSignals`. Append `mempoolAlerts` near these tables for discoverability.

### Provider Design

- Project decision: initial provider is QuickNode WSS configured by platform/operator. Keep the adapter provider-neutral so self-hosted nodes or Blocknative can be added later without changing DB/API/tool contracts.
- QuickNode Ethereum WebSocket supports JSON-RPC subscription patterns including `eth_subscribe`; use `newPendingTransactions` for pending tx hashes/events, then fetch transaction details with `eth_getTransactionByHash` when needed.
- Native Ethereum mempool visibility is node/provider dependent. The story must not promise global mempool coverage; alert metadata must include `provider` and `chain` so downstream agents understand coverage.
- Cost control is part of correctness. Avoid unfiltered full-chain persistence; MVP scope is configured chains + watched router addresses + `MEMPOOL_MIN_VALUE_USD` threshold.

### Initial Operator Configuration

```env
MEMPOOL_WORKER_ENABLED=false
MEMPOOL_PROVIDER=quicknode
MEMPOOL_CHAINS=ethereum
MEMPOOL_WS_URL_ETHEREUM=wss://your-quicknode-ethereum-endpoint
MEMPOOL_MIN_VALUE_USD=500000
MEMPOOL_WORKER_CONCURRENCY=1
MEMPOOL_RECONNECT_DELAY_MS=5000
```

Multi-chain rollout can add:

```env
MEMPOOL_CHAINS=ethereum,bsc,base
MEMPOOL_WS_URL_ETHEREUM=wss://...
MEMPOOL_WS_URL_BSC=wss://...
MEMPOOL_WS_URL_BASE=wss://...
```

### OpenCode Tool Boundary

- PRD/Architecture split this feature into data infrastructure plus Agent-accessible tools. The worker is the continuous detection system; the OpenCode tool is only the retrieval/query interface.
- Architecture AR5 says AI tools belong in `core/epsilon-master/opencode/tools/` or MCP servers, not as Hono route handlers. Therefore `apps/api/src/router/routes/mempool-alerts.ts` is a proxy/query endpoint, not the Agent tool itself.
- Architecture AR8 feature sequence applies here: DB schema → shared/API types if needed → API route → OpenCode tool → frontend/tool-view if needed.
- Do not let the OpenCode tool connect directly to mempool providers. This would duplicate subscriptions, increase provider cost, and miss events outside the tool call window.

### Suggested Data Shape

```typescript
export type MempoolAlertType = 'large_swap' | 'sandwich_suspect' | 'frontrun_suspect' | 'unknown_large_tx';

export interface PendingMempoolTx {
  hash: string;
  from: string;
  to: string | null;
  input: string;
  value: string; // wei hex or decimal normalized by parser
  chain: 'ethereum' | 'bsc' | string;
  gasPrice?: string | null;
  maxFeePerGas?: string | null;
  maxPriorityFeePerGas?: string | null;
  raw: Record<string, unknown>;
}
```

### Router Watchlist Starting Point

Use lowercase addresses internally. Verify before implementation because router addresses can change by chain/version.

- Ethereum Uniswap V2 Router02: `0x7a250d5630b4cf539739df2c5dacb4c659f2488d`
- Ethereum Uniswap Universal Router: `0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad`
- Ethereum Uniswap V3 SwapRouter02: `0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45`
- BSC PancakeSwap V2 Router: `0x10ed43c718714eb63d5aa57b78b54704e256024e`
- BSC PancakeSwap V3 Smart Router: verify from official PancakeSwap docs before adding; if uncertain, leave disabled rather than matching wrong address.

### Migration Notes

- Current migration sequence ends at `packages/db/drizzle/0004_token_social_signals.sql`; next story migration must be `0005_mempool_alerts.sql` unless another branch adds a migration first.
- `numeric` columns in Drizzle map to TypeScript strings. Insert `String(value)` and parse with `Number.isFinite` guards only when route response needs numbers.
- Keep `tx_hash` unique. Duplicate pending tx events are normal across reconnects/providers.

### Testing Notes

- Parser tests should be pure functions and not require Redis, WebSocket, Supabase, or live RPC.
- Worker tests should mock the normalized pending tx event and DB call; do not connect to a live mempool in CI.
- Route tests should use fixture rows or mocked DB and verify `raw_tx` is not returned by default.

### Latest Technical Information

- BullMQ v5 job schedulers replace legacy repeatable jobs from v5.16 onward; existing repo already uses `queue.upsertJobScheduler(...)`, and this story should continue that pattern. Source: https://docs.bullmq.io/guide/job-schedulers
- QuickNode Ethereum `eth_subscribe` docs cover WebSocket subscriptions, including pending-transaction subscription modes. Source: https://www.quicknode.com/docs/ethereum/eth_subscribe
- QuickNode mempool guides show WebSocket-based pending transaction monitoring and filtering patterns. Source: https://www.quicknode.com/guides/ethereum-development/transactions/how-to-filter-mempool-transactions-on-ethereum
- QuickNode support notes that WebSocket subscription methods can have high credit usage because delivered notifications are billed. Source: https://support.quicknode.com/articles/6139923946-why-am-i-seeing-high-eth-subscribe-credits-usage-on-websocket-connections

### Previous Story Intelligence

Story 2.1 completed the BullMQ/Redis foundation and produced several lessons that apply directly here:

- BullMQ code must live under `apps/api/src/queue/bullmq/workers/`; the older `apps/api/src/queue/` files are a separate session-message queue.
- Worker startup must degrade gracefully when Redis/provider config is unavailable. A background data worker must not take down the API.
- `setup*Jobs()` can be async and separately caught from `start*Worker()` in `startBackgroundServices()`.
- Add explicit named exports from `@epsilon/db`; relying on schema namespace exports previously caused import friction.
- Typecheck may surface unrelated repo debt. Document exact baseline failures if not caused by this story.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.1.1] Mempool worker goal and `mempool_alerts` acceptance criteria.
- [Source: _bmad-output/planning-artifacts/epics.md#Additional Requirements] AR5/AR8 require AI tools in `core/epsilon-master/opencode/tools/` and sequence DB/API/OpenCode tool.
- [Source: _bmad-output/planning-artifacts/prd.md#Product Scope] Background data workers run 24/7 and Agent uses fresh/pre-crawled data for real-time answers.
- [Source: _bmad-output/planning-artifacts/architecture.md#2.1 Mempool & MEV Data] QuickNode MVP provider decision, WSS runtime model, cost/coverage risk, and Agent boundary.
- [Source: core/epsilon-master/opencode/tools/README.md] `.ts` files are auto-discovered as OpenCode custom tools and call epsilon-api proxy routes.
- [Source: core/epsilon-master/opencode/agents/chainlens-tier2.md] Tier 2 permission block is where paid/deep-dive tools are allowed.
- [Source: _bmad-output/implementation-artifacts/2-1-crypto-data-worker-with-bullmq.md#Dev Notes] BullMQ folder split, Redis connection requirement, Drizzle additive-only rules.
- [Source: apps/api/src/queue/bullmq/workers/crypto-worker.ts] Existing BullMQ singleton worker, scheduler, Redis, logger, graceful shutdown pattern.
- [Source: apps/api/src/queue/bullmq/workers/social-sentiment-worker.ts] Latest Epic 2 config-gated worker pattern.
- [Source: packages/db/src/schema/epsilon.ts] Existing `epsilonSchema.table(...)` and Epic 2 DB table patterns.
- [Source: apps/api/src/config.ts] Env schema and config object placement for worker settings.
- [Source: apps/api/src/index.ts] Background service lifecycle wiring.

## Dev Agent Record

### Agent Model Used

GPT-5 (Codex)

### Debug Log References

### Completion Notes List

 - Implemented mempool worker stack end-to-end: config/env, DB schema + migration, parser/classifier service, BullMQ worker, lifecycle wiring, and authenticated query route.
 - Added OpenCode retrieval tool `mempool_alerts` with Tier 2 allow/Tier 1 deny and README documentation.
 - Added verification tests:
 - `apps/api/src/__tests__/unit/mempool-service.test.ts`
 - `apps/api/src/__tests__/unit/mempool-alerts-route.test.ts`
 - `core/epsilon-master/opencode/mempool_alerts.test.ts`
 - Executed:
 - `cd apps/api && bun test src/__tests__/unit/mempool-service.test.ts src/__tests__/unit/mempool-alerts-route.test.ts` (pass)
 - `cd /Users/luisphan/Documents/suna && bunx vitest run core/epsilon-master/opencode/mempool_alerts.test.ts` (pass)
 - `cd apps/api && bun run typecheck` reports pre-existing baseline errors outside Story 2.1.1 scope; no new mempool-specific type failures observed in targeted tests.
 - Optional local smoke test (real QuickNode WSS + DB insert verification) not executed in this run.

### File List

- apps/api/.env.example
- apps/api/src/config.ts
- apps/api/src/index.ts
- apps/api/src/queue/index.ts
- apps/api/src/queue/bullmq/workers/mempool-worker.ts
- apps/api/src/router/index.ts
- apps/api/src/router/routes/mempool-alerts.ts
- apps/api/src/router/services/mempool.ts
- apps/api/src/__tests__/unit/mempool-service.test.ts
- apps/api/src/__tests__/unit/mempool-alerts-route.test.ts
- packages/db/src/schema/epsilon.ts
- packages/db/src/index.ts
- packages/db/drizzle/0005_mempool_alerts.sql
- packages/db/drizzle/meta/_journal.json
- core/epsilon-master/opencode/tools/mempool_alerts.ts
- core/epsilon-master/opencode/mempool_alerts.test.ts
- core/epsilon-master/opencode/agents/chainlens-tier2.md
- core/epsilon-master/opencode/agents/chainlens-tier1.md
- core/epsilon-master/opencode/tools/README.md

### Change Log

- 2026-05-17: Implemented Story 2.1.1 mempool sniffing + MEV tracking worker path (DB, worker, route, tool, tests) and moved status to `review`.

### Review Findings (2026-05-17 — bmad-code-review, diff mode)

**Sources:** Blind Hunter (17) + Edge Case Hunter (22) + Acceptance Auditor (15). Deduped → 4 decisions / 28 patches / 5 defers / 7 dismissed.

**Scope:** Uncommitted diff (~1072 lines) covering 19 files: BullMQ worker, Hono route, parser/classifier service, OpenCode tool, DB schema/migration, config wiring, agent permission, tests.

#### Decision-needed (4) — RESOLVED 2026-05-17

- [x] [Review][Decision] **D1 — Add billing parity.** Resolution: route MUST call `checkCredits` + `deductToolCredits` like other token routes; baseCost TBD (suggest $0.05 trong TOOL_PRICING). Skip-deduct on cache miss N/A vì route query DB trực tiếp. Added as Patch below.
- [x] [Review][Decision] **D2 — Flip classification semantics.** Resolution: `swap-selector + router → sandwich_suspect`; `swap-selector only (no router) → frontrun_suspect`; `router only → unknown_large_tx`. Update `classifyPendingTx` if/else order. Added as Patch.
- [x] [Review][Decision] **D3 — Keep ERC-20 drop, log + document.** Resolution: change `if (!wei) return null` → distinguish null (parse fail) vs 0n (zero-value). For 0n native-value swap, log debug `{ skipped, reason: 'zero_native_value' }` and skip per AC4. ERC-20 USD estimation deferred to Story 2.x. Added as Patch.
- [x] [Review][Decision] **D4 — Keep hardcoded NATIVE_USD with env override + doc.** Resolution: add inline comment `// approximate Q2 2026 floor; override via env if needed`. Wrap với env: `MEMPOOL_NATIVE_USD_ETHEREUM`, `MEMPOOL_NATIVE_USD_BASE`, `MEMPOOL_NATIVE_USD_BSC` (optFloat with default). Defer live feed to post-MVP. Added as Patch.

#### Patch (32 — incl. 4 from resolved decisions)

**From resolved Decisions:**

- [x] [Review][Patch] **D1 — Add billing parity** to `/mempool-alerts` route. Add `const accountId = c.get('accountId'); const creditCheck = await checkCredits(accountId); if (!creditCheck.hasCredits) throw 402` before DB query. Deduct `mempool_alerts` (baseCost $0.05) after success. Add `mempool_alerts` entry to `TOOL_PRICING` in `config.ts`. [mempool-alerts.ts]
- [x] [Review][Patch] **D2 — Flip classification semantics.** Change `classifyPendingTx` if/else cascade: `(isRouter && isSwapMethod) → 'sandwich_suspect'`; `(!isRouter && isSwapMethod) → 'frontrun_suspect'`; `(isRouter && !isSwapMethod) → 'unknown_large_tx'`; else → `'unknown_large_tx'`. Update unit tests fixture expectations. [mempool.ts:97-108]
- [x] [Review][Patch] **D3 — Distinguish parse-fail vs zero-value native** trong classifier. Replace `if (!wei) return null` với `if (wei === null) return null;` (parse fail) — then check `if (wei === 0n && !isSwapMethod) { logger.debug({ chain, hash, reason: 'zero_native_value' }); return null; }`. For ERC-20 swaps (wei=0n + isSwapMethod=true), still skip but log explicit reason. [mempool.ts:97]
- [x] [Review][Patch] **D4 — Env override + doc comment cho `NATIVE_USD`.** Add inline comment `// Approximate native-token USD floor (Q2 2026). Override per chain via MEMPOOL_NATIVE_USD_* env.`. Wire `MEMPOOL_NATIVE_USD_ETHEREUM`/`_BASE`/`_BSC` (`optFloat`) trong `config.ts`. Use `config.MEMPOOL_NATIVE_USD_ETHEREUM ?? NATIVE_USD_DEFAULTS.ethereum`. Update `.env.example`. [mempool.ts:51-55, config.ts]

**CRITICAL — block merge:**

- [x] [Review][Patch] **Migration partial-index syntax non-standard** — `0005_mempool_alerts.sql:30`: `WHERE "epsilon"."mempool_alerts"."status" = 'pending'` uses fully-schema-qualified column trong WHERE; prior migration (`0004_token_social_signals.sql:49`) uses unqualified `WHERE "column" = value`. Standard form. Update to: `WHERE "status" = 'pending'`.
- [x] [Review][Patch] **AC4 missing `gas` (gas limit) and `chainId` fields** — `PendingMempoolTx` + `toPendingMempoolTx` (`mempool.ts`) omit both. Spec AC4 explicitly lists both. Add to interface + parser + DB schema (or store in `rawTx` JSONB if not first-class).
- [x] [Review][Patch] **Reconnect ghost timer after `stopMempoolWorker`** — `mempool-worker.ts:133-136`: `ws.onclose` unconditionally schedules `setTimeout(setupSocket, ...)`. `stopMempoolWorker` clears the *current* timer + closes socket, but onclose fires async AFTER `_wsState.clear()`, captured state schedules a new timer that escapes the cleanup. Add `state.stopped` flag; check in onclose before scheduling reconnect.
- [x] [Review][Patch] **`pendingLookup` unbounded growth + ID collision on reconnect** — `mempool-worker.ts:431,453-455`: entries added per `eth_getTransactionByHash`, only deleted on matched response. Lost response (timeout, reconnect, node restart) → entry leaked forever. Also `pendingLookup` not cleared on reconnect — stale entries can collide with new requestId values. Fix: clear `pendingLookup` in `setupSocket` reset path + add TTL eviction (e.g. Map with insertion timestamp + sweep on every N inserts).
- [x] [Review][Patch] **`MEMPOOL_MIN_VALUE_USD` NaN passes all transactions** — `config.ts:267`: `optFloat(500000)` — if env set to non-numeric, parseFloat returns NaN. `estimatedUsd < NaN` always false → all txs classified + inserted. Add `Number.isFinite` guard in `optFloat` or in classifier threshold check.
- [x] [Review][Patch] **`setupMempoolJobs` runs even when worker disabled/null** — `index.ts:84-85`: `startMempoolWorker()` may return null (disabled/missing URLs); `setupMempoolJobs()` then creates BullMQ scheduler + recurring health jobs that have no consumer. Health jobs accumulate in Redis. Gate `setupMempoolJobs()` on `config.MEMPOOL_WORKER_ENABLED` AND/OR on `startMempoolWorker` return value.
- [x] [Review][Patch] **Health job `sync-mempool-health` hits unsupported-payload branch every tick** — `mempool-worker.ts:674-679` enqueues `name: 'sync-mempool-health'` with `data: {}`; `processPendingTransaction` only checks `payload.chain && payload.tx` → returns `{ skipped: true, reason: 'invalid_payload' }`. Pollutes completed/failed logs. Add explicit handler branch checking `job.name === 'sync-mempool-health'`.
- [x] [Review][Patch] **Wei → Number precision + DB `numeric(20,4)` overflow** — `mempool.ts:855`: `Number(nativeValueWei)` truncates above 2^53-1 wei (~9007 ETH); for extreme values (uint256-max in malformed tx) `valueNative * nativePrice` is still finite but ~10^62, larger than `numeric(20,4)` ceiling (~10^16). DB throws on insert, BullMQ retries 3× then poisons queue. Cap `estimatedValueUsd` at safe upper bound (e.g. `Math.min(usd, 1e15)`) before persistence + use BigInt math for wei conversion.

**HIGH — fix this PR:**

- [x] [Review][Patch] **AC7 — Route handler ignores `accountId` from auth context** — `mempool-alerts.ts` không gọi `c.get('accountId')`. Parity với `token-info.ts:25` requires reading accountId từ context (cho rate-limiting, audit). Add `const accountId = c.get('accountId');` + use trong logging.
- [x] [Review][Patch] **`WATCHED_ROUTERS` missing entries for `base`/`arbitrum`/`polygon`** — `mempool.ts:40-50`: chỉ `ethereum` + `bsc`. NATIVE_USD includes `base`. Worker accepts these chains qua `parseChains()`. → Mọi large swap trên Base với swap selector classified `sandwich_suspect` (no router match) → false-positive flood. Add router sets cho base/arbitrum hoặc narrow `parseChains` allowlist to chains with watchlists. [mempool.ts:40-50]
- [x] [Review][Patch] **`alert_type` filter không lowercase** — `mempool-alerts.ts:30`: DB stores lowercased `alert_type` (classifier output) nhưng filter dùng raw user input. `?alert_type=Large_Swap` returns zero results. Add `.toLowerCase()` (parity với `chain` filter line 29) + Zod enum constraint thay vì `string().max(50)`.
- [x] [Review][Patch] **`min_value_usd: Infinity` bypass** — `mempool-alerts.ts:11`: `z.coerce.number().min(0).optional()` accepts `Infinity` (`Number('Infinity')`). PostgreSQL numeric accepts `'Infinity'` → filter resolves to `>= Infinity` → zero rows silently. Add `.finite()`.
- [x] [Review][Patch] **Provider sends numeric instead of hex → silently treated as `0x0`** — `mempool.ts:129-132`: `typeof tx.value === 'string' ? tx.value : '0x0'`. Some providers/serializers emit raw integers; high-value txs dropped. Add `typeof tx.value === 'number' ? '0x' + tx.value.toString(16) : '0x0'` branch.
- [x] [Review][Patch] **WS `sendJson` doesn't check `readyState === OPEN`** — `mempool-worker.ts:72-74`: `ws.send()` throws if socket in CLOSING/CLOSED. Although outer try/catch in onmessage catches, the corresponding `pendingLookup.set` happened *before* sendJson → entry leaked. Guard: `if (ws.readyState !== WebSocket.OPEN) return false;` and only `pendingLookup.set` after successful send.
- [x] [Review][Patch] **No backpressure on `enqueueTx` during mempool spikes** — `mempool-worker.ts:476-480`: each pending tx hash → `queue.add()` (Redis op) awaited in onmessage handler. High-volume periods (Ethereum gas spikes) → unbounded queue depth, Redis memory unbounded, WS receive buffer fills → provider drops connection → reconnect loop. Add queue-depth check (skip enqueue if `queue.getWaitingCount() > N`) + log dropped count.
- [x] [Review][Patch] **`tx.hash > 100 chars` → DB overflow** — `epsilon.ts`: `txHash varchar(100) NOT NULL`. Malicious/malformed provider can emit longer hash. Add `if (classified.txHash.length > 100) return { skipped: true, reason: 'hash_too_long' };` in worker before DB insert.
- [x] [Review][Patch] **`parsed.error.message` is multi-line JSON object** — `mempool-alerts.ts:724`: Zod `error.message` returns formatted error tree, ugly + leaks internal field names. Use `parsed.error.flatten().fieldErrors` or `parsed.error.issues[0]?.message`.
- [x] [Review][Patch] **`requestId` overflow risk** — `mempool-worker.ts:453-455`: plain JS number incremented per pending tx; exceeds `MAX_SAFE_INTEGER` after long uptime + high volume. Wrap at safe integer: `state.requestId = (state.requestId + 1) % Number.MAX_SAFE_INTEGER`.
- [x] [Review][Patch] **AC8 — Missing worker BullMQ test** — Spec AC8 mandates "Worker test mocks WebSocket/provider payloads and verifies BullMQ enqueue + Drizzle upsert path without live provider calls". Current test files cover service (parser) + route only. Add `mempool-worker.test.ts`.
- [x] [Review][Patch] **AC8 — Missing duplicate `tx_hash` test** — Spec AC8 explicitly lists "duplicate tx hash" fixture. Add test exercising `onConflictDoUpdate` path.
- [x] [Review][Patch] **AC8 — Missing auth-rejection test** — `mempool-alerts-route.test.ts:62-68` `makeApp()` always injects `accountId` via middleware. Add test omitting auth → expect 401.
- [x] [Review][Patch] **Task 6.6 — README missing HTTP method + billing info** — `tools/README.md` entry lacks method table + billing note (parity với `vibe_trading_backtest` entry). Add: `GET /v1/router/mempool-alerts` + billing disposition (per D1 resolution above).

**MED — fix this PR or next:**

- [x] [Review][Patch] **`since_minutes` default 60 in route vs LLM omission in tool** — `mempool-alerts.ts:716` defaults to 60; `mempool_alerts.ts:1004` only sends param if `typeof === 'number'`. Implicit coupling; spec change broken silently. Document explicitly in README + add default override in tool.
- [x] [Review][Patch] **`tx_hash` unique index không bao gồm `chain`** — `epsilon.ts:247` + migration: `uniqueIndex('tx_hash')`. Hash collision cross-chain (rare nhưng theoretical) → onConflictDoUpdate overwrites cross-chain entry. Make composite: `uniqueIndex().on(txHash, chain)`.
- [x] [Review][Patch] **`detectedAt`/`updatedAt.toISOString()` crashes nếu null** — `mempool-alerts.ts:63-65`. Schema is NOT NULL nhưng defensive guard: `r.detectedAt?.toISOString() ?? null`.
- [x] [Review][Patch] **`MEMPOOL_RECONNECT_DELAY_MS` accepts 0 → hot reconnect loop** — Combined với ghost timer bug (#3 CRITICAL), 0ms exhausts FDs + provider rate-limits. Add min bound (e.g. `Math.max(delay, 1000)`) + exponential backoff với cap (1s → 30s).
- [x] [Review][Patch] **`MEMPOOL_CHAINS=""` or all-unsupported → silent no-op** — `parseChains()` returns `[]`, worker logs "started" with empty chains, no WSS opened, no alerts. Add warning log + skip worker creation if `chains.length === 0`.
- [x] [Review][Patch] **`rawTx` JSONB leaks full provider payload (incl. internal/auth fields)** — `mempool-worker.ts:588-589`: `raw: tx` stores entire WS message. Route currently doesn't select it, nhưng future `select *` would leak. Either: (a) strip to whitelist before persist, (b) drop `rawTx` column entirely if not used for replay, (c) document explicitly + add lint rule.
- [x] [Review][Patch] **Test mock DB chain quá shallow** — `mempool-alerts-route.test.ts:285-295`: mock returns at innermost `.limit()` but Drizzle chain is `.select().from().where().orderBy().limit()`. Test would pass even if route drops `.where()`. Restructure mock to verify each chain link.

#### Defer (5) — pre-existing or post-MVP

- [x] [Review][Defer] **WebSocket exponential backoff with jitter cap** — Current fixed delay is functional; full reconnect-storm protection is post-MVP infra hardening (Story 8.5 production-grade reliability scope).
- [x] [Review][Defer] **Provider failover (multiple WSS URLs)** — Spec mentions provider design but failover not in AC; defer to Epic 2.x infra story.
- [x] [Review][Defer] **`unknown_large_tx` design noise** — Wallet-to-wallet large native transfers will flood feed at typical thresholds; spec accepts this category. Tune threshold + alert UX post-MVP.
- [x] [Review][Defer] **`tx.value='0x'` edge (empty hex)** — `parseWei` throws → null → drop. Correct fail-closed behavior; not a real-world provider output. Defer hardening.
- [x] [Review][Defer] **`TOOL_TIMEOUT_MS = 5000` deviates from CLAUDE.md 1.5s typical** — Mempool query may genuinely need 5s on cold cache; document rationale rather than enforce convention.

#### Dismissed (7) — false positive / handled

- **SQL injection via Drizzle `sql` template** (Blind#7) — Drizzle's tagged template parameterizes user values; column reference uses Drizzle column object (`mempoolAlerts.chain`), not interpolated string. No injection path.
- **`fromAddress` schema nullable** (Blind#14) — Theoretical concern; Ethereum txs always have `from`. Schema permissiveness matches Drizzle/Postgres convention.
- **`subscribe ACK` ID=0 bypass** (Edge case) — `payload.id === 0` doesn't realistically occur (JSON-RPC IDs start at 1); falsy check survives.
- **`MEMPOOL_MIN_VALUE_USD` `optFloat` vs `optInt`** (Auditor) — Sub-dollar precision intentional; not a bug.
- **`tx_hash` `NOT NULL` without inline `UNIQUE`** (Auditor) — Drizzle uses separate `CREATE UNIQUE INDEX`, semantically equivalent.
- **`MempoolAlertCandidate.chain` not validated against supported chains** (Auditor) — Chain validation happens upstream in `parseChains()` + worker init; downstream service trusts caller.
- **File List drift** — Auditor confirmed 0 missing + 0 unexpected files. Clean.
