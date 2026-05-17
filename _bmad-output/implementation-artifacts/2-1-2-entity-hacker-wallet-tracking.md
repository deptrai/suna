# Story 2.1.2: Entity & Hacker Wallet Tracking

Status: ready-for-dev

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

- [ ] **Task 0: Lock provider boundary and config (AC: 1, 2, 10)**
  - [ ] 0.1 — Add Arkham env schema + config object fields in `apps/api/src/config.ts`.
  - [ ] 0.2 — Define defaults as disabled unless `ARKHAM_WORKER_ENABLED=true` and `ARKHAM_API_KEY` exists.
  - [ ] 0.3 — Add `ENTITY_WALLET_CHAINS` and optional `ENTITY_WALLET_RPC_URL_<CHAIN>` config for QuickNode verification.
  - [ ] 0.4 — Document in code comments that Arkham and QuickNode credentials stay backend-only and OpenCode tool only calls internal API.

- [ ] **Task 1: Add DB schema and migration (AC: 4, 5, 6)**
  - [ ] 1.1 — Append `entityWalletLabels`, `tokenHolderEntityRisks`, optional `entityWalletWatchlist` in `packages/db/src/schema/epsilon.ts`.
  - [ ] 1.2 — Add explicit named exports in `packages/db/src/index.ts`.
  - [ ] 1.3 — Create next migration after current implemented sequence. If Story 2.1.1 migration exists, use `0006_entity_wallet_labels.sql`; otherwise coordinate to avoid collision.
  - [ ] 1.4 — Update `packages/db/drizzle/meta/_journal.json` with matching next index.

- [ ] **Task 2: Build Arkham service wrapper (AC: 2, 11)**
  - [ ] 2.1 — Create `apps/api/src/router/services/arkham.ts` with strict TypeScript interfaces for normalized responses.
  - [ ] 2.2 — Implement `fetchArkhamTokenHolders(chain, tokenAddress, { groupByEntity: true, limit })`.
  - [ ] 2.3 — Implement `fetchArkhamAddressIntelligence(address, chainOrAll)` using `/intelligence/address/*` endpoint.
  - [ ] 2.4 — Add timeout via `AbortSignal.timeout`, sanitized error messages, and response shape guards.
  - [ ] 2.5 — Add service unit tests with mocked `fetch`.

- [ ] **Task 2a: Build optional QuickNode verification adapter (AC: 1, 2a, 7, 11)**
  - [ ] 2a.1 — Create/reuse backend-only JSON-RPC helper for configured `ENTITY_WALLET_RPC_URL_<CHAIN>`.
  - [ ] 2a.2 — Implement targeted ERC-20 `balanceOf` via `eth_call` and bounded `eth_getLogs` windows only.
  - [ ] 2a.3 — Add tests proving no QuickNode call occurs when chain URL is unset or pure Arkham cache hit is fresh.

- [ ] **Task 3: Risk scoring and normalization (AC: 5, 6, 11)**
  - [ ] 3.1 — Create deterministic label/category mapping: `hacker`, `exploiter`, `mixer`, `sanctioned`, `phishing`, `drainer` → high/critical; `cex`, `vc`, `market_maker`, `whale`, `protocol` → warning/context.
  - [ ] 3.2 — Preserve raw provider labels/tags in DB `raw_response` but return only sanitized summaries by default.
  - [ ] 3.3 — Add pure unit tests for scoring logic and confidence handling.

- [ ] **Task 4: Build BullMQ entity wallet worker (AC: 3, 7)**
  - [ ] 4.1 — Create `apps/api/src/queue/bullmq/workers/entity-wallet-worker.ts` using singleton `_queue`/`_worker` pattern from `social-sentiment-worker.ts`.
  - [ ] 4.2 — Implement queue jobs `refresh-entity-labels` and `analyze-token-holders`.
  - [ ] 4.3 — Upsert both DB tables idempotently with Drizzle.
  - [ ] 4.4 — Register scheduler with `queue.upsertJobScheduler(...)`; do not use legacy repeat API.
  - [ ] 4.5 — Export worker functions from `apps/api/src/queue/index.ts`.

- [ ] **Task 5: Lifecycle wiring (AC: 3)**
  - [ ] 5.1 — Import worker functions through queue barrel in `apps/api/src/index.ts`.
  - [ ] 5.2 — Start/setup in `startBackgroundServices()` with `.catch` logging.
  - [ ] 5.3 — Stop worker in `shutdown()` with existing async shutdown pattern.

- [ ] **Task 6: Add internal API route (AC: 8, 10, 11)**
  - [ ] 6.1 — Create `apps/api/src/router/routes/entity-wallet-risk.ts` with Zod validation.
  - [ ] 6.2 — Mount route in `apps/api/src/router/index.ts` with `combinedAuth`.
  - [ ] 6.3 — Implement cache-first DB lookup, live provider path only when configured and credits available.
  - [ ] 6.4 — Use `widget-cache` only as short-lived helper if useful; DB remains source of truth.
  - [ ] 6.5 — Add route tests for cache/live/unconfigured/error paths.

- [ ] **Task 7: Add OpenCode tool wrapper (AC: 9)**
  - [ ] 7.1 — Create `core/epsilon-master/opencode/tools/entity_wallet_risk.ts` following `contract_risk.ts`/`token_info.ts` structure.
  - [ ] 7.2 — Validate address/token args locally; support EVM addresses first, Solana only if Arkham response and chain mapping are verified.
  - [ ] 7.3 — Read `EPSILON_TOKEN` and `EPSILON_API_URL` via `tools/lib/get-env.ts`.
  - [ ] 7.4 — Update `chainlens-tier2.md` permission block with `entity_wallet_risk: allow`.
  - [ ] 7.5 — Add/confirm Tier 1 denies/omits `entity_wallet_risk`.
  - [ ] 7.6 — Update `core/epsilon-master/opencode/tools/README.md`.

- [ ] **Task 8: Verification (AC: 11)**
  - [ ] 8.1 — Run targeted service/route/worker tests.
  - [ ] 8.2 — Run `cd apps/api && bun run typecheck`.
  - [ ] 8.3 — Run relevant OpenCode tool TypeScript/test command if available in `core/epsilon-master/opencode`.
  - [ ] 8.4 — Optional smoke with a real Arkham key only in local/dev env; never commit key or recorded sensitive payload.

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

TBD by dev agent.

### Debug Log References

### Completion Notes List

### File List
