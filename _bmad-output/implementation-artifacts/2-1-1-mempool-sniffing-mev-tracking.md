# Story 2.1.1: Mempool Sniffing & MEV Tracking Worker

Status: ready-for-dev

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

- [ ] **Task 0: Confirm provider mode and avoid paid lock-in (AC: 1, 3)**
  - [ ] 0.1 — Use QuickNode WSS as initial provider via env (`MEMPOOL_PROVIDER=quicknode`); do not import a QuickNode/Blocknative SDK unless plain JSON-RPC WebSocket cannot satisfy the requirement.
  - [ ] 0.2 — Document provider mode in code comments: `quicknode`/`self_hosted` JSON-RPC compatible; `blocknative` adapter can be added later behind the same normalized event interface.
  - [ ] 0.3 — Add env schema + config object fields in `apps/api/src/config.ts`, including `MEMPOOL_CHAINS` and per-chain WSS URL vars.

- [ ] **Task 1: Add DB schema and migration (AC: 5)**
  - [ ] 1.1 — Append enum/text constants and `mempoolAlerts` table after existing Epic 2 tables in `packages/db/src/schema/epsilon.ts`.
  - [ ] 1.2 — Add explicit export in `packages/db/src/index.ts`.
  - [ ] 1.3 — Create `packages/db/drizzle/0005_mempool_alerts.sql`; do not edit/drop existing tables.
  - [ ] 1.4 — Update `packages/db/drizzle/meta/_journal.json` with `idx: 5`, tag `0005_mempool_alerts`.

- [ ] **Task 2: Build parsing/classification service (AC: 4, 8)**
  - [ ] 2.1 — Create `apps/api/src/router/services/mempool.ts` or `apps/api/src/queue/bullmq/workers/mempool-parser.ts` if worker-local.
  - [ ] 2.2 — Define strict types: `PendingMempoolTx`, `MempoolAlertCandidate`, `MempoolAlertType`.
  - [ ] 2.3 — Implement selector map for Uniswap/PancakeSwap routers. Keep selectors explicit and tested.
  - [ ] 2.4 — Implement USD estimate with conservative rules. For MVP, native `value` can be estimated only when a chain native USD price source exists; stablecoin/token amount parsing can be added only if decimals/source are reliable.
  - [ ] 2.5 — Add tests for malformed input and non-router tx returning `null`, not throwing.

- [ ] **Task 3: Build BullMQ mempool worker (AC: 2, 3, 6)**
  - [ ] 3.1 — Create `apps/api/src/queue/bullmq/workers/mempool-worker.ts` using same singleton `_queue`/`_worker` pattern as `crypto-worker.ts` and `social-sentiment-worker.ts`.
  - [ ] 3.2 — WebSocket subscription normalizes provider events and enqueues `process-pending-transaction` jobs.
  - [ ] 3.3 — Job processor calls parser, drops below-threshold events, and upserts qualifying alerts into `mempoolAlerts`.
  - [ ] 3.4 — Handle Redis/WebSocket errors with structured `logger`; no `console.log`.
  - [ ] 3.5 — `stopMempoolWorker()` closes worker, queue, and WebSocket subscription.

- [ ] **Task 4: Lifecycle wiring (AC: 2)**
  - [ ] 4.1 — Export worker functions from `apps/api/src/queue/index.ts`.
  - [ ] 4.2 — Import via existing queue barrel in `apps/api/src/index.ts`; avoid direct deep imports from `bullmq/workers` in `index.ts`.
  - [ ] 4.3 — Start/setup in `startBackgroundServices()`, shutdown in `shutdown()`, with `.catch` logging same style as existing workers.

- [ ] **Task 5: Add Agent query route (AC: 7)**
  - [ ] 5.1 — Create `apps/api/src/router/routes/mempool-alerts.ts` with Zod query validation and auth-aware Hono route.
  - [ ] 5.2 — Mount route from `apps/api/src/router/index.ts` using existing router route conventions.
  - [ ] 5.3 — Query Drizzle with filters and sort `detected_at DESC`; clamp `limit <= 100`.
  - [ ] 5.4 — Do not return `raw_tx` unless an explicit debug/admin flag is later added.

- [ ] **Task 6: Add OpenCode tool wrapper (AC: 9)**
  - [ ] 6.1 — Create `core/epsilon-master/opencode/tools/mempool_alerts.ts` following `jit_sync.ts` / `simulate_transaction.ts` structure.
  - [ ] 6.2 — Read `EPSILON_TOKEN` and `EPSILON_API_URL` via `core/epsilon-master/opencode/tools/lib/get-env.ts`.
  - [ ] 6.3 — Validate args locally before fetch; clamp `limit <= 100` and `since_minutes <= 1440` to match backend.
  - [ ] 6.4 — Update `core/epsilon-master/opencode/agents/chainlens-tier2.md` permission block with `mempool_alerts: allow`.
  - [ ] 6.5 — Add/confirm Tier 1 permission remains denied or absent until credit/rate-limit release criteria are met.
  - [ ] 6.6 — Update `core/epsilon-master/opencode/tools/README.md` with backend route, tier, and note that the tool reads pre-indexed alerts only.

- [ ] **Task 7: Verification (AC: 8, 9)**
  - [ ] 7.1 — Add parser/service tests under `apps/api/src/__tests__/unit/`.
  - [ ] 7.2 — Add route test using existing API test helper patterns.
  - [ ] 7.3 — Add OpenCode tool wrapper test or smoke import test with mocked `fetch`.
  - [ ] 7.4 — Run `cd apps/api && bun run typecheck`.
  - [ ] 7.5 — Run relevant OpenCode tool TypeScript/test command if available in `core/epsilon-master/opencode`.
  - [ ] 7.6 — Optional local smoke: set `MEMPOOL_WORKER_ENABLED=true` with a test WS URL and verify one qualifying fixture/event inserts into `epsilon.mempool_alerts`, then query via `mempool_alerts` tool.

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

TBD by dev agent.

### Debug Log References

### Completion Notes List

### File List
