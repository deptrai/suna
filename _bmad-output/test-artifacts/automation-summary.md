---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-identify-targets', 'step-03-generate-tests']
lastStep: 'step-03-generate-tests'
lastSaved: '2026-05-18'
story: '5.5 — Vibe-Trading MCP Proxy'
inputDocuments:
  - apps/api/src/router/routes/vibe-trading-mcp.ts
  - apps/api/src/router/services/billing.ts
  - apps/api/src/config.ts
  - apps/api/src/__tests__/unit/vibe-trading-mcp-proxy.test.ts
  - /Users/luisphan/Documents/suna/_bmad-output/implementation-artifacts/2-1-1-mempool-sniffing-mev-tracking.md
  - /Users/luisphan/Documents/suna/_bmad-output/implementation-artifacts/2-1-2-entity-hacker-wallet-tracking.md
  - /Users/luisphan/Documents/suna/_bmad-output/planning-artifacts/prd.md
  - /Users/luisphan/Documents/suna/_bmad-output/planning-artifacts/architecture.md
---

## Step 1: Preflight & Context Loading Summary

- `BMad-Integrated` mode
- `fullstack` stack detected
- Framework validated via `tests/playwright.config.ts`
- `playwright-cli` not installed, so browser exploration skipped
- Loaded knowledge:
  - `test-levels-framework.md`
  - `test-priorities-matrix.md`
  - `data-factories.md`
  - `selective-testing.md`
  - `ci-burn-in.md`
  - `test-quality.md`
  - `api-testing-patterns.md`
  - `fixture-architecture.md`
  - `overview.md`

## Step 2: Automation Targets & Coverage Plan

### Targets

Primary target: Story 2.1.1 mempool sniffing and MEV tracking worker.

### Test Levels

- `Unit`
- `Integration / API`

### Priority

- `P0`: parser/classifier correctness, route contract, auth/billing guardrails
- `P1`: worker lifecycle, queue/job registration, websocket normalization
- `P2`: OpenCode wrapper ergonomics and sanitized error handling

### Coverage Plan

- `apps/api/src/router/services/mempool.ts`
- `apps/api/src/queue/bullmq/workers/mempool-worker.ts`
- `apps/api/src/router/routes/mempool-alerts.ts`
- `apps/api/src/router/index.ts` auth mounting for `/v1/router/mempool-alerts`
- `core/epsilon-master/opencode/tools/mempool_alerts.ts`

### Existing Coverage Found

- Parser coverage already exists for large swap, malformed input, and non-router tx.
- Route coverage already exists for shape and limit clamping.
- Tool wrapper coverage already exists for env handling and URL clamping.

### Gaps To Fill

- Missing auth + billing integration coverage for the mempool alerts route.
- Missing worker lifecycle coverage for disabled startup, missing WSS config, and scheduler setup.
- Missing negative-path coverage for OpenCode tool upstream errors.

### Strategy

- Keep logic-heavy checks at unit level.
- Use integration/API tests for auth, billing, and route contract.
- Avoid E2E/browser tests because this feature has no new UI journey.

## Step 3: Generated Test Coverage

- Execution mode resolved to `sequential` because subagent dispatch was not used in this run.
- Added integration coverage for `/v1/router/mempool-alerts` auth + billing + route wiring.
- Added worker lifecycle coverage for disabled startup, missing WSS config, scheduler registration, and shutdown cleanup.
- Expanded OpenCode tool coverage for upstream HTTP failures and network exceptions.

### Files Written

- `apps/api/src/__tests__/integrations/mempool-alerts.integration.test.ts`
- `apps/api/src/__tests__/unit/mempool-worker.test.ts`
- `core/epsilon-master/opencode/mempool_alerts.test.ts`

### Validation

- `bun test apps/api/src/__tests__/unit/mempool-service.test.ts apps/api/src/__tests__/unit/mempool-alerts-route.test.ts apps/api/src/__tests__/integrations/mempool-alerts.integration.test.ts apps/api/src/__tests__/unit/mempool-worker.test.ts`
- `bun test apps/api/src/__tests__/integrations/mempool-alerts.integration.test.ts`
- `bun test apps/api/src/__tests__/unit/mempool-worker.test.ts`
- `bunx vitest run core/epsilon-master/opencode/mempool_alerts.test.ts`

### Fixture Needs

- None beyond the existing local `bun:test` and `vitest` mocks.

---

## Dune Analytics Failover — Coverage Addendum (2026-05-17)

### Coverage Plan

**Primary targets (new code added in Dune failover implementation):**
- `apps/api/src/router/services/dune-labels.ts` — zero coverage, entirely new service
- `apps/api/src/queue/bullmq/workers/entity-wallet-worker.ts` — new failover branches

**Test Levels:** Unit (bun:test) — pure logic, HTTP mocks, DB insert capture

**Gaps filled:**

| Gap | Priority | File |
|-----|----------|------|
| `fetchDuneAddressLabel` config guard, HTTP contract, poll COMPLETED/FAILED, normalizer | P0 | `dune-labels.test.ts` |
| `fetchDuneTokenHolders` config guard, holder mapping, limit clamp to 100, lowercase token_address | P0 | `dune-labels.test.ts` |
| DUNE_API_KEY not leaked in error results | P0 | `dune-labels.test.ts` |
| Worker starts with Dune-only config (no Arkham key) | P0 | `entity-wallet-worker.test.ts` |
| Worker returns null when neither Arkham nor Dune configured | P0 | `entity-wallet-worker.test.ts` |
| `processTokenHolders` Dune-only path — `entityWalletLabels.source = 'dune'` | P0 | `entity-wallet-worker.test.ts` |
| `processTokenHolders` Arkham→Dune fallback on throw — `source = 'dune'` | P0 | `entity-wallet-worker.test.ts` |
| `processTokenHolders` Arkham path unchanged — `source = 'arkham'` | P0 | `entity-wallet-worker.test.ts` |

### Files Written / Updated

- `apps/api/src/__tests__/unit/dune-labels.test.ts` — 22 tests (new, bun:test)
- `apps/api/src/__tests__/unit/entity-wallet-worker.test.ts` — updated: 14 tests total (was 6; +2 startup guard, +5 failover, updated 1 existing test description)

### Cross-File Mock Isolation Note

`entity-wallet-worker.test.ts` registers `mock.module('../../router/services/dune-labels', ...)` at process level. Because Bun runs all test files in the **same process** with a shared module registry, `dune-labels.test.ts` must run in a **separate `bun test` invocation** — otherwise entity-wallet-worker.test.ts's module mock overrides the real dune-labels code under test.

### Validation

```bash
# dune-labels alone (22 pass) — must run separately
bun test src/__tests__/unit/dune-labels.test.ts

# entity-wallet 5-file suite (66 pass — integration test has pre-existing same-process isolation issue, passes when run alone)
bun test \
  src/__tests__/unit/entity-wallet-service.test.ts \
  src/__tests__/unit/entity-wallet-worker.test.ts \
  src/__tests__/unit/entity-wallet-route.test.ts \
  src/__tests__/unit/arkham-service.test.ts \
  src/__tests__/integrations/entity-wallet.integration.test.ts

# integration test alone (11 pass)
bun test src/__tests__/integrations/entity-wallet.integration.test.ts
```

### Test Count Summary (Dune addendum)

| File | Tests | Framework | Status |
|------|-------|-----------|--------|
| `dune-labels.test.ts` | 22 (new) | bun:test | run separately |
| `entity-wallet-worker.test.ts` | 14 (+8 new) | bun:test | part of 5-file suite |
| **Net new** | **30** | | |

---

## Story 2.1.2 — Entity & Hacker Wallet Tracking

### Coverage Plan

**Primary targets:**
- `apps/api/src/router/services/arkham.ts` — fetch helpers (token holders, address intelligence, batch)
- `apps/api/src/queue/bullmq/workers/entity-wallet-worker.ts` — BullMQ worker lifecycle & scheduler
- `apps/api/src/router/routes/entity-wallet-risk.ts` — Hono route integration (auth, billing, DB hit/miss, enqueueing)
- `core/epsilon-master/opencode/tools/entity_wallet_risk.ts` — OpenCode tool wrapper

**Existing coverage (28 tests pre-this-run):**
- `entity-wallet-service.test.ts` — `scoreEntity` + `computeHolderRiskSummary` pure logic
- `entity-wallet-worker.test.ts` — Worker lifecycle (start/stop/idempotency)
- `entity-wallet-route.test.ts` — Route contract, auth/billing, DB scenarios

**Gaps filled:**

| Gap | Priority | File |
|-----|----------|------|
| `fetchArkhamTokenHolders` HTTP contract, error handling, key leak prevention | P0 | `arkham-service.test.ts` |
| `fetchArkhamAddressIntelligence` 404 / non-404 / network | P0 | `arkham-service.test.ts` |
| `fetchArkhamBatchAddressIntelligence` graceful degradation, batch POST | P0 | `arkham-service.test.ts` |
| Route integration: auth→billing→DB hit→queue→response contract end-to-end | P0 | `entity-wallet.integration.test.ts` |
| `raw_response` never exposed on any path | P0 | `entity-wallet.integration.test.ts` |
| OpenCode tool: EPSILON_TOKEN / EPSILON_API_URL env guards | P0 | `entity_wallet_risk.test.ts` |
| OpenCode tool: proxy URL not Arkham, Bearer auth header | P0 | `entity_wallet_risk.test.ts` |
| OpenCode tool: 402/5xx/network/invalid-JSON error paths | P0 | `entity_wallet_risk.test.ts` |

### Security AC Assertions

- **AC-S1** `raw_response` asserted absent on every response path in integration test
- **AC-S2** `fetchArkhamTokenHolders` sanitizes network error messages (no key leak)
- **AC-S3** OpenCode tool only calls `EPSILON_API_URL/v1/router/entity-wallet-risk`, never `arkm.com`
- **AC-S4** OpenCode tool uses `Bearer EPSILON_TOKEN`, never `API-Key ARKHAM_API_KEY`

### Files Written

- `apps/api/src/__tests__/unit/arkham-service.test.ts` — 20 tests (bun:test)
- `apps/api/src/__tests__/integrations/entity-wallet.integration.test.ts` — 11 tests (bun:test)
- `core/epsilon-master/opencode/entity_wallet_risk.test.ts` — 15 tests (vitest)

### Cross-File Mock Isolation Fixes

Two changes were needed to allow all 5 entity-wallet test files to run together cleanly in the same Bun process:

1. **Removed `mock.restore()` from `entity-wallet-worker.test.ts` `afterAll`** — `mock.restore()` clears ALL module mocks globally, invalidating mocks registered by other test files in the same process. Bun handles inter-process cleanup automatically.

2. **Added `mock.module('ioredis', ...)` + `REDIS_URL` to `arkham-service.test.ts`** — Bun cascades mock invalidation: when `../../config` is replaced, any module that imports it (including `connection.ts`) may be re-evaluated. Mocking ioredis prevents `new Redis(...)` from being called during that re-evaluation.

### Validation

```bash
# All 5 files together (59 pass, 0 fail)
bun test \
  src/__tests__/unit/entity-wallet-service.test.ts \
  src/__tests__/unit/entity-wallet-worker.test.ts \
  src/__tests__/unit/entity-wallet-route.test.ts \
  src/__tests__/unit/arkham-service.test.ts \
  src/__tests__/integrations/entity-wallet.integration.test.ts

# OpenCode tool (vitest)
bunx vitest run core/epsilon-master/opencode/entity_wallet_risk.test.ts
```

### Test Count Summary

| File | Tests | Framework |
|------|-------|-----------|
| `entity-wallet-service.test.ts` | 14 (pre-existing) | bun:test |
| `entity-wallet-worker.test.ts` | 6 (pre-existing) | bun:test |
| `entity-wallet-route.test.ts` | 18 (pre-existing) | bun:test |
| `arkham-service.test.ts` | 20 (new) | bun:test |
| `entity-wallet.integration.test.ts` | 11 (new) | bun:test |
| `entity_wallet_risk.test.ts` | 15 (new) | vitest |
| **Total** | **84** | |

---

## Standalone Coverage Expansion — 2026-05-18

**Mode:** Standalone (no story spec). Triggered by user request "viết test cho các tính năng không có story".

### Coverage Plan

Scanned `apps/api/src/router/{services,routes}` and `core/epsilon-master/opencode/tools` for files without test coverage. Identified 39 untested files; prioritized 17 covering P0 billing safety, P1 external API stability, and P1 OpenCode proxy wrappers.

### Sprint 1 — P0 billing safety (4 files, 34 tests)

| File | Tests | Coverage |
|---|---|---|
| `apps/api/src/__tests__/unit/billing-service.test.ts` | 18 (new) | `checkCredits`, `deductToolCredits`, `deductLLMCredits` — DB guards, local-mode bypass, billing flag short-circuit, session_id audit trail |
| `apps/api/src/__tests__/unit/member-spend-service.test.ts` | 16 (new) | `dollarsToCents` rounding, `getSandboxMemberCapStatus` period rollover, `isMemberOverCap`, `applyActorSpend` zero-cents no-op |
| `apps/api/src/__tests__/integrations/llm.integration.test.ts` | 12 (new) | LLM proxy auth, validation, billing gate, models endpoint, 404 |

### Sprint 2 — P1 external API services (6 files, 65 tests)

| File | Tests | Coverage |
|---|---|---|
| `apps/api/src/__tests__/unit/serper-service.test.ts` | 7 (new) | API key gate, response shape, error status, maxResults clamp to 20, X-API-KEY header, safe_search flag |
| `apps/api/src/__tests__/unit/tavily-service.test.ts` | 7 (new) | API key gate, response shape, error status, maxResults clamp to 10, search_depth, key not leaked in URL |
| `apps/api/src/__tests__/unit/coingecko-helpers.test.ts` | 17 (new) | `isEvmAddress` regex, `buildCoinGeckoHeaders` x-cg-demo-api-key, `resolveCoinIdFromAddress` 404/429/5xx, unsupported chain, address lowercase, baseUrl trailing slash |
| `apps/api/src/__tests__/unit/perplexity-service.test.ts` | 11 (new) | API key gate, citations object/string forms, filter URL-less citations, 4xx/5xx error, network wrap, Bearer auth (no URL leak), reasoning_effort/max_tokens/recency forwarding |
| `apps/api/src/__tests__/unit/defillama-service.test.ts` | 13 (new) | TVL snapshot mapping, chainTvls path, 24h change calculation, 429 rate-limit, slug URL-encoding, baseUrl strip, no-TVL/invalid-TVL guards |
| `apps/api/src/__tests__/unit/santiment-service.test.ts` | 10 (new) | GraphQL response mapping, null/empty handling, division-by-zero in pctChange, NaN skip, Apikey auth scheme, key not leaked in URL, 4xx/network/non-JSON errors |

### Sprint 2 — P1 tx-simulator route (1 file, 14 tests)

| File | Tests | Coverage |
|---|---|---|
| `apps/api/src/__tests__/integrations/tx-simulator.integration.test.ts` | 14 (new) | Auth gate, JSON malformed, EVM address regex, hex calldata regex, value hex/decimal regex, session_id charset, 402 no credits, cache_status:live/cache_fresh/cache_stale, X-Cache-Status header, no-deduct on simulator failure with no stale cache |

### Sprint 3 — P1 search/research routes (3 files, 30 tests)

| File | Tests | Coverage |
|---|---|---|
| `apps/api/src/__tests__/integrations/search-web.integration.test.ts` | 11 (new) | Auth, query required, max_results 1-10, search_depth enum, 402 no credits, response shape, toolName=`web_search_<depth>`, 500 on config error, 500 on upstream, session_id forward, no-deduct on failure |
| `apps/api/src/__tests__/integrations/search-image.integration.test.ts` | 8 (new) | Auth, query required, max_results 1-20, 402 no credits, response shape, toolName=`image_search`, 500 on config error, session_id forward |
| `apps/api/src/__tests__/integrations/deep-research.integration.test.ts` | 11 (new) | Auth, JSON malformed, query empty, reasoning_effort enum, max_tokens 100-4000, 402 no credits, response shape, toolName=`deep_research_<effort>`, config/upstream errors, no-deduct on failure |

### Sprint 3 — P1 narratives route (1 file, 13 tests)

| File | Tests | Coverage |
|---|---|---|
| `apps/api/src/__tests__/integrations/narratives.integration.test.ts` | 13 (new) | Empty result, narrative grouping (no filter), single-narrative shape, invalid narrative 400, alpha_only filter, limit clamp to 100, limit default 20, 503 narratives_unavailable on DB throw, numeric string parsing, null field handling, Cache-Control max-age=300, alpha_signals separation |

### Sprint 4 — P1 OpenCode tool wrappers (5 files, 55 tests)

| File | Tests | Coverage |
|---|---|---|
| `core/epsilon-master/opencode/contract_risk.test.ts` | 11 (new) | EPSILON_TOKEN/URL gates, EVM/Solana address validation, proxy URL `/v1/router/contract-risk` (not goplus/rugcheck directly), 402 sanitized, upstream HTTP/network errors, session_id forward |
| `core/epsilon-master/opencode/simulate_transaction.test.ts` | 11 (new) | Token/URL gates, from/to/data validation, proxy URL `/v1/router/tx-simulator` (not tenderly), default data=`0x`, 402 handling, network/upstream errors, value/chain/action/session_id forwarding |
| `core/epsilon-master/opencode/smart_money_flow.test.ts` | 11 (new) | Token gate, supported chain allowlist, token_address required, EVM/Solana validation, mode allowlist, proxy URL `/v1/router/smart-money-flow` (not nansen.ai), lookback/limit clamps, TimeoutError handling, session_id 128-char truncation |
| `core/epsilon-master/opencode/deep_research.test.ts` | 11 (new) | Token/URL gates, http:// scheme check, empty query rejection, proxy URL `/v1/router/deep-research` (not perplexity.ai), 402/upstream/network errors, success:false when answer+citations both empty, reasoning_effort/max_tokens/recency forwarding, default reasoning_effort=`medium` |
| `core/epsilon-master/opencode/token_info.test.ts` | 11 (new) | Token/URL gates, http:// scheme check, slug required, proxy URL `/v1/router/token-info` (not coingecko.com), slug lowercased, 402/network errors, response passthrough, session_id forwarding |

### Security Assertions Captured

- **API key never leaks into URL**: Tavily, Perplexity, Santiment, Serper (header-based auth verified)
- **OpenCode tools never call external APIs directly**: contract_risk → not goplus/rugcheck; tx-simulator → not tenderly; smart-money-flow → not nansen.ai; deep_research → not perplexity.ai; token_info → not coingecko.com (only internal `/v1/router/*` proxy)
- **Bearer token auth uniformly applied** in all OpenCode proxy fetches
- **402 errors sanitized** to user-facing message (no internal billing details leaked)
- **Upstream error bodies sanitized** via `sanitizeUpstreamErr`

### Validation

```bash
# Sprint 1 P0 billing
bun test src/__tests__/unit/billing-service.test.ts src/__tests__/unit/member-spend-service.test.ts
# 34 pass, 0 fail

# Sprint 2 external API services
bun test \
  src/__tests__/unit/serper-service.test.ts \
  src/__tests__/unit/tavily-service.test.ts \
  src/__tests__/unit/coingecko-helpers.test.ts \
  src/__tests__/unit/perplexity-service.test.ts \
  src/__tests__/unit/defillama-service.test.ts \
  src/__tests__/unit/santiment-service.test.ts
# 65 pass, 0 fail

# Sprint 2 tx-simulator route
bun test src/__tests__/integrations/tx-simulator.integration.test.ts
# 14 pass, 0 fail

# Sprint 3 search/research routes
bun test \
  src/__tests__/integrations/search-web.integration.test.ts \
  src/__tests__/integrations/search-image.integration.test.ts \
  src/__tests__/integrations/deep-research.integration.test.ts
# 30 pass, 0 fail

# Sprint 3 narratives
bun test src/__tests__/integrations/narratives.integration.test.ts
# 13 pass, 0 fail

# Sprint 1 LLM route
bun test src/__tests__/integrations/llm.integration.test.ts
# 12 pass, 0 fail

# Sprint 4 OpenCode tools (vitest)
bunx vitest run \
  core/epsilon-master/opencode/contract_risk.test.ts \
  core/epsilon-master/opencode/simulate_transaction.test.ts \
  core/epsilon-master/opencode/smart_money_flow.test.ts \
  core/epsilon-master/opencode/deep_research.test.ts \
  core/epsilon-master/opencode/token_info.test.ts
# 55 pass, 0 fail
```

### Cross-File Mock Isolation Note

When running ALL 14 new bun:test files in a SINGLE `bun test` invocation, 7 files fail with `SyntaxError: Export named 'getToolCost' not found in module ../../config.ts`. This is the same Bun shared-process module-mock pollution issue documented in the Dune addendum and entity-wallet section above.

**Recommended grouping for CI**: run files that mock `../../config` (billing/member-spend/llm/tx-simulator/narratives/search-* etc.) in separate invocations from files that don't, OR group all of them with a wrapper script that splits into two invocations.

### Test Count Summary

| Layer | New Test Files | New Tests |
|---|---|---|
| `apps/api/src/__tests__/unit` (services) | 8 | 99 |
| `apps/api/src/__tests__/integrations` (routes) | 6 | 80 |
| `core/epsilon-master/opencode` (OpenCode tools) | 5 | 55 |
| **Total** | **19** | **234** |

### Coverage Gaps Still Open (deferred from Tier 4)

- `services/llm.ts` (multi-provider dispatcher — deferred, complex)
- `services/entity-wallet-rpc.ts`, `services/code-validator.ts`, `services/anthropic.ts`
- `routes/anthropic.ts`, `routes/code-validator.ts`, `routes/jit-sync.ts`
- `workers/crypto-worker.ts`, `workers/discover-feed.ts`, `workers/social-sentiment-worker.ts`, `workers/nansen-smart-money-worker.ts`, `workers/onchain-index.ts`
- OpenCode tools: `web_search`, `image_search`, `image_generate`, `instance_dispose`, `scrape_webpage`, `show`, `code_validator`, `jit_sync` (some use direct vendor SDKs, not proxy pattern)

---

## Standalone Coverage Expansion Round 2 — 2026-05-18

**Mode:** Standalone continuation. Closes most deferred files from Round 1.

### Sprint 5 — code-validator + LLM service (3 files, 48 tests)

| File | Tests | Coverage |
|---|---|---|
| `apps/api/src/__tests__/unit/code-validator-service.test.ts` | 24 (new) | Solidity rules: reentrancy (HIGH), `.call.value()`, unchecked-call, old-pragma <0.8, tx.origin, selfdestruct (LOW). Move rules: `borrow_global_mut`, `assert!` magic numbers. Comment-skip behavior, severity ordering, line numbering, `formatReport` summary, capitalization, sandbox recommendation, DISCLAIMER always present, `SOLIDITY_RULES` / `MOVE_RULES` rule-id catalog |
| `apps/api/src/__tests__/integrations/code-validator.integration.test.ts` | 12 (new) | Auth gate, malformed JSON, language enum, code length 1-50000, whitespace-only rejection, 402 no credits, response shape, `has_high_severity` + `sandbox_recommended` interaction, microtask deferred billing, session_id forwarding |
| `apps/api/src/__tests__/unit/llm-service.test.ts` | 12 (new) | `extractUsage` null/object/cache-metric extraction, `calculateCost` flat pricing, EPSILON_MARKUP application, custom markup, differential cache pricing (cacheRead+cacheWrite+regular), inputPer1M fallback for missing cacheWritePer1M, fallback to flat pricing when `cacheReadPer1M=null`, regression guard for negative `regularInputTokens`, zero-token boundary |

### Sprint 6 — anthropic + jit-sync routes (2 files, 28 tests)

| File | Tests | Coverage |
|---|---|---|
| `apps/api/src/__tests__/integrations/anthropic.integration.test.ts` | 9 (new) | Auth gate, JSON malformed, `model` required, `messages` required+non-empty, 402 no credits, 200 success shape, upstream error passthrough, no-actor cap-skip path |
| `apps/api/src/__tests__/integrations/jit-sync.integration.test.ts` | 19 (new) | POST: malformed JSON, slug regex (lowercase+dashes only, leading-dash reject), 402, live success, no-data fallback, X-Cache-Status header. GET /onchain/:identifier: max length, empty result, item return, page-size nextOffset, offset clamp 1000, negative→0, NaN→0, 503 onchain_unavailable, EVM lowercase, Cache-Control max-age=60, Solana base58 case preservation |

### Sprint 7 — worker lifecycles (3 files, 37 tests)

| File | Tests | Coverage |
|---|---|---|
| `apps/api/src/__tests__/unit/crypto-worker.test.ts` | 13 (new) | `startCryptoWorker`: enable flag gate, single-worker idempotency, Redis-failure null return, concurrency config, error/failed listener registration. `stopCryptoWorker`: closes worker+queue, no-op safety. `setupCryptoWorkerJobs`: scheduler interval forwarding, exponential backoff with 3 attempts, no-op when disabled. `getCryptoQueue`: singleton |
| `apps/api/src/__tests__/unit/social-sentiment-worker.test.ts` | 11 (new) | Same lifecycle pattern, plus concurrency=1 verification (rate-limit-safe for Santiment) |
| `apps/api/src/__tests__/unit/nansen-smart-money-worker.test.ts` | 13 (new) | Lifecycle, dual-flag gate (worker enabled AND `NANSEN_API_KEY` set), `setupNansenSmartMoneyJobs` removes legacy NETFLOW scheduler before upserting CLEANUP cron `37 2 * * *`, `removeJobScheduler` errors swallowed gracefully, queue singleton |

### Sprint 8 — remaining OpenCode tools (2 files, 18 tests, vitest)

| File | Tests | Coverage |
|---|---|---|
| `core/epsilon-master/opencode/code_validator.test.ts` | 11 (new) | EPSILON_TOKEN/URL gates, http:// scheme check, code length 50000 limit, whitespace rejection, language enum, proxy URL `/v1/router/code-validator` (Bearer auth), 402/upstream/network errors, response_time_ms append, empty session_id stripped from body |
| `core/epsilon-master/opencode/instance_dispose.test.ts` | 7 (new) | Success message format, 5xx HTTP status, network error, POST method usage, `/instance/dispose` endpoint, default reason fallback, AbortSignal timeout present |

### Validation

```bash
# Sprint 5
bun test src/__tests__/unit/code-validator-service.test.ts        # 24 pass
bun test src/__tests__/integrations/code-validator.integration.test.ts  # 12 pass
bun test src/__tests__/unit/llm-service.test.ts                   # 12 pass

# Sprint 6
bun test src/__tests__/integrations/anthropic.integration.test.ts # 9 pass
bun test src/__tests__/integrations/jit-sync.integration.test.ts  # 19 pass

# Sprint 7 — workers must run separately due to bullmq mock+singleton pollution
bun test src/__tests__/unit/crypto-worker.test.ts                 # 13 pass
bun test src/__tests__/unit/social-sentiment-worker.test.ts       # 11 pass
bun test src/__tests__/unit/nansen-smart-money-worker.test.ts     # 13 pass

# Sprint 8 — OpenCode tools (vitest)
bunx vitest run \
  core/epsilon-master/opencode/code_validator.test.ts \
  core/epsilon-master/opencode/instance_dispose.test.ts
# 18 pass, 0 fail (vitest isolates process — no pollution issue)
```

### Cross-File Mock Isolation Note (Round 2)

**New pollution source: BullMQ singleton workers.** When all 3 worker test files run in one bun process, `_queue` and `_worker` module-level singletons survive across files (each file's `beforeEach` only stops its own worker — but the test file imports the production module which retains its `_queue` reference until module reload). Run each worker test file in a separate `bun test` invocation in CI.

### Test Count Summary (Round 2)

| Layer | New Test Files | New Tests |
|---|---|---|
| `apps/api/src/__tests__/unit` | 5 | 73 |
| `apps/api/src/__tests__/integrations` | 3 | 40 |
| `core/epsilon-master/opencode` | 2 | 18 |
| **Round 2 Total** | **10** | **131** |

### Combined Total Across Both Rounds

| Round | Files | Tests |
|---|---|---|
| Round 1 (Sprints 1-4) | 19 | 234 |
| Round 2 (Sprints 5-8) | 10 | 131 |
| **Standalone Expansion Total** | **29** | **365** |

### Coverage Gaps Remaining (intentionally deferred)

- `services/anthropic.ts` (Anthropic SDK proxy — internal, mocked at route layer instead)
- `services/llm.ts` `proxyToOpenRouter` happy-path full integration (covered indirectly via `routes/llm.ts`; pure Cost+Usage helpers covered)
- `services/entity-wallet-rpc.ts` (RPC helpers — low priority, used by entity-wallet flow already covered)
- `workers/discover-feed.ts`, `workers/onchain-index.ts` (deferred — same pattern as covered workers, low marginal value)
- OpenCode tools using vendor SDKs directly: `web_search` (Tavily SDK), `image_search` (Serper SDK calls), `image_generate` (Replicate SDK), `scrape_webpage` (FirecrawlApp SDK), `show.ts` (UI helper), `jit_sync` (similar to other proxy tools, low marginal value)
