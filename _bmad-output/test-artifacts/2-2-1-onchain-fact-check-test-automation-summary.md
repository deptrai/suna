# Test Automation Summary — Story 2.2.1: On-chain Fact Check Layer

## Result: 55 pass, 0 fail (across 5 test files)

---

## Files Created / Expanded

### 1. `apps/api/src/__tests__/unit/onchain-fact-check-service.test.ts` (expanded)
Tests pure business logic functions — no mocks needed.

| Test | Priority | Description |
|------|----------|-------------|
| positive article + >5% outflow => flagged | P0 | Core risk flag |
| outflow ≤5% => passed | P0 | Below threshold |
| missing balance → transfer_only confidence downgrade | P0 | Incomplete data path |
| neutral sentiment + >5% outflow => NOT flagged | P1 | Sentiment gate |
| negative sentiment + >5% outflow => NOT flagged | P1 | Sentiment gate |
| empty wallet array => passed, 0 wallets, 0 transfers | P1 | Empty input |
| only market_maker/exchange roles => stays passed | P1 | Role filter |
| exactly at threshold (5.0%) => passed | P1 | Boundary: strict >5 |
| transfer_only + flagged full-basis => medium | P2 | Mixed confidence downgrade |
| net inflow => 0 net outflow, passed | P2 | Negative outflow clamped |
| extractReliableTokenAddress: valid EVM address | P0 | Address extraction |
| extractReliableTokenAddress: null when none | P0 | |
| extractReliableTokenAddress: null for undefined | P0 | |
| extractReliableTokenAddress: lowercases | P1 | |
| extractReliableTokenAddress: first of multiple | P1 | |
| extractReliableTokenAddress: short hex not matched | P2 | |
| isPromotionalArticle: "partnership" keyword | P0 | |
| isPromotionalArticle: "listing" case-insensitive | P0 | |
| isPromotionalArticle: "launch" | P0 | |
| isPromotionalArticle: false for non-promo | P0 | |
| isPromotionalArticle: false for undefined | P0 | |
| isPromotionalArticle: "exchange listing" two-word | P1 | |
| isPromotionalArticle: "funding" | P1 | |

### 2. `apps/api/src/__tests__/unit/onchain-fact-check-utils.test.ts` (new)
Tests `canStartFactCheckWorker` with mocked config.

| Test | Priority | Description |
|------|----------|-------------|
| false when worker disabled | P0 | |
| false when quicknode + no RPC URLs | P0 | |
| true when quicknode + URL for at least one chain | P1 | |
| true when non-quicknode provider | P1 | |
| false when multi-chain, no URLs | P2 | |
| true when multi-chain, at least one URL | P2 | |

### 3. `apps/api/src/__tests__/unit/onchain-fact-check-provider.test.ts` (new)
Tests `runOnchainFactCheck` end-to-end via mocked fetch + DB.

Key helper: `enqueueFetch(responses[])` for sequential multi-call mocking.

| Test | Priority | Description |
|------|----------|-------------|
| no watchlist => insufficient_wallet_context | P0 | Empty watchlist guard |
| QuickNode: outflow <5% => passed | P0 | Happy path |
| QuickNode: outflow >5% + positive => flagged | P0 | Flag trigger |
| QuickNode HTTP 500 => fallback, returns result | P0 | Provider fallback |
| all providers fail => provider_unavailable | P1 | Total failure |
| Etherscan NOTOK => fallback to Blockscout | P1 | Error string fallback |
| Etherscan direct provider: no QuickNode | P1 | Direct Etherscan |
| QuickNode eth_call fails => transfer_only | P2 | Balance unavailable |
| Etherscan filters timestamps outside window | P2 | Lookback filter |

### 4. `apps/api/src/__tests__/unit/onchain-fact-check-route.test.ts` (expanded)
Tests route validation edge cases.

| Test | Priority | Description |
|------|----------|-------------|
| cache-first returns cost 0 | P0 | |
| force_refresh checks credits and bills | P0 | |
| force_refresh without credits => 402 | P0 | |
| missing token_address => 400 | P0 | |
| invalid token_address format => 400 | P0 | |
| malformed JSON body => 400 | P0 | |
| valid body with all optional fields => 200 | P1 | |
| invalid article_sentiment enum => 400 | P1 | |
| session_id with invalid characters => 400 | P2 | |

### 5. `apps/api/src/__tests__/unit/onchain-fact-check-worker.test.ts` (expanded)
Tests BullMQ worker job processing.

| Test | Priority | Description |
|------|----------|-------------|
| scheduler uses upsertJobScheduler | P0 | Queue setup |
| discover item mutated when flagged | P0 | Mutation path |
| discover item NOT mutated when passed | P1 | No-op path |
| refresh-recent-positive-feed enqueues promo items | P1 | Batch enqueueing |
| refresh skips high/critical rows | P1 | Pre-flag skip |
| refresh skips rows with no token address | P1 | Token extraction gate |
| error and failed handlers registered | P1 | Worker resilience |
| flagged title prefix applied idempotently | P2 | Double-prefix prevention |

---

## Implementation Fixes Applied

Two bugs discovered and fixed during test development:

### Fix 1: Static `ETHERSCAN_CHAIN_MAP` captured apiKey at module init time
**File:** `apps/api/src/router/services/onchain-fact-check.ts`  
**Problem:** `ETHERSCAN_CHAIN_MAP` built apiKey from `config.ETHERSCAN_API_KEY` as a module-level constant, making it impossible to test with mocked config.  
**Fix:** Replaced the constant with `ETHERSCAN_BASE_URLS` (static URLs only) and `getEtherscanApiKey(chain)` function that reads config dynamically at call time.

### Fix 2: `source` variable initialized to `'quicknode'` regardless of configured provider
**File:** `apps/api/src/router/services/onchain-fact-check.ts`  
**Problem:** `let source = 'quicknode'` caused `source === 'etherscan'` check to always be false, resulting in `source = 'mixed'` even when Etherscan was the primary provider.  
**Fix:** Initialize `source` based on `config.ONCHAIN_FACT_CHECK_PROVIDER` at call time.

### Fix 3: Missing connection mock in provider test
**File:** `apps/api/src/__tests__/unit/onchain-fact-check-provider.test.ts`  
**Problem:** Without mocking `../../queue/bullmq/connection`, running provider tests alongside worker tests caused an "unhandled error between tests" from `connection.ts:11` (Redis URL undefined).  
**Fix:** Added `mock.module('../../queue/bullmq/connection', ...)` to provider test.
