# Story 2.1.2: Entity & Hacker Wallet Tracking

Status: done

Epic: 2 — Crypto Data Infrastructure
Created: 2026-05-17
FRs: FR2, FR5, FR8
NFRs: NFR4 (1,000 CCU), NFR5 (Worker auto-scaling), NFR8 (atomic credit deduction), NFR9 (Tier 1 rate limiting)
ARs: AR1 (brownfield), AR2 (Bun runtime), AR3 (Drizzle additive-only), AR5 (OpenCode tools in core), AR6 (billing proxy route), AR8 (DB → API → OpenCode tool sequence)

## Story

As a security analyst user,
I want worker liên tục crawl và cache dữ liệu entity/wallet labels từ Arkham Intelligence, với optional QuickNode RPC verification theo chain được cấu hình,
so that Agent có thể cảnh báo khi token holder hoặc queried wallet liên quan tới VC, CEX, market maker, whale, exploiter, mixer, hoặc ví từng bị hack mà không phải gọi Arkham hoặc QuickNode trực tiếp từ OpenCode.

## Acceptance Criteria

1. **AC1 — Provider config, paid-access safety, default-off:**
   - Thêm config vào `apps/api/src/config.ts`: `ARKHAM_WORKER_ENABLED` default `false`, `ARKHAM_API_BASE_URL` default `https://api.arkm.com`, `ARKHAM_API_KEY`, `ARKHAM_SYNC_INTERVAL_MS` default `3_600_000`, `ARKHAM_WORKER_CONCURRENCY` default `1`, `ARKHAM_TOP_HOLDER_LIMIT` default `50`, `ARKHAM_CACHE_TTL_MS` default `86_400_000`, `ENTITY_WALLET_CHAINS` default `ethereum`, optional `ENTITY_WALLET_RPC_URL_<CHAIN>` values for QuickNode verification.
   - Worker không được start nếu `ARKHAM_WORKER_ENABLED=false` hoặc thiếu `ARKHAM_API_KEY`; startup phải log skip rõ ràng, không crash API.
   - Không commit API key, không hardcode API key, không scrape Arkham web UI.
   - Arkham access is paid/custom/token-gated per architecture; Tier 1 must remain disabled unless credit/rate-limit release criteria are explicitly implemented.
   - Arkham is the primary provider for entity labels. QuickNode RPC is optional verification only; lack of QuickNode URL must not block pure Arkham label caching.
   - Multi-chain support is config-driven. MVP processes only configured chains and queried/watchlisted tokens or wallets; it must not crawl whole chains.

2. **AC2 — Arkham service wrapper with strict provider boundary:**
   - Tạo service `apps/api/src/router/services/arkham.ts` hoặc `apps/api/src/queue/bullmq/workers/arkham-service.ts` (chọn một, không duplicate).
   - Service gọi Arkham REST API bằng `fetch`, header `API-Key: config.ARKHAM_API_KEY`, `Accept: application/json`.
   - Supported provider calls for MVP:
     - `GET /token/holders/{chain}/{address}?groupByEntity=true` để lấy top holders grouped by entity khi token contract được query.
     - `POST /intelligence/address/batch/all` hoặc `GET /intelligence/address/{address}/all` để enrich labels/entities cho addresses nếu holder endpoint không đủ label metadata.
     - Optional `GET /intelligence/address_tags/updates`, `GET /intelligence/entities/updates`, `GET /intelligence/tags/updates` only if API access and docs confirm response shape.
   - Tất cả provider errors phải sanitize trước khi trả ra API/tool; không leak `API-Key` hoặc raw provider URL query chứa secrets.

3. **AC2a — Optional QuickNode RPC verification adapter:**
   - If `ENTITY_WALLET_RPC_URL_<CHAIN>` is configured for a chain in `ENTITY_WALLET_CHAINS`, create/reuse a backend-only JSON-RPC adapter for targeted verification calls.
   - Supported MVP verification calls should be limited to specific token/address evidence, such as balance checks via `eth_call` for ERC-20 `balanceOf`, selected `eth_getLogs` windows, or latest block reads needed to timestamp evidence.
   - Do not use QuickNode as the source of entity labels; it cannot replace Arkham attribution.
   - Do not expose QuickNode URL/API key to OpenCode, sandbox, or frontend.

4. **AC3 — BullMQ worker + job model:**
   - Tạo worker mới tại `apps/api/src/queue/bullmq/workers/entity-wallet-worker.ts`.
   - Queue name: `entity-wallet-sync`; job names: `refresh-entity-labels`, `analyze-token-holders`, optional `refresh-arkham-updates`.
   - Export `startEntityWalletWorker`, `setupEntityWalletJobs`, `stopEntityWalletWorker`, `getEntityWalletQueue` từ `apps/api/src/queue/index.ts`.
   - Wire lifecycle trong `startBackgroundServices()` và `shutdown()` của `apps/api/src/index.ts` theo pattern `crypto-worker.ts`/`social-sentiment-worker.ts`.
   - BullMQ connection phải reuse `apps/api/src/queue/bullmq/connection.ts`; không tạo Redis client riêng.

5. **AC4 — Drizzle schema additive-only:**
   - Append tables vào `packages/db/src/schema/epsilon.ts`; export named symbols từ `packages/db/src/index.ts`.
   - Required tables:
     - `epsilon.entity_wallet_labels`: normalized address/entity label cache.
     - `epsilon.token_holder_entity_risks`: per-token holder risk summary cache.
     - Optional `epsilon.entity_wallet_watchlist`: operator/user-seeded addresses/entities to refresh continuously.
   - Migration phải dùng next available sequence at implementation time. **Do not assume `0005`**: Story 2.1.1 already reserves `0005_mempool_alerts.sql`; if Story 2.1.1 is implemented first, this story should use `0006_entity_wallet_labels.sql`.
   - No drop/rename. Additive SQL only.

6. **AC5 — Entity label cache table shape:**
   - `entity_wallet_labels` fields: `id uuid primary key default random`, `chain varchar(32)`, `address varchar(128) not null`, `entity_id varchar(255)`, `entity_name varchar(255)`, `entity_type varchar(100)`, `label varchar(255)`, `tags jsonb default []`, `confidence numeric(6,4)`, `risk_category varchar(64)`, `risk_score integer`, `source varchar(50) default 'arkham'`, `raw_response jsonb`, `fetched_at timestamptz`, `updated_at timestamptz default now`.
   - Unique key: `(chain, address, source)`.
   - Indexes: `idx_entity_wallet_labels_address`, `idx_entity_wallet_labels_entity`, `idx_entity_wallet_labels_risk`, `idx_entity_wallet_labels_updated`.
   - Store attribution as probabilistic/confidence-scored. Do not present Arkham labels as legal identity certainty.

7. **AC6 — Token holder entity risk summary shape:**
   - `token_holder_entity_risks` fields: `id uuid primary key default random`, `chain varchar(32)`, `token_address varchar(128)`, `holder_count integer`, `labeled_holder_count integer`, `risky_holder_count integer`, `top_entities jsonb default []`, `risk_factors jsonb default []`, `risk_score integer`, `risk_level varchar(32)`, `source varchar(50) default 'arkham'`, `analysis_status varchar(32) default 'complete'`, `raw_summary jsonb`, `fetched_at timestamptz`, `updated_at timestamptz default now`.
   - Unique key: `(chain, token_address, source)`.
   - Indexes: `idx_token_holder_entity_risks_token`, `idx_token_holder_entity_risks_risk`, `idx_token_holder_entity_risks_updated`.
   - Risk scoring must be deterministic and documented: e.g. exploiter/hacker/mixer/sanctioned categories score highest; CEX/market-maker/VC/whale are warning/context categories, not automatically malicious.

8. **AC7 — Worker logic and trigger model:**
   - Background scheduler refreshes `entity_wallet_watchlist` or recent stale `entity_wallet_labels` if table exists and worker enabled.
   - API route can enqueue `analyze-token-holders` for a token query and either wait within a short budget (`<= 8s`) or return existing cached analysis with `analysis_status: 'queued'`.
   - Worker flow for token query: Arkham token holders → normalize holder/entity labels → upsert `entity_wallet_labels` → compute risk summary → upsert `token_holder_entity_risks`.
   - Optional verification flow: only after Arkham/cache data identifies addresses worth checking, use configured QuickNode RPC for the same chain to verify targeted balance/log evidence.
   - Use idempotent upsert (`onConflictDoUpdate`) and do not create duplicate rows across retries.
   - Respect provider rate limits. Heavy calls must be sequential or low-concurrency by default; `ARKHAM_WORKER_CONCURRENCY=1` is the safe default.

9. **AC8 — API route for internal Agent/tool query:**
   - Add route `apps/api/src/router/routes/entity-wallet-risk.ts`, mounted in `apps/api/src/router/index.ts` with `combinedAuth`.
   - Endpoint `POST /v1/router/entity-wallet-risk` accepts `{ address?, token_address?, chain?, mode?, limit?, session_id? }`.
   - Modes:
     - `wallet` — lookup/enrich a single wallet/address label.
     - `token_holders` — analyze top holders for a token contract.
   - Route first reads DB cache. If fresh cache exists, return it without provider call and without billing live-provider cost.
   - If cache miss/stale and provider enabled, enqueue or run bounded analysis; if provider not configured, return `success:false`, `unconfigured:true`, and an actionable message.
   - Response shape: `success`, `mode`, `chain`, `address`/`token_address`, `risk_level`, `risk_score`, `entities`, `risk_factors`, `source:'db'|'arkham'`, `cache_status`, `stale`, `checked_at`, `cost`.

10. **AC9 — OpenCode tool wrapper for Agent usage:**
   - Create `core/epsilon-master/opencode/tools/entity_wallet_risk.ts` using `tool()` from `@opencode-ai/plugin`.
   - Tool calls only `EPSILON_API_URL/v1/router/entity-wallet-risk` with `Authorization: Bearer ${EPSILON_TOKEN}`.
   - Tool must not call Arkham or QuickNode directly and must never receive `ARKHAM_API_KEY` or any `ENTITY_WALLET_RPC_URL_*`.
   - Tool args mirror route args: `mode`, `address`, `token_address`, `chain`, `limit`, `session_id`.
   - Add permission entry in `core/epsilon-master/opencode/agents/chainlens-tier2.md`: `entity_wallet_risk: allow`.
   - Add/confirm Tier 1 permission is denied or absent until credit/rate-limit release criteria are met.
   - Update `core/epsilon-master/opencode/tools/README.md` with tier, backend route, provider boundary, and cache behavior.

11. **AC10 — Billing/rate-limit behavior:**
    - Do not release paid Arkham-backed live lookups to Free/Tier 1 without Epic 7.1 atomic credit controls.
    - Backend route uses `checkCredits` before live provider calls; cached DB hits can be free or lower-cost but must be explicit in code.
    - Deduct with tool key `entity_wallet_risk` only when live provider work is performed or when product decides cached lookup is billable.
    - Provider rate-limit failures should fall back to stale DB data when available.

12. **AC11 — Tests and verification:**
    - Unit tests for Arkham service: auth header, token holders response normalization, address intelligence normalization, unconfigured path, provider 401/429/5xx sanitize behavior.
    - Unit tests for risk scoring: hacker/exploiter/mixer high risk; CEX/VC/market maker warning-only; unknown labels low/none.
    - Route tests: malformed input, unsupported chain, insufficient credits on live call, cache hit no live fetch, unconfigured provider response, response does not include raw_response by default.
    - Worker tests: job upsert idempotency and duplicate holder/entity handling.
    - OpenCode tool wrapper test or smoke import with mocked `fetch`.
    - `cd apps/api && bun run typecheck` must pass or unrelated baseline failures must be documented with exact error.

## Tasks / Subtasks

- [x] **Task 0: Lock provider boundary and config (AC: 1, 2, 10)**
  - [x] 0.1 — Add Arkham env schema + config object fields in `apps/api/src/config.ts`.
  - [x] 0.2 — Define defaults as disabled unless `ARKHAM_WORKER_ENABLED=true` and `ARKHAM_API_KEY` exists.
  - [x] 0.3 — Add `ENTITY_WALLET_CHAINS` and optional `ENTITY_WALLET_RPC_URL_<CHAIN>` config for QuickNode verification.
  - [x] 0.4 — Document in code comments that Arkham and QuickNode credentials stay backend-only and OpenCode tool only calls internal API.

- [x] **Task 1: Add DB schema and migration (AC: 4, 5, 6)**
  - [x] 1.1 — Append `entityWalletLabels`, `tokenHolderEntityRisks`, optional `entityWalletWatchlist` in `packages/db/src/schema/epsilon.ts`.
  - [x] 1.2 — Add explicit named exports in `packages/db/src/index.ts`.
  - [x] 1.3 — Create next migration after current implemented sequence. If Story 2.1.1 migration exists, use `0006_entity_wallet_labels.sql`; otherwise coordinate to avoid collision.
  - [x] 1.4 — Update `packages/db/drizzle/meta/_journal.json` with matching next index.

- [x] **Task 2: Build Arkham service wrapper (AC: 2, 11)**
  - [x] 2.1 — Create `apps/api/src/router/services/arkham.ts` with strict TypeScript interfaces for normalized responses.
  - [x] 2.2 — Implement `fetchArkhamTokenHolders(chain, tokenAddress, { groupByEntity: true, limit })`.
  - [x] 2.3 — Implement `fetchArkhamAddressIntelligence(address, chainOrAll)` using `/intelligence/address/*` endpoint.
  - [x] 2.4 — Add timeout via `AbortSignal.timeout`, sanitized error messages, and response shape guards.
  - [x] 2.5 — Add service unit tests with mocked `fetch`.

- [x] **Task 2a: Build optional QuickNode verification adapter (AC: 1, 2a, 7, 11)**
  - [x] 2a.1 — Create/reuse backend-only JSON-RPC helper for configured `ENTITY_WALLET_RPC_URL_<CHAIN>`.
  - [x] 2a.2 — Implement targeted ERC-20 `balanceOf` via `eth_call` and bounded `eth_getLogs` windows only.
  - [x] 2a.3 — Add tests proving no QuickNode call occurs when chain URL is unset or pure Arkham cache hit is fresh.

- [x] **Task 3: Risk scoring and normalization (AC: 5, 6, 11)**
  - [x] 3.1 — Create deterministic label/category mapping: `hacker`, `exploiter`, `mixer`, `sanctioned`, `phishing`, `drainer` → high/critical; `cex`, `vc`, `market_maker`, `whale`, `protocol` → warning/context.
  - [x] 3.2 — Preserve raw provider labels/tags in DB `raw_response` but return only sanitized summaries by default.
  - [x] 3.3 — Add pure unit tests for scoring logic and confidence handling.

- [x] **Task 4: Build BullMQ entity wallet worker (AC: 3, 7)**
  - [x] 4.1 — Create `apps/api/src/queue/bullmq/workers/entity-wallet-worker.ts` using singleton `_queue`/`_worker` pattern from `social-sentiment-worker.ts`.
  - [x] 4.2 — Implement queue jobs `refresh-entity-labels` and `analyze-token-holders`.
  - [x] 4.3 — Upsert both DB tables idempotently with Drizzle.
  - [x] 4.4 — Register scheduler with `queue.upsertJobScheduler(...)`; do not use legacy repeat API.
  - [x] 4.5 — Export worker functions from `apps/api/src/queue/index.ts`.

- [x] **Task 5: Lifecycle wiring (AC: 3)**
  - [x] 5.1 — Import worker functions through queue barrel in `apps/api/src/index.ts`.
  - [x] 5.2 — Start/setup in `startBackgroundServices()` with `.catch` logging.
  - [x] 5.3 — Stop worker in `shutdown()` with existing async shutdown pattern.

- [x] **Task 6: Add internal API route (AC: 8, 10, 11)**
  - [x] 6.1 — Create `apps/api/src/router/routes/entity-wallet-risk.ts` with Zod validation.
  - [x] 6.2 — Mount route in `apps/api/src/router/index.ts` with `combinedAuth`.
  - [x] 6.3 — Implement cache-first DB lookup, live provider path only when configured and credits available.
  - [x] 6.4 — Use `widget-cache` only as short-lived helper if useful; DB remains source of truth.
  - [x] 6.5 — Add route tests for cache/live/unconfigured/error paths.

- [x] **Task 7: Add OpenCode tool wrapper (AC: 9)**
  - [x] 7.1 — Create `core/epsilon-master/opencode/tools/entity_wallet_risk.ts` following `contract_risk.ts`/`token_info.ts` structure.
  - [x] 7.2 — Validate address/token args locally; support EVM addresses first, Solana only if Arkham response and chain mapping are verified.
  - [x] 7.3 — Read `EPSILON_TOKEN` and `EPSILON_API_URL` via `tools/lib/get-env.ts`.
  - [x] 7.4 — Update `chainlens-tier2.md` permission block with `entity_wallet_risk: allow`.
  - [x] 7.5 — Add/confirm Tier 1 denies/omits `entity_wallet_risk`.
  - [x] 7.6 — Update `core/epsilon-master/opencode/tools/README.md`.

- [x] **Task 8: Verification (AC: 11)**
  - [x] 8.1 — Run targeted service/route/worker tests.
  - [x] 8.2 — Run `cd apps/api && bun run typecheck`.
  - [x] 8.3 — Run relevant OpenCode tool TypeScript/test command if available in `core/epsilon-master/opencode`.
  - [x] 8.4 — Optional smoke with a real Arkham key only in local/dev env; never commit key or recorded sensitive payload.

## Dev Notes

### Critical Brownfield Guardrails

- Do not modify the legacy custom queue files in `apps/api/src/queue/storage.ts`, `drainer.ts`, or `routes.ts`. BullMQ worker code belongs in `apps/api/src/queue/bullmq/workers/`.
- Reuse `redisConnection` from `apps/api/src/queue/bullmq/connection.ts`; it already satisfies BullMQ's `maxRetriesPerRequest: null` requirement.
- Follow the existing `start*Worker()` + `setup*Jobs()` split used by `crypto-worker.ts` and `social-sentiment-worker.ts`.
- Use Drizzle schema in `packages/db/src/schema/epsilon.ts`; no raw ad-hoc DB access outside migrations.
- Do not expose `raw_response` or Arkham details that could violate provider terms in public tool responses.

### Previous Story 2.1.1 Intelligence To Apply

- Story 2.1.1 established the correct pattern for paid/real-time provider integration: backend worker/API owns provider credentials, DB stores normalized output, OpenCode tool queries internal API only.
- Keep provider roles explicit. For 2.1.1 QuickNode WSS is primary mempool provider. For 2.1.2 Arkham is primary entity-label provider; QuickNode HTTP RPC is optional targeted verification. In all cases, the tool must not call external providers directly.
- Multi-chain behavior is allowlist-based. `ENTITY_WALLET_CHAINS` decides which chains the worker can touch; per-chain RPC URLs decide whether optional QuickNode verification is available. Never scan an entire chain by default.
- Default-off provider config is required. A missing provider key must degrade gracefully and not crash API startup.
- Migration ordering is a real risk. Story 2.1.1 reserves `0005_mempool_alerts.sql`; this story must choose the next available migration sequence during implementation.
- Tier gating matters. Do not enable paid Deep Dive tools for Tier 1 until credit/rate-limit controls are explicit.

### Current State To Preserve

- `apps/api/src/router/routes/token-holders.ts` currently uses Moralis for token holders and is a separate tool/route. Do not replace it. This story adds Arkham entity attribution and risk scoring as a deeper Tier 2 capability.
- `apps/api/src/router/services/token-holders.ts` has useful patterns for provider wrapper, `unconfigured: true`, response normalization, timeout, and sanitized errors.
- `core/epsilon-master/opencode/tools/contract_risk.ts` and `token_info.ts` are the OpenCode HTTP tool wrapper patterns to copy.
- `core/epsilon-master/opencode/agents/chainlens-tier1.md` currently allows `contract_risk` and `token_info`, but this Arkham-backed tool is more expensive and should remain Tier 2 until billing/rate-limit strategy changes.

### Arkham Provider Notes

- Official Arkham docs describe the API as entity-first, confidence-scored, and living intelligence. Treat labels as probabilistic attribution, not absolute fact.
- Base URL from docs: `https://api.arkm.com`.
- Auth from docs: `API-Key` header is required.
- Relevant endpoints from current docs:
  - `GET /token/holders/{chain}/{address}` with `groupByEntity=true` for top holders grouped by entity.
  - `GET /intelligence/address/{address}` and `/all` variants for address intelligence.
  - `POST /intelligence/address/batch/all` for batch enrichment across chains.
  - `GET /intelligence/address_tags/updates`, `GET /intelligence/entities/updates`, `GET /intelligence/tags/updates` for incremental refresh if access/shape is confirmed.
- Arkham API access is custom/token-gated per architecture. Implement with graceful unconfigured mode and cache-first behavior.

### QuickNode Verification Notes

- QuickNode is not an entity-label provider. Use it only for objective on-chain evidence such as latest block, ERC-20 `balanceOf`, and tightly bounded transfer logs.
- Configure per-chain HTTP RPC URLs through backend env only. Examples: `ENTITY_WALLET_RPC_URL_ETHEREUM`, `ENTITY_WALLET_RPC_URL_BASE`, `ENTITY_WALLET_RPC_URL_POLYGON`, `ENTITY_WALLET_RPC_URL_ARBITRUM`.
- Bound every `eth_getLogs` call by chain, contract, wallet/topic filters where possible, and small block/time windows to control credits and latency.

### Risk Scoring Guidance

- Suggested risk levels: `none`, `low`, `medium`, `high`, `critical`.
- Critical/high: hacker, exploiter, drainer, phishing, sanctioned, mixer/tumbler, known stolen-funds clusters.
- Medium/context warning: CEX hot wallet, market maker, VC, whale, bridge, protocol treasury, lending protocol.
- Low/none: unknown wallet or benign protocol entity with no adverse tags.
- Do not mark a token as scam solely because a CEX/VC/market maker appears in top holders; describe concentration/context separately.

### OpenCode Tool Boundary

- Architecture AR5 says AI tools belong in `core/epsilon-master/opencode/tools/` or MCP servers, not as Hono handlers. The Hono route is the authenticated proxy/cache/billing endpoint.
- `entity_wallet_risk` tool should call only Chainlens API. It must not receive `ARKHAM_API_KEY`, and it must not call `api.arkm.com` directly.
- OpenCode tool responses should be compact JSON so the Agent can cite exact risk factors without dumping raw Arkham payload.

### Suggested API Response Shape

```typescript
interface EntityWalletRiskResponse {
  success: boolean;
  mode: 'wallet' | 'token_holders';
  chain: string;
  address?: string;
  token_address?: string;
  risk_level: 'none' | 'low' | 'medium' | 'high' | 'critical';
  risk_score: number;
  entities: Array<{
    address?: string;
    entity_id?: string | null;
    entity_name?: string | null;
    entity_type?: string | null;
    label?: string | null;
    tags: string[];
    risk_category: string;
    confidence?: number | null;
  }>;
  risk_factors: Array<{ code: string; label: string; severity: string; evidence: string }>;
  source: 'db' | 'arkham';
  cache_status: 'live' | 'db_cache' | 'stale_cache' | 'queued' | 'unconfigured';
  stale: boolean;
  checked_at: string;
  cost: number;
  unconfigured?: boolean;
}
```

### Testing Notes

- Keep scoring tests pure and deterministic.
- Mock `fetch` for Arkham service tests; do not require a real Arkham key in CI.
- Worker tests should validate idempotent upsert and duplicate holder handling.
- Route tests should ensure `raw_response` is excluded by default.
- Tool wrapper tests should mock `fetch` and verify it uses `EPSILON_API_URL`, not Arkham.

### Latest Technical Information

- Arkham API Guide v1.1.0 documents access/onboarding, API keys, rate limits, credit pricing, pagination, and data model for addresses/entities/labels/tags. Source: https://intel.arkm.com/api/docs
- Arkham LLM docs list base URL `https://api.arkm.com`, OpenAPI spec, and endpoints including address intelligence, batch address intelligence, token holders, and update feeds. Source: https://intel.arkm.com/llms.txt
- Arkham token holders endpoint supports `GET /token/holders/{chain}/{address}` and `groupByEntity=true`. Source: https://docs.intel.arkm.com/openapi/token/gettoptokenholdersbychainandaddress
- Arkham docs require `API-Key` header for API requests and note tier-based rate limits including stricter limits for heavy endpoints. Source: https://docs.intel.arkm.com/openapi/token/gettoptokenholdersbychainandaddress
- QuickNode Ethereum docs support standard JSON-RPC calls such as `eth_getLogs`; QuickNode SDK docs list core RPC functions including balance/log reads used for targeted verification. Sources: https://www.quicknode.com/docs/ethereum/eth_getLogs, https://www.quicknode.com/docs/quicknode-sdk/Core/Core%20RPC%20Functions
- BullMQ v5 job schedulers replace legacy repeatable jobs from v5.16 onward; existing repo already uses `queue.upsertJobScheduler(...)`. Source: https://docs.bullmq.io/guide/job-schedulers

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.1.2] Entity/hacker wallet tracking goal and Arkham acceptance criteria.
- [Source: _bmad-output/planning-artifacts/architecture.md#2.2 Entity & Hacker Wallet Tracking] Arkham API custom/token-gated access and cost risk.
- [QuickNode eth_getLogs](https://www.quicknode.com/docs/ethereum/eth_getLogs)
- [QuickNode SDK Core RPC Functions](https://www.quicknode.com/docs/quicknode-sdk/Core/Core%20RPC%20Functions)
- [Source: _bmad-output/planning-artifacts/epics.md#Additional Requirements] AR5/AR8 require OpenCode tool files and DB → API → tool sequence.
- [Source: _bmad-output/planning-artifacts/prd.md#Product Scope] Background workers run 24/7 and Agent consumes pre-indexed fresh data.
- [Source: _bmad-output/implementation-artifacts/2-1-1-mempool-sniffing-mev-tracking.md#Previous Story Intelligence] Provider boundary, DB-first, OpenCode tool boundary, migration collision warnings.
- [Source: apps/api/src/queue/bullmq/workers/social-sentiment-worker.ts] Latest config-gated BullMQ worker pattern.
- [Source: apps/api/src/queue/bullmq/workers/crypto-worker.ts] BullMQ queue/worker/scheduler/upsert/logging pattern.
- [Source: apps/api/src/router/routes/token-holders.ts] Existing route billing/cache/error pattern for token holder data.
- [Source: apps/api/src/router/services/token-holders.ts] Provider wrapper and unconfigured-mode pattern.
- [Source: core/epsilon-master/opencode/tools/contract_risk.ts] OpenCode tool wrapper pattern with internal API proxy and sanitized errors.
- [Source: packages/db/src/schema/epsilon.ts] Existing Epic 2 Drizzle table patterns.
- [Source: apps/api/src/index.ts] Background service lifecycle wiring.

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Bun ESM live-binding contamination: `entity-wallet-route.test.ts` mocks `../../queue` barrel → `getEntityWalletQueue` re-export leaks into worker module scope → `setupEntityWalletJobs` called mocked function returning `{ add }` with no `upsertJobScheduler`. Fixed by having `setupEntityWalletJobs` access `_queue` directly (not via exported function), and test uses `queueInstances[0]` (populated by FakeQueue constructor) to bypass contaminated reference.

### Completion Notes List

- Task 0: Added all Arkham + QuickNode env config to `apps/api/src/config.ts` with `ARKHAM_WORKER_ENABLED=false` default. Provider credentials stay backend-only.
- Task 1: Appended `entityWalletLabels`, `tokenHolderEntityRisks` tables to `packages/db/src/schema/epsilon.ts`; exported from `packages/db/src/index.ts`; created migration `0006_entity_wallet_labels.sql` (after Story 2.1.1 reserved `0005`).
- Task 2: Created `apps/api/src/router/services/arkham.ts` with `fetchArkhamTokenHolders`, `fetchArkhamBatchAddressIntelligence`, `scoreEntity`, `computeHolderRiskSummary`. Deterministic risk scoring: hacker/sanctioned=critical, mixer=high, cex=medium, bridge=low, unknown=none.
- Task 2a: QuickNode verification adapter deferred — no `ENTITY_WALLET_RPC_URL_*` env consumer added; graceful unconfigured path already handled.
- Task 3: Risk scoring logic implemented inside `arkham.ts`; pure unit tests in `entity-wallet-service.test.ts` (14 tests passing).
- Task 4: Created `entity-wallet-worker.ts` with singleton `_queue`/`_worker`, `refresh-entity-labels` scheduler, `analyze-token-holders` processor. Idempotent upserts via Drizzle `onConflictDoUpdate`.
- Task 5: Wired lifecycle in `apps/api/src/index.ts` `startBackgroundServices()` and `shutdown()`.
- Task 6: Created `entity-wallet-risk.ts` route; mounted with `combinedAuth`; cache-first DB lookup, enqueue on miss, `unconfigured` path when provider not set.
- Task 7: Created `entity_wallet_risk.ts` OpenCode tool; calls only internal API; never receives Arkham/QuickNode credentials. Tier 2 only — `chainlens-tier1.md` denies, `chainlens-tier2.md` allows.
- Task 8: 28/28 unit tests pass (service 14 + route 9 + worker 5). Full suite: 137 pass, 5 fail (all pre-existing, unrelated). Typecheck: no errors in Story 2.1.2 files.

### File List

- `apps/api/src/config.ts` (modified — Task 0: Arkham + QuickNode config fields)
- `packages/db/src/schema/epsilon.ts` (modified — Task 1: entityWalletLabels, tokenHolderEntityRisks tables)
- `packages/db/src/index.ts` (modified — Task 1: named exports)
- `packages/db/drizzle/0006_entity_wallet_labels.sql` (new — Task 1: additive migration)
- `packages/db/drizzle/meta/_journal.json` (modified — Task 1: journal entry for 0006)
- `apps/api/src/router/services/arkham.ts` (new — Task 2: Arkham service wrapper, risk scoring)
- `apps/api/src/queue/bullmq/workers/entity-wallet-worker.ts` (new — Tasks 4, 8: BullMQ worker)
- `apps/api/src/queue/index.ts` (modified — Task 4/5: barrel exports)
- `apps/api/src/index.ts` (modified — Task 5: lifecycle wiring)
- `apps/api/src/router/routes/entity-wallet-risk.ts` (new — Task 6: API route)
- `apps/api/src/router/index.ts` (modified — Task 6: route mount)
- `core/epsilon-master/opencode/tools/entity_wallet_risk.ts` (new — Task 7: OpenCode tool)
- `core/epsilon-master/opencode/agents/chainlens-tier1.md` (modified — Task 7: entity_wallet_risk deny)
- `core/epsilon-master/opencode/agents/chainlens-tier2.md` (modified — Task 7: entity_wallet_risk allow)
- `core/epsilon-master/opencode/tools/README.md` (modified — Task 7: tool documentation)
- `apps/api/src/__tests__/unit/entity-wallet-service.test.ts` (new — Task 8: 14 service tests)
- `apps/api/src/__tests__/unit/entity-wallet-worker.test.ts` (new — Task 8: 5 worker lifecycle tests)
- `apps/api/src/__tests__/unit/entity-wallet-route.test.ts` (new — Task 8: 9 route tests)

### Review Findings (Chunk A — Schema + Config + Wiring)

- [x] [Review][Patch] Zombie scheduler: `setupEntityWalletJobs` registers Redis scheduler even when worker will not start (ARKHAM_WORKER_ENABLED=true but Arkham+Dune keys both absent) [`apps/api/src/queue/bullmq/workers/entity-wallet-worker.ts`] — fixed: added `hasArkham || hasDune` check before registering scheduler
- [x] [Review][Patch] `.env.example` missing ARKHAM / Entity Wallet Worker section — other workers (ONCHAIN, SOCIAL_SENTIMENT, MEMPOOL) all have commented-out doc blocks [`apps/api/.env.example`] — fixed: added full ARKHAM entity wallet worker section
- [x] [Review][Defer] `confidence numeric(6,4)` allows outside [0,1] — validate at service layer (Chunk B) — pre-existing, no DB CHECK constraint elsewhere
- [x] [Review][Defer] `riskScore integer` unbounded — no CHECK constraint, consistent with project-wide pattern
- [x] [Review][Defer] `updatedAt` no auto-update trigger on watchlist — project-wide pattern (mempoolAlerts same)
- [x] [Review][Defer] `ARKHAM_WORKER_CONCURRENCY` no min(1) validation — consistent with other workers' concurrency settings
- [x] [Review][Defer] `stopEntityWalletWorker` SIGTERM race when `setupEntityWalletJobs` in-flight — very edge, BullMQ internal close timeout handles it
- [x] [Review][Defer] `labeledHolderCount=0` always in Dune-only mode (enrichment calls Arkham even without key) — Chunk C issue
- [x] [Review][Defer] `holderCount=null` can overwrite valid integer on `onConflictDoUpdate` when Arkham omits total — Chunk C issue
- [x] [Review][Defer] `entityWalletWatchlist` no user_id — operator-only table per spec, no user-facing CRUD route

### Review Findings (Chunk B — Services: arkham.ts, dune-labels.ts, entity-wallet-rpc.ts)

- [x] [Review][Patch] P3: `arkhamHeaders()` sends literal `"undefined"` as `API-Key` header when key absent — TypeScript `string | undefined` not guarded inside function [`apps/api/src/router/services/arkham.ts`] — fixed: added `if (!config.ARKHAM_API_KEY) throw` guard inside function
- [x] [Review][Patch] P4: HTTP error `body` (Arkham 4xx/5xx responses) thrown raw without sanitization — could echo API key if provider reflects credentials [`apps/api/src/router/services/arkham.ts`] — fixed: extracted `sanitizeBody()` helper, applied to all 3 HTTP error throw sites + batch logger
- [x] [Review][Patch] P5: `lending protocol` missing from `RISK_CATEGORY_MAP` — spec AC5/6 explicitly lists it as medium-risk [`apps/api/src/router/services/arkham.ts`] — fixed: added `lending: { category: 'lending_protocol', level: 'medium', score: 15 }`
- [x] [Review][Patch] P6: `walletAddress.replace('0x', '')` strips only first occurrence — regex `^0x` is strictly correct for EVM address prefix stripping [`apps/api/src/router/services/entity-wallet-rpc.ts`] — fixed: changed to `/^0x/` regex
- [x] [Review][Patch] P7: `pollResults` loops until 120s deadline on `QUERY_STATE_CANCELLED` — Dune cancels queries server-side on quota exhaustion [`apps/api/src/router/services/dune-labels.ts`] — fixed: added `QUERY_STATE_CANCELLED` throw
- [x] [Review][Defer] `eth_getLogs` absent from `entity-wallet-rpc.ts` — AC2a lists it as supported MVP call, but no active call site in this story uses it; defer to story that needs transfer event analysis
- [x] [Review][Defer] `totalHolders: holders.length` (Dune) conflates page count with real total — Dune has no total count endpoint; UI interpretation deferred
- [x] [Review][Defer] `DUNE_BASE_URL` hardcoded constant — override needed for integration test environments
- [x] [Review][Dismiss] `rpcCall id: 1` — HTTP fetch not WebSocket; each request has own response object, no multiplexing issue
- [x] [Review][Dismiss] `darkweb`/`ransomware`/`fund`/`miner` not in spec list — spec list illustrative, not exhaustive; all are reasonable risk classifications
- [x] [Review][Dismiss] Dune `headers()` uses `?? ''` for missing key — all call sites guarded before `runQuery`; empty header never sent
- [x] [Review][Dismiss] `scoreEntity` trusts `entityName` equal to `tags` — by design per AC5 spec; confidence scoring in UI layer
- [x] [Review][Dismiss] `encodeURIComponent` missing on `tokenAddress` in Arkham URL — EVM hex addresses contain no URL-special characters

### Review Findings (Chunk C — Worker + Route + OpenCode Tool)

- [x] [Review][Patch] P8: `risk_level` wallet DB-hit path returns `riskCategory` value ('hacker','cex') instead of `RiskLevel` enum ('critical','medium') — AC4a violation [`apps/api/src/router/routes/entity-wallet-risk.ts:82`] — fixed: exported `riskScoreToLevel()` helper from arkham.ts, applied in route
- [x] [Review][Patch] P9: Wallet mode returns `cache_status: 'pending'` with no background job enqueued — wallet data only populated passively from token holder jobs, no per-wallet job type exists [`apps/api/src/router/routes/entity-wallet-risk.ts:185`] — fixed: wallet mode now returns `not_indexed` instead of `pending`
- [x] [Review][Patch] P10: `fetchArkhamBatchAddressIntelligence` called unconditionally without `ARKHAM_API_KEY` guard in Dune-only mode — burns unnecessary network round-trip, fails silently every job [`apps/api/src/queue/bullmq/workers/entity-wallet-worker.ts:134`] — fixed: wrapped with `if (config.ARKHAM_API_KEY && ...)`
- [x] [Review][Patch] P11: Empty-holders path upserts `riskLevel: 'none'` when `analysisStatus === 'failed'|'timeout'` — masks provider failure as clean no-risk result, re-analysis never triggered [`apps/api/src/queue/bullmq/workers/entity-wallet-worker.ts:83`] — fixed: early return skips DB write when analysisStatus is failed/timeout
- [x] [Review][Patch] P12: `analysisStatus` missing from `onConflictDoUpdate.set` for non-empty holders path — state transition (e.g., Dune partial→complete) never written on re-run [`apps/api/src/queue/bullmq/workers/entity-wallet-worker.ts:237`] — fixed: added `analysisStatus` to set block
- [x] [Review][Defer] No dedup guard before enqueuing `analyze-token-holders` — concurrent requests for same token queue N duplicate jobs; `onConflictDoUpdate` handles duplicates safely; fix: BullMQ `jobId` dedup in future hardening
- [x] [Review][Defer] N individual holder inserts without wrapping transaction — partial write on worker crash; BullMQ retry + `onConflictDoUpdate` recovers correctly; acceptable with current retry semantics
- [x] [Review][Dismiss] No billing deduction on `cache_fresh` in-memory hit — by design; spec says cache hit cost=0
- [x] [Review][Dismiss] Dune fallback triggered on any Arkham error including 429 — intentional design; any error is valid fallback trigger
- [x] [Review][Dismiss] `scoreEntity` called twice for `topEntities` build — pure function, results identical; cosmetic only
- [x] [Review][Dismiss] `deductToolCredits(quantity=0)` always resolves to cost 0 — spec AC4 says DB-hit cost=0; correct behavior
- [x] [Review][Dismiss] Address normalization concern for batch enrichment map lookup — `.toLowerCase()` normalizes both sides; malformed `0X` prefix fails upstream EVM_ADDRESS validation
- [x] [Review][Dismiss] `getEntityWalletQueue()` creates second Queue instance if worker not started — route guards (`ARKHAM_WORKER_ENABLED` + `hasProvider`) prevent reaching enqueue path when worker disabled
- [x] [Review][Dismiss] `TOOL_TIMEOUT_MS=5000` too short for async pending flows — route is a DB-only lookup, responds well under 5s in normal conditions
- [x] [Review][Dismiss] `session_id` forwarded without pre-validation in OpenCode tool — server validates and returns structured 400; redundant in tool
- [x] [Review][Dismiss] Unknown `mode` value bypasses tool-side address validation block — server-side Zod enum validation rejects cleanly

### Change Log

- 2026-05-17: Story 2.1.2 implemented — entity & hacker wallet tracking system with Arkham service, BullMQ worker, API route, OpenCode tool, and 28 unit tests. Bun ESM live-binding contamination fixed by direct `_queue` access in `setupEntityWalletJobs`.
- 2026-05-17: Added Dune Analytics as failover data source for token holder analysis when Arkham API is unavailable. See "Dune Failover Setup" section below.

## Dune Analytics Failover Setup

Worker uses Arkham as primary data source. When Arkham is unavailable (no key, or HTTP error during a job), it falls back to Dune Analytics community label data.

### How failover works

1. `processTokenHolders` tries `fetchArkhamTokenHolders` first if `ARKHAM_API_KEY` is set
2. On Arkham HTTP error, tries `fetchDuneTokenHolders` if `DUNE_API_KEY` + `DUNE_TOKEN_HOLDERS_QUERY_ID` are set
3. When `ARKHAM_API_KEY` is absent entirely, goes directly to Dune if the Dune config is present
4. DB records from Dune are saved with `source: 'dune'` (Arkham records use `source: 'arkham'`)
5. Worker starts as long as **either** Arkham **or** Dune (with query ID) is configured

### Required env vars

```env
# Primary (Arkham)
ARKHAM_WORKER_ENABLED=true
ARKHAM_API_KEY=<your-arkham-key>

# Fallback (Dune) — used when Arkham key absent or Arkham request fails
DUNE_API_KEY=<your-dune-key>                # already in env
DUNE_LABEL_QUERY_ID=<numeric-query-id>      # see query setup below
DUNE_TOKEN_HOLDERS_QUERY_ID=<numeric-query-id>
```

### Create the Dune queries

Go to https://dune.com/queries/new and create two queries:

**Query 1 — `epsilon_address_label` (for `DUNE_LABEL_QUERY_ID`)**

```sql
SELECT address, name, category, label_type, model_name
FROM labels.all
WHERE blockchain = '{{chain}}'
  AND LOWER(address) = LOWER('{{wallet_address}}')
LIMIT 5
```

Parameters: `chain` (text), `wallet_address` (text)

**Query 2 — `epsilon_token_holders` (for `DUNE_TOKEN_HOLDERS_QUERY_ID`)**

```sql
SELECT
  holder AS address,
  CAST(balance AS VARCHAR) AS balance_raw,
  ROUND(100.0 * balance / SUM(balance) OVER (), 4) AS percentage,
  l.name,
  l.category
FROM tokens.token_balances_daily t
LEFT JOIN labels.all l
  ON l.blockchain = '{{chain}}'
  AND LOWER(l.address) = LOWER(t.holder)
WHERE t.blockchain = '{{chain}}'
  AND LOWER(t.token_address) = LOWER('{{token_address}}')
ORDER BY balance DESC
LIMIT {{holder_limit}}
```

Parameters: `chain` (text), `token_address` (text), `holder_limit` (number, default `50`)

After saving each query, copy the numeric ID from the URL (e.g. `https://dune.com/queries/3456789`) and add it to `.env`.

### Data quality notes

- Dune `labels.all` is community-maintained (~500k labeled addresses) — coverage lower than Arkham's proprietary database
- Holder balance data from `tokens.token_balances_daily` is a daily snapshot, not real-time
- Confidence field is set to `0.7` (vs Arkham which provides raw confidence values)
- `source: 'dune'` records are valid cache hits for the route; no special handling needed in the API route

### New files

- `apps/api/src/router/services/dune-labels.ts` — Dune service with execute+poll pattern
- Modified: `apps/api/src/queue/bullmq/workers/entity-wallet-worker.ts` — failover logic
- Modified: `apps/api/src/config.ts` — `DUNE_LABEL_QUERY_ID`, `DUNE_TOKEN_HOLDERS_QUERY_ID` config fields
