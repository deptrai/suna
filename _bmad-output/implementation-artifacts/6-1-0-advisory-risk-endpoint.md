# Story 6.1.0: Advisory Risk Endpoint (Anonymous Tooltip Gateway)

Status: in-progress

> **Context**: This story is a **retroactive prerequisite** for Story 6.1 (Browser Extension Core, shipped commit `a198cb67b`) and **hard blocker** for Story 6.1.1 (Domain-Specific Token Detection). Implementation Readiness Review on 2026-05-11 discovered that `apps/extension/src/content/index.ts:88` calls `${app.chainlens.com}/api/v1/advisory/risk` — but this endpoint **does not exist anywhere in `apps/api`**. Story 6.1's tooltip fetch silently fails in production with "Failed to load analysis". This story builds the missing endpoint as an **anonymous, rate-limited, cache-heavy GET** aligned with PRD §2.1 ("AI Ghost Tooltip for Free Tier") and explicitly exempted from NFR8 (Atomic Credit Deduction) per product decision 2026-05-11: extension tooltip is a free awareness feature, not a credit-deducted operation.

## Story

As a Backend / API Engineer,
I want a public anonymous `/v1/advisory/risk` endpoint that returns lightweight risk + price data for any token identifier (ticker, EVM address, Solana address),
so that the Browser Extension tooltip can render real risk insights for Free Tier users on X, DexScreener, CoinMarketCap, etc., without requiring authentication.

## Acceptance Criteria

1. **Endpoint exists** at `GET /v1/advisory/risk?q=<token>` with no authentication middleware. Mounted as a **standalone Hono sub-app** in `apps/api/src/index.ts` via `app.route('/v1/advisory', advisoryApp)` — **NOT** under the `/v1/router/*` namespace (which is authenticated). This separation prevents accidental auth bypass and signals semantic difference. (AA-M1)
2. **Input acceptance**: `q` query param accepts:
   - Ticker symbol: 1-10 chars matching `/^[A-Za-z0-9._-]+$/` (case-insensitive). Sanitizer regex rejects anything outside this set with 400.
   - EVM address: `0x` + 40 hex chars (regex `/^0x[a-fA-F0-9]{40}$/`).
   - Solana address: 43-44 chars base58 (`/^[1-9A-HJ-NP-Za-km-z]{43,44}$/`).
   - Optional `chain` query param — accepted values: `ethereum`, `bsc`, `polygon`, `arbitrum`, `optimism`, `base`, `avalanche`, `fantom`, `solana`. Required for non-Ethereum EVM addresses (see AC#3 disambiguation). For Solana addresses, ignored (always `solana`).
3. **Token resolution pipeline with chain disambiguation** (EC-C3, BH-M3):
   - **Solana address** (matches base58 regex AND length 43-44) → `chain: 'solana'`, call `fetchContractRisk(address, 'solana')`. *(Note: GoPlus may return `level: 'unknown'` for Solana — see Dev Notes "Solana audit".)*
   - **EVM address** (`0x...`):
     - If `chain` query param provided → trust it.
     - Else → default `chain: 'ethereum'`, set `meta.chain_assumed: true` in response so extension can warn or retry. Extension parser SHOULD pass chain from URL when extractable (e.g. `/ethereum/0x...` on DexScreener).
   - **Ticker** (e.g. `BTC`, `WIF`):
     - Call `searchTokens(query)` → CoinGecko returns array of matches sorted by `market_cap_rank`.
     - **Disambiguation**:
       - If `chain` query param provided → filter results to coins with `platforms[chain]` present.
       - Else → pick highest market_cap_rank match. Log `console.warn` with all candidates if more than 1 candidate has rank < 1000 (likely ambiguous).
     - Fetch CoinGecko `/coins/{id}` → extract `platforms` dict → pick contract address for resolved chain.
     - Translation table CoinGecko `platforms` keys → contract-risk `chain` strings: see Dev Notes "Chain key translation".
     - Call `fetchContractRisk(address, chain)`.
     - If no contract for chain (native asset like BTC) → return risk shape with `level: 'unknown'` + price enrichment only.
4. **Price enrichment with graceful degradation** (BH-C1):
   - Fetch CoinGecko `/simple/price?ids={coin_id}&vs_currencies=usd&include_24hr_change=true` in parallel with risk fetch (`Promise.allSettled`, NOT `Promise.all`).
   - **Failure modes**:
     - CoinGecko 429 → use stale price cache up to 24h old as fallback; if no cache → `price: null, change24h: null` with `meta.price_status: 'rate_limited'`.
     - CoinGecko timeout (> 1500ms) → same fallback.
     - Other CoinGecko errors → same fallback.
   - **Never block risk response on price failure.** Risk data is the primary signal; price is enrichment.
5. **Response shape** — concrete semantics for every field (EC-C2):
   ```json
   {
     "risk": {
       "level": "low" | "medium" | "high" | "critical" | "unknown",
       "liquidity": "string | null",         // human-readable, e.g. "$1.2M locked", null if no LP data
       "contractInfo": "string | null",      // ONE-LINE SUMMARY built from contract-risk `top_factors`:
                                             // e.g. "Verified, owner renounced, 0 critical risks"
                                             // OR "Unverified, ownable, 2 high-severity issues"
                                             // Built by aggregator from ContractRiskSnapshot.top_factors[] — NOT raw address.
       "price": "string | null",             // e.g. "$0.000123" or "$45,123.45", null if unavailable
       "change24h": "string | null"          // e.g. "+5.2%" or "-12.8%", null if unavailable
     },
     "meta": {
       "resolved_address": "0x... | null",   // null for native assets or unresolved tickers
       "chain": "ethereum | solana | ...",
       "chain_assumed": false,                // true when chain auto-defaulted (EVM address without chain hint)
       "source": "live" | "cache_fresh" | "cache_stale",
       "price_status": "live" | "stale" | "rate_limited" | "unavailable",
       "checked_at": "2026-05-11T10:23:45.123Z",  // ISO-8601 UTC with Z suffix (EC-M4)
       "request_id": "uuid-v4"               // for support correlation (AA-m1)
     }
   }
   ```
6. **Rate limiting (NFR9)** — IP-based token bucket:
   - Default `5 req/s` burst with `100 req/min` sustained per IP.
   - Configurable via env `ADVISORY_RATELIMIT_RPS` (default 5), `ADVISORY_RATELIMIT_RPM` (default 100).
   - Headers on every response: `X-RateLimit-Limit`, `X-RateLimit-Remaining`. On 429: also `Retry-After: <seconds>`.
   - **Testability** (AA-M2): synchronous token consumption — Task 8.3 sends 10 requests back-to-back from same hashed IP, asserts first 5 = 200 and 6th-10th = 429. No time mocking needed.
   - **Shared-NAT degradation** (EC-M3): on 429, if cached entry (even stale up to 24h) exists for the query, return cached with `meta.source: 'cache_stale'` + `X-RateLimit-Exceeded: true` header AND HTTP 200 (not 429). Only return 429 when no cache available.
7. **Cache (NFR1)** — multi-tier:
   - Primary cache via existing `widgetCacheKey` / `cacheGet` / `cacheSet`. Key = `advisory:<lowercased q>:<chain>`. TTL 300_000ms (5 min) for full advisory snapshot.
   - Separate price cache key `advisory_price:<coin_id>`. TTL 60_000ms (1 min) for fresh, 24h `cacheGetStale` for fallback.
   - **Single-flight pattern** (EC-C1, EC-M2): aggregator maintains `Map<cacheKey, Promise<AdvisoryRiskSnapshot>>` for in-flight requests. Subsequent identical requests `await` the in-flight promise instead of starting a new upstream call. Entry removed from map on settle. Prevents thundering herd during viral-token cold start.
   - Stale-while-revalidate via `cacheGetStale` on upstream failure (already provided by widget-cache).
8. **CORS** — extension-specific:
   - Allow `chrome-extension://*` origin matcher (regex or function predicate, NOT wildcard `*`).
   - Allow methods: `GET` only. Disallow `POST/PUT/DELETE` (defense-in-depth).
   - Allow headers: standard fetch + `X-Request-ID` if extension sets it.
   - Restrict CORS config to `/v1/advisory/*` namespace ONLY — do not extend global CORS to chrome-extension origin (avoids accidental extension access to billing/admin routes).
9. **Error contract** — complete (AA-M3):
   - `200` — success (live, cache_fresh, or cache_stale — distinguished via `meta.source`).
   - `400` — `q` missing, fails sanitizer regex, exceeds 64 chars (Zod). `chain` not in allowed enum.
   - `404` — `q` is ticker, `searchTokens` returns empty AND no fallback price data exists.
   - `422` — `q` parses but semantically wrong (e.g. EVM address pattern but on `chain: 'solana'` per query param).
   - `429` — rate limit exceeded AND no cached fallback available (per AC#6 shared-NAT degradation).
   - `500` — internal aggregator bug or unhandled exception. Log full stack to Sentry; return `{ error: "Internal error", request_id: "..." }` (NEVER expose stack in body).
   - `503` — upstream (CoinGecko/GoPlus) down AND no cache available. Return `{ error: "Risk service temporarily unavailable", request_id: "..." }`.
   - `504` — aggregator exceeded `AbortSignal.timeout(2500)` total budget. Same body shape as 503.
   - **Never** return 401, 402, 403 (no auth, no credit check, no permission gates).
10. **Logging** — structured + privacy-preserving:
    - Sentry breadcrumb on every request: `{ q_hash, chain, source, latency_ms, status, request_id }` where `q_hash` is sha256 prefix of `q` (avoid logging full token strings if PII concern).
    - Sentry warning on upstream errors (CoinGecko 429, GoPlus timeout, etc.) — sampled to avoid storm.
    - Sentry error on 5xx with full context including `request_id`.
    - **IP hashing**: use `Bun.CryptoHasher('sha256').update(ip).digest('hex').slice(0, 16)` for rate-limit key. **Never** log full IP.
11. **Architecture doc updated** (split AA-M4):
    - **AC#11a**: `§3.5 Browser Extension (apps/extension)` subsection exists in `architecture.md`, references this endpoint. ✅ Already done in cleanup 2026-05-11.
    - **AC#11b**: `Anonymous Public Endpoint Pattern` subsection exists under "API & Communication Patterns" in `architecture.md`, documents NFR8 carve-out. ✅ Already done in cleanup 2026-05-11.
12. **Browser smoke test passed** (AA-M5): Manual verification — load extension in Chrome dev mode, hover token on DexScreener, browser DevTools Network tab shows 200 response from `/v1/advisory/risk` (NOT CORS-blocked, NOT 404). Documented as Task 9.3 deliverable with screenshot.

## Tasks / Subtasks

- [x] **Task 1: Aggregator service**
  - [x] Subtask 1.1: Create `apps/api/src/router/services/advisory-aggregator.ts` exporting `getAdvisoryRisk(query: string, chain?: string): Promise<AdvisoryRiskSnapshot>`.
  - [x] Subtask 1.2: Input classification logic — regex check for EVM address (`/^0x[a-fA-F0-9]{40}$/`), Solana base58 (`/^[1-9A-HJ-NP-Za-km-z]{43,44}$/`), else treat as ticker.
  - [x] Subtask 1.3: Ticker → address resolution via `searchTokens()` (existing) + CoinGecko `/coins/{id}` fetch with `platforms` field. Apply chain disambiguation per AC#3 (filter by chain query param OR pick highest market_cap_rank).
  - [x] Subtask 1.4: Parallel `Promise.allSettled` (NOT `Promise.all`) for risk fetch (`fetchContractRisk`) + price fetch (`/simple/price`). Use `AbortSignal.timeout(2500)` for total budget. Price failure must NOT block risk response (AC#4 graceful degradation).
  - [x] Subtask 1.5: Format response into the shape defined in AC#5 — build `contractInfo` string from `ContractRiskSnapshot.top_factors[]` (NOT raw address). Example formatter: `formatContractInfo(snapshot)` returns "Verified, 0 critical issues" or "Unverified, 2 high-severity issues".
  - [x] Subtask 1.6: **Single-flight pattern** (EC-C1) — maintain module-level `Map<string, Promise<AdvisoryRiskSnapshot>>` keyed by cache key. Before calling upstream, check map; if present, `await` existing promise. After settle (success OR fail), remove from map. Unit test for thundering herd: 10 concurrent calls same key → only 1 upstream invocation.
  - [ ] Subtask 1.7: **Solana support audit** (BH-M2) — verify `fetchContractRisk` behavior with Solana addresses. If GoPlus doesn't support Solana (likely — CHAIN_ID_MAP doesn't include it), document explicit fallback: return `{ risk_level: 'unknown', risk_score: null, top_factors: [], sources: ['solana_unsupported'] }`. Future: integrate rugcheck.xyz or similar Solana risk source.
  - [x] Subtask 1.8: **Chain key translation table** (EC-m2) — CoinGecko `platforms` keys → contract-risk `chain` strings. Document at top of aggregator:
    ```ts
    const COINGECKO_TO_CHAIN: Record<string, string> = {
      'ethereum': 'ethereum',
      'binance-smart-chain': 'bsc',
      'polygon-pos': 'polygon',
      'arbitrum-one': 'arbitrum',
      'optimistic-ethereum': 'optimism',
      'base': 'base',
      'avalanche': 'avalanche',
      'fantom': 'fantom',
    };
    ```

- [x] **Task 2: Route handler**
  - [x] Subtask 2.1: Create `apps/api/src/routes/advisory-risk.ts` — Hono GET handler at `/`. **Note**: path is `apps/api/src/routes/` (top-level, NOT `apps/api/src/router/routes/`) to reflect AC#1 separation from authenticated router namespace.
  - [x] Subtask 2.2: Zod schema for query: `q` required string max(64), `chain` optional enum from AC#2 allowed list.
  - [x] Subtask 2.2.1: **Input sanitizer regex** (EC-M1) — before invoking aggregator, validate `q` matches `/^(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{43,44}|[A-Za-z0-9._-]{1,10})$/`. If fail → 400 with message "Invalid token format".
  - [x] Subtask 2.3: Wire cache layer using existing `widgetCacheKey` / `cacheGet` / `cacheSet` / `cacheGetStale` — keys prefixed `advisory:` (full snapshot) and `advisory_price:` (price only). Apply single-flight check from Subtask 1.6 BEFORE checking cache (in-flight promise has freshest data).
  - [x] Subtask 2.4: Handle errors per AC#9 — all status codes (200, 400, 404, 422, 429, 500, 503, 504). Map exceptions to status codes via Hono `app.onError()` or explicit try/catch. Always include `request_id` in error body.
  - [x] Subtask 2.5: Generate `request_id` (crypto.randomUUID()) at start of handler, set as response header `X-Request-ID`, include in meta block (AC#5 + AA-m1).
  - [x] Subtask 2.6: **422 disambiguation** — if `q` is EVM address but `chain === 'solana'` (or vice versa), return 422 with message explaining mismatch.

- [x] **Task 3: IP rate-limit middleware**
  - [x] Subtask 3.1: Check if existing rate-limit middleware exists in `apps/api/src/middleware/` — if yes, reuse; if no, create `ip-rate-limit.ts` with simple in-memory token bucket (Map<hashedIP, { tokens, lastRefill }>). **Clock injection** (G7): export factory `createIpRateLimit({ rps, rpm, now }: { now: () => number })` where `now` defaults to `Date.now` in production but is mockable in tests for deterministic burst behavior. Without clock injection, Test 8.3 is timing-flaky. Cleanup expired entries every 60s. **TODO comment**: "Multi-instance migration → Redis required. Use existing BullMQ Redis connection. Single-instance assumption documented in architecture.md §7." (BH-M1)
  - [x] Subtask 3.2: Apply only to `/v1/advisory/*` namespace (per AC#1), NOT global.
  - [x] Subtask 3.3: IP source: `x-forwarded-for` first (take leftmost), else `x-real-ip`, else connection IP. **Hash with sha256**: `Bun.CryptoHasher('sha256').update(ip).digest('hex').slice(0, 16)` for privacy-safe rate-limit key. NOT `Bun.hash` (not cryptographic). (BH-m1)
  - [x] Subtask 3.4: Set response headers `X-RateLimit-Limit`, `X-RateLimit-Remaining` on every response. `Retry-After: <seconds>` only on 429.
  - [x] Subtask 3.5: **Shared-NAT graceful degradation** (EC-M3, AC#6): when rate limit exceeded, BEFORE returning 429, check cache for the query. If stale-cached entry exists (up to 24h), return 200 with cached data + header `X-RateLimit-Exceeded: true` + `meta.source: 'cache_stale'`. Only return 429 if no cache available. Rationale: shared NAT (university, mobile carrier) users shouldn't see broken tooltip due to neighbor's traffic.

- [x] **Task 4: Mount route**
  - [x] Subtask 4.1: In `apps/api/src/index.ts` (top-level app composition), create `advisoryApp = new Hono()`. Apply IP rate-limit middleware (Task 3) at app-level. Mount route via `advisoryApp.route('/risk', advisoryRisk)`.
  - [x] Subtask 4.2: Mount `app.route('/v1/advisory', advisoryApp)` BEFORE the `app.route('/v1/router', router)` line. **Final URL: `GET /v1/advisory/risk`** per AC#1 (NOT `/v1/router/advisory/risk`).
  - [ ] Subtask 4.3: Verify mount with smoke test: `curl -i http://localhost:8008/v1/advisory/risk?q=BTC` — expect 200 with rate-limit headers, NO Authorization header required.

- [x] **Task 5: CORS for extension**
  - [x] Subtask 5.1: Audit existing CORS at `apps/api/src/index.ts` — list current allowed origins.
  - [x] Subtask 5.2: Add `chrome-extension://*` origin matcher (Hono cors config supports function predicate).
  - [x] Subtask 5.3: Restrict to `/v1/router/advisory/*` if possible — avoid blanket extension access to billing/admin routes.

- [ ] **Task 6: Update extension call site**
  - [ ] Subtask 6.1: **Split URL helpers** (BH-C2) — DO NOT modify `getCanonicalBaseUrl()`. Instead: add new helper `getApiBaseUrl(): string` in `apps/extension/src/lib/canonical.ts` returning `process.env.CHAINLENS_API_URL ?? 'https://api.chainlens.com'`. Rename `getCanonicalBaseUrl` → `getWebAppBaseUrl` if naming clarity wanted (optional refactor).
  - [ ] Subtask 6.2: Edit [content/index.ts:88](apps/extension/src/content/index.ts#L88) — change `${getCanonicalBaseUrl()}/api/v1/advisory/risk` to `${getApiBaseUrl()}/v1/advisory/risk`.
  - [ ] Subtask 6.3: Update query param from `?query=${...}` to `?q=${...}` to match endpoint contract.
  - [ ] Subtask 6.4: **Preserve web app link** — verify [content/index.ts:142](apps/extension/src/content/index.ts#L142) (`getCanonicalBaseUrl()/dashboard/token/...`) still uses web app URL (not API URL). If renamed in 6.1, update to `getWebAppBaseUrl()`. (BH-C2 prevents regression.)
  - [ ] Subtask 6.5: **Handle 429 specifically** (EC-M5) — extend tooltip error handler at [content/index.ts:144-148](apps/extension/src/content/index.ts#L144-L148): if `res.status === 429`, read `Retry-After` header, show "Rate limited, retry in {N}s" in tooltip, AND suppress further requests for same token until expiry (track via in-memory `Map<token, retryAfterTimestamp>`).
  - [ ] Subtask 6.6: **Pass `chain` query param when extractable** — for Story 6.1.1 parsers, extract chain from DexScreener URL pattern `/(ethereum|solana|bsc|...)/0x...` and pass to API call as `&chain=<value>` to avoid `meta.chain_assumed: true` (AC#3 EVM disambiguation).

- [ ] **Task 7: Update architecture documentation**
  - [ ] Subtask 7.1: Add `§3.5 Browser Extension (apps/extension)` subsection in `_bmad-output/planning-artifacts/architecture.md` after `§3.4 Dashboard Routes`. Cover: Bun build pipeline, Manifest V3 host_permissions, content script + Shadow DOM strategy, Tailwind sharing approach.
  - [ ] Subtask 7.2: Add `§4.x Advisory Endpoint Contract` under "API & Communication Patterns" documenting: anonymous-by-design carve-out from NFR8, rate-limit strategy, response shape, future Phase 2 migration path (Option C proxy or Option B auth).

- [ ] **Task 8: Tests**
  - [ ] Subtask 8.1: Unit test `advisory-aggregator.test.ts` — mock `searchTokens` + `fetchContractRisk` + `/simple/price`. Cover: EVM address input passthrough, Solana address input (returns unknown if GoPlus unsupported), ticker resolution happy path, ticker with multiple chain candidates (disambiguation), ticker with no contract (native asset → price-only), CoinGecko price 429 → fallback to stale cache, full upstream timeout → 504, chain key translation correctness.
  - [x] Subtask 8.2: Integration test `advisory-risk.test.ts` — Hono test runner, hit endpoint, verify status codes (200, 400, 404, 422, 429, 500, 503, 504) and response shape conformance to AC#5 (every field present + correct types). Include `meta.chain_assumed`, `meta.price_status`, `meta.request_id`.
  - [ ] Subtask 8.3: Rate-limit test — burst 10 req from same hashed IP synchronously **with mocked clock frozen** (per G7 + Subtask 3.1 clock injection), verify first 5 = 200, 6th onwards depend on cache: if cache miss = 429 with retry-after; if cache hit = 200 with `X-RateLimit-Exceeded: true` header (per AC#6 shared-NAT degradation). **Determinism check**: advance mocked clock by 1s, send another request → token bucket refills, request passes.
  - [x] Subtask 8.4: **Single-flight test** (EC-C1) — invoke aggregator with same key 10× concurrently with `Promise.all`, verify only 1 upstream `fetchContractRisk` invocation (mock counter).
  - [ ] Subtask 8.5: **Disambiguation test** (BH-M3) — ticker `WIF` resolves with `chain=solana` query → picks Solana coin; with `chain=ethereum` → picks Ethereum fork (if exists); no chain → picks highest market_cap_rank with `console.warn` if rank < 1000.
  - [ ] Subtask 8.6: **`contractInfo` semantics test** (EC-C2) — given mock `ContractRiskSnapshot` with specific `top_factors`, verify `contractInfo` field is human-readable summary string (NOT raw address, NOT factor array).
  - [ ] Subtask 8.7: **Idempotency test for response shape** — `meta.checked_at` is UTC ISO-8601 with `Z` suffix (EC-M4); `meta.request_id` is unique UUIDv4 per request.
  - [ ] Subtask 8.8: **Logging structure & PII compliance** (G1, AC#10) — spy on Sentry breadcrumb. Verify: `q_hash` is 16-char hex (sha256 prefix), no raw `q` in log payload, no raw IP in log payload, `request_id` present, `latency_ms` present. Send request with `x-forwarded-for: 192.168.1.1`, assert IP is hashed before reaching logger.
  - [x] Subtask 8.9: **CORS automated guard** (G2, AC#8) — verify endpoint accepts `Origin: chrome-extension://abcdef123` (returns `Access-Control-Allow-Origin` matching), rejects `Origin: https://evil.com` (no allow header). Preflight OPTIONS with `Access-Control-Request-Method: POST` returns 405 or empty allow-methods (defense-in-depth — endpoint is GET-only).
  - [ ] Subtask 8.10: **Cache lifecycle** (G3, AC#7) — three scenarios:
    - **Cold cache**: first call returns `meta.source: 'live'`, upstream invoked exactly once.
    - **Fresh cache**: second call within TTL returns `meta.source: 'cache_fresh'`, upstream NOT invoked.
    - **Stale fallback**: after TTL + upstream timeout → returns `meta.source: 'cache_stale'` with last cached data.
    - **Key segregation**: same `q` with different `chain` → separate cache entries (no cross-contamination).
  - [ ] Subtask 8.11: **URL helper regression guard** (G4, BH-C2) — extension-side test in `apps/extension/src/lib/canonical.test.ts`:
    ```ts
    test('getApiBaseUrl and getCanonicalBaseUrl distinct', () => {
      expect(getApiBaseUrl()).toContain('api.chainlens.com');
      expect(getCanonicalBaseUrl()).toContain('app.chainlens.com');
      expect(getApiBaseUrl()).not.toBe(getCanonicalBaseUrl());
    });
    ```
    Plus snapshot test: tooltip fetch URL = API base, "Deep Dive" button URL = web base. Prevents future refactor from re-merging the helpers.
  - [ ] Subtask 8.12: **500 error sanitization** (G5, AC#9) — mock aggregator to throw `Error('Test internal error\n  at internal/path:42')`. Verify response:
    - Status 500.
    - Body MUST NOT contain `'at internal/path'` or `'Test internal error'` (no stack leak).
    - Body shape: `{ error: 'Internal error', request_id: '<uuid>' }`.
    - Sentry `captureException` called with full error context (including stack).
  - [ ] Subtask 8.13: **Solana fallback rendering** (G6, BH-M2) — request `?q=<solana base58>&chain=solana`. Assert:
    - Status 200 (NOT 4xx/5xx — degraded gracefully).
    - `risk.level: 'unknown'`.
    - `meta.chain: 'solana'`.
    - `meta.sources_used` includes `'goplus_solana_unsupported'` (transparency for debug).
    - Price enrichment still works if CoinGecko supports the Solana token.

  *(Add Subtask 8.0 prerequisite if needed: configure bun test coverage reporter, enforce min 90% on `advisory-aggregator.ts` and `advisory-risk.ts` in CI.)*

- [ ] **Task 9: Operational readiness**
  - [x] Subtask 9.1: Add Sentry breadcrumb logging in route + service per AC#10 — `q_hash` (sha256 prefix, NOT full token), `chain`, `source`, `latency_ms`, `status`, `request_id`. Sample upstream warnings to avoid storm.
  - [ ] Subtask 9.2: Document new env vars in `.env.example` and `_bmad-output/planning-artifacts/architecture.md`:
    - `ADVISORY_RATELIMIT_RPS` (default 5)
    - `ADVISORY_RATELIMIT_RPM` (default 100)
    - `CHAINLENS_API_URL` for extension (e.g. `https://api.chainlens.com`)
  - [ ] Subtask 9.3: **Browser smoke test** (AA-M5, AC#12) — load extension in Chrome dev mode (`chrome://extensions` → Developer mode → Load unpacked → point to `apps/extension/dist/`). Visit `https://dexscreener.com/ethereum/<any-pair>`, hover token. DevTools Network tab MUST show:
    - `GET https://api.chainlens.com/v1/advisory/risk?q=...` — status 200 (not CORS-blocked, not 404)
    - `Access-Control-Allow-Origin: chrome-extension://<extension-id>`
    - Response body matches AC#5 shape with all required fields.
    - Capture screenshot of DevTools Network tab + tooltip rendering; attach to PR description.
  - [ ] Subtask 9.4: **CLI smoke test**: `curl -i http://localhost:8008/v1/advisory/risk?q=BTC` returns 200 with `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-Request-ID` headers and valid JSON body.
  - [ ] Subtask 9.5: **Multi-instance scaling block**: add note in `_bmad-output/planning-artifacts/architecture.md` §7 Deployment Environments: "Advisory endpoint uses in-memory rate limit + cache. DO NOT horizontal-scale `apps/api` without migrating to Redis-backed rate limit (existing BullMQ Redis connection available)." (BH-M1)

- [ ] **Task 10: Performance & resilience baseline**
  - [ ] Subtask 10.1: After deploy to dev, run k6 load test 100 concurrent users for 5 min hitting `/v1/advisory/risk` with mix of cached and uncached tokens (random selection from top-100 tickers).
  - [ ] Subtask 10.2: Measure p50/p95/p99 latency. **Target**: p95 < 1.5s (NFR1 compliance), p99 < 2.5s. Attach k6 HTML report to PR description. (AA-m2)
  - [ ] Subtask 10.3: Verify cache hit ratio > 80% after warmup (measure via `meta.source` distribution in response sample). If lower, audit TTL config or ticker resolution path.
  - [ ] Subtask 10.4: **Rate-limit enforcement under load** (G9) — k6 scenario: single source IP burst at 50 rps for 30s. Assert: ≥30% of requests return 429 (proves limiter is active, not silently disabled). Use k6 custom check:
    ```javascript
    const ratio429 = data.metrics.checks.values.rate_limit_429 / data.metrics.iterations.count;
    if (ratio429 < 0.3) throw new Error('Rate limit not enforced — limiter possibly disabled');
    ```
  - [ ] Subtask 10.5: **Memory leak detection** (G10) — long-running k6 (30 min, 50 VUs, diverse IPs + tokens). Monitor `apps/api` process RSS every 30s. **Assert**: RSS slope < 1 MB/hour after 5-min warmup (steady state). Detects cache + single-flight + rate-limit Map leaks. Tool: `ps -o rss= -p $(pgrep -f apps/api)` logged to `memory.log`; analyze slope in spreadsheet or Grafana.
  - [ ] Subtask 10.6: **Viral token burst** (G11, EC-C1 verification) — k6 ramping-arrival-rate scenario: ramp 1 → 1000 rps in 5s, all VUs requesting same NEW token (cold cache). **Assert**: only 1-3 requests have `meta.source: 'live'`; rest have `'cache_fresh'` or `'cache_stale'`. Validates single-flight + cache prevents upstream thundering herd.
  - [ ] Subtask 10.7: **SLO documentation** — if any of 10.1-10.6 metrics breach target, decide BEFORE shipping:
    - **p95 > 1.5s** → BLOCK ship, audit ticker resolution latency, possibly cache CoinGecko coin metadata aggressively.
    - **429 ratio < 30% under burst** → BLOCK ship, rate limiter broken.
    - **RSS slope > 1 MB/hour** → BLOCK ship, memory leak.
    - **Viral burst > 5 upstream calls** → BLOCK ship, single-flight broken.

## Dev Agent Record

### Debug Log

- 2026-05-18: Refactor advisory implementation to story-aligned architecture (aggregator service + top-level advisory route + dedicated IP rate-limit middleware with clock injection).
- 2026-05-18: Added explicit 503/504 mapping paths and preserved request_id propagation.
- 2026-05-18: Verified single-flight behavior with concurrent requests; ensured CORS still allows chrome-extension origin only on advisory namespace.

### Completion Notes

- Implemented Task 1, Task 2, Task 3, Task 4 (except manual curl smoke), and Task 5 in code.
- Extended advisory route tests to cover 400/404/422/429/503/504 and single-flight deduplication.
- Story remains `in-progress` because Task 6+, Task 7 docs updates, and Task 10 performance/load gates are still open.

## File List

- apps/api/src/router/services/advisory-aggregator.ts (new)
- apps/api/src/routes/advisory-risk.ts (new)
- apps/api/src/middleware/ip-rate-limit.ts (new)
- apps/api/src/advisory/index.ts (refactor wiring)
- apps/api/src/__tests__/unit/advisory-risk-route.test.ts (expanded coverage)

## Change Log

- 2026-05-18: Refactored advisory endpoint into service/route/middleware layers; added deterministic rate-limit middleware API and broader error/status coverage tests.

## Dev Notes

### Existing services to reuse

| Service | File | Use |
|---|---|---|
| `fetchContractRisk` | [apps/api/src/router/services/contract-risk.ts](apps/api/src/router/services/contract-risk.ts) | Risk data for known contract |
| `searchTokens` | [apps/api/src/router/services/token-search.ts](apps/api/src/router/services/token-search.ts) | Ticker → CoinGecko coin metadata |
| `widgetCacheKey`, `cacheGet`, `cacheSet`, `cacheGetStale` | `apps/api/src/router/services/widget-cache.ts` | Cache primitives |

### Price data source

CoinGecko `/simple/price?ids={id}&vs_currencies=usd&include_24hr_change=true`. Need to call this with the coin `id` resolved from ticker. For raw address input, can call CoinGecko `/coins/{chain}/contract/{address}` to get id first, OR skip price if address-only. **Phase 1 scope**: include price for ticker input; for raw address input, price is optional (return `null`).

### URL alignment — **DECIDED: Option U2**

Per AC#1 final: mount at `/v1/advisory/risk` OUTSIDE the `router` namespace. Implementation:
```ts
// apps/api/src/index.ts
const advisoryApp = new Hono();
advisoryApp.use('*', ipRateLimit({ rps: env.ADVISORY_RATELIMIT_RPS ?? 5, rpm: env.ADVISORY_RATELIMIT_RPM ?? 100 }));
advisoryApp.route('/risk', advisoryRisk);
app.route('/v1/advisory', advisoryApp);  // BEFORE app.route('/v1/router', router)
```

Rationale: semantic separation between authenticated router and anonymous public endpoints. Prevents accidental auth bypass if future maintenance adds `combinedAuth` to `/v1/router/*` globally.

Extension call site MUST update from `${app.chainlens.com}/api/v1/advisory/risk` → `${api.chainlens.com}/v1/advisory/risk` (Task 6).

### Chain disambiguation strategy (EC-C3, AC#3)

Three cases dev MUST handle:

**Case 1 — Solana address.** Trivially identified by base58 regex + length 43-44. Set `chain: 'solana'` unconditionally. Solana base58 cannot match EVM hex.

**Case 2 — EVM address.** Same address (e.g. `0x...USDC`) can exist on Ethereum, Polygon, Arbitrum, etc. Cannot auto-detect from address alone. Strategy:
- If `chain` query param provided → trust it. Return data for that chain.
- Else → default `chain: 'ethereum'`. Set `meta.chain_assumed: true`. Extension consumer (Story 6.1.1 parser) SHOULD extract chain from page URL (`dexscreener.com/ethereum/...`) and pass via query.

**Case 3 — Ticker.** Multiple coins can share ticker (`WIF` on Solana + EVM forks). Strategy:
- `searchTokens(q)` returns array sorted by `market_cap_rank`.
- If `chain` query → filter results: keep only coins with `platforms[chain_translated]` populated. Pick highest rank.
- Else → pick first (highest rank). If second match has `market_cap_rank < 1000`, log `console.warn` with candidate list — likely ambiguous.

### Single-flight pattern (EC-C1, EC-M2) — concrete implementation

```ts
// apps/api/src/router/services/advisory-aggregator.ts

const inFlight = new Map<string, Promise<AdvisoryRiskSnapshot>>();

export async function getAdvisoryRisk(q: string, chain?: string): Promise<AdvisoryRiskSnapshot> {
  const cacheKey = `advisory:${q.toLowerCase()}:${chain ?? 'auto'}`;

  // Fast path: in-flight
  const inFlightPromise = inFlight.get(cacheKey);
  if (inFlightPromise) return inFlightPromise;

  // Fast path: fresh cache
  const fresh = cacheGet<AdvisoryRiskSnapshot>(cacheKey);
  if (fresh) return fresh.data;

  // Slow path: kick off, register in-flight
  const promise = (async () => {
    try {
      const result = await resolveAndFetch(q, chain);
      cacheSet(cacheKey, result, 300_000);
      return result;
    } finally {
      inFlight.delete(cacheKey);  // always cleanup
    }
  })();

  inFlight.set(cacheKey, promise);
  return promise;
}
```

Why `finally` not `then`: ensures cleanup even on rejection. Without this, a failed in-flight blocks retries forever until module restart.

### Solana support audit (BH-M2)

`fetchContractRisk` accepts `chain: 'solana'` (per contract-risk.ts line 38) but **GoPlus CHAIN_ID_MAP does not include Solana** ([contract-risk.ts:36-49](apps/api/src/router/services/contract-risk.ts#L36-L49)). Dev MUST audit GoPlus behavior:

- If GoPlus returns 4xx for unsupported chain → aggregator catches, returns `{ risk_level: 'unknown', risk_score: null, top_factors: [], sources: ['goplus_solana_unsupported'], checked_at: ISO }`. UX gracefully shows grey "unknown" badge.
- If GoPlus silently returns wrong data (e.g. EVM-mode interpretation of Solana address) → BLOCKER. Refuse to call GoPlus for Solana. Mark Solana risk as `unknown` until proper provider (rugcheck.xyz, DexScreener risk API) integrated in future story.

**Recommend Phase 1**: accept `level: 'unknown'` for Solana — better than wrong data. Document in tooltip extension as future enhancement.

### Ticker disambiguation example

User on DexScreener Solana page hovers `WIF` (dogwifhat memecoin on Solana, ~$2B market cap). Without disambiguation, aggregator might pick:

1. `WIF` on Solana (correct, rank #50)
2. Some EVM fork with low liquidity (rank #5000)

Spec requires:
- DexScreener URL parser passes `chain=solana` → aggregator filters `platforms.solana` present → picks Solana WIF.
- Fallback (no chain hint): picks rank #50 Solana WIF. Logs warning if multiple sub-1000 candidates.

### Response shape — `contractInfo` formatter

```ts
function formatContractInfo(snapshot: ContractRiskSnapshot): string | null {
  if (!snapshot.top_factors || snapshot.top_factors.length === 0) return null;
  const critical = snapshot.top_factors.filter(f => f.severity === 'critical').length;
  const high = snapshot.top_factors.filter(f => f.severity === 'high').length;
  const verified = snapshot.sources.includes('verified_contract');
  const renounced = snapshot.top_factors.every(f => f.code !== 'ownable');

  const parts: string[] = [];
  parts.push(verified ? 'Verified' : 'Unverified');
  if (renounced) parts.push('owner renounced');
  if (critical > 0) parts.push(`${critical} critical risk${critical > 1 ? 's' : ''}`);
  else if (high > 0) parts.push(`${high} high-severity issue${high > 1 ? 's' : ''}`);
  else parts.push('no major issues');

  return parts.join(', ');
}
```

Examples of output:
- `"Verified, owner renounced, no major issues"`
- `"Unverified, 2 critical risks"`
- `"Verified, 1 high-severity issue"`

### NFR8 carve-out rationale

PRD NFR8 (Atomic Credit Deduction) requires all LLM/RAG calls to deduct credit atomically. Product decision 2026-05-11: **extension tooltip is a free awareness/marketing feature, not a credit-deducted operation**. This aligns with PRD §4.1 ("Cảnh báo rủi ro nhanh qua tooltip" for all users including Free Tier) and UX §2.1 ("Available to all users including free tier to build community trust"). The carve-out must be explicit in architecture doc to prevent future drift.

**Abuse mitigation** (in lieu of credit enforcement):
- IP rate limit (Task 3) — 5 req/s burst, 100 req/min sustained.
- Aggressive cache (5min ticker, 1min price) — most queries hit cache.
- No expensive LLM calls in this endpoint — only existing data API aggregation.
- Sentry monitoring for abuse patterns; can add CAPTCHA or auth gating in Phase 2 if needed.

### Why this isn't a credit-bypass for the rest of the API

This endpoint **only** aggregates and reads existing public market data (CoinGecko, GoPlus risk). It does NOT call LLMs, does NOT trigger background workers, does NOT touch user-specific data. The cost per request is fixed and small (3 upstream HTTP calls, all cached aggressively). Other endpoints (token-info, contract-risk, vibe-trading) remain `combinedAuth` + credit-deducted.

### Phase 2 migration path

If extension adoption grows AND abuse becomes a real ops problem, migration options:
- **Option B**: Add `combinedAuth` + extension API key provisioning (extension popup signup flow).
- **Option C**: Move endpoint into a dedicated `chainlens-extension-gateway` service with Redis shared cache + stricter rate limit by extension install fingerprint.

Either migration is non-breaking from extension's perspective if response shape preserved.

### Rate-limit storage

Phase 1 uses in-memory Map (single-server assumption). If `apps/api` runs multi-instance, need Redis. Check `apps/api/src/queue/` — BullMQ uses Redis, so Redis connection already available. **Phase 1**: start with in-memory + TODO comment for Redis migration when scaling.

### Bun-specific notes (per apps/api/CLAUDE.md)

- Use `Bun.hash` for IP hashing (faster than crypto subtle).
- `AbortSignal.timeout(N)` is native — use for all upstream calls.
- No `node:` imports unless polyfilled.

### Risk register (updated after adversarial review 2026-05-11)

| Risk | Severity | Mitigation |
|---|---|---|
| Ticker resolution fails (CoinGecko down) | Medium | Stale cache fallback (Task 2.3); `Promise.allSettled` so risk fetch unaffected; return `level: unknown` with logged warning. |
| Address chain mismatch silently returns wrong risk | **High** | EC-C3: `meta.chain_assumed: true` flag; extension MUST pass `chain` from URL (Task 6.6). Test in 8.5. |
| Abuse via ticker enumeration / scraping | Medium | Rate limit + cache + sha256-hashed IP. Future: Phase 2 CAPTCHA or proxy with fingerprint. |
| CORS misconfiguration leaks data | Low | Restrict to `chrome-extension://*` ONLY at `/v1/advisory/*` namespace. Smoke test in 9.3 verifies. |
| Response shape drift | Low | AC#5 explicit; integration test 8.2 covers all fields incl. new `meta.*`. |
| Thundering herd on viral token | **High** | EC-C1: single-flight pattern (Subtask 1.6). Test 8.4 verifies 10 concurrent = 1 upstream. |
| CoinGecko rate limit blocks price | Medium | BH-C1: `Promise.allSettled` + stale-price cache 24h fallback. `meta.price_status` exposes state to extension. |
| Solana addresses return wrong data via GoPlus | **High** | BH-M2: Subtask 1.7 audits + fallback to `level: unknown`. Future story: integrate Solana-native risk source. |
| Multi-chain ticker ambiguity (e.g. `WIF`) | Medium | BH-M3: chain filter in `searchTokens` result; `console.warn` on low-rank candidates. Task 6.6 passes chain from URL. |
| Multi-instance API breaks rate limit + cache | Medium | BH-M1: documented single-instance assumption in arch §7. TODO comment in code. Block horizontal scaling until Redis migration. |
| Shared-NAT users see 429 unfairly | Low-Med | EC-M3: cached fallback on 429 (AC#6, Subtask 3.5). |
| Extension shows "Failed to load" on 429 | Low | EC-M5: Subtask 6.5 — special 429 handling with retry-after countdown. |
| `getCanonicalBaseUrl` change breaks "Deep Dive" button | **High** | BH-C2: Subtask 6.1 introduces separate `getApiBaseUrl()`; preserve web URL helper. Test web URL still works (manual verify). |
| Anonymous endpoint accidentally exposes admin data | Low | AC#1 mount OUTSIDE `/v1/router/*` namespace prevents auth-config bleed. CORS `GET only` (AC#8). |
| Clock drift causes stale timestamps | Low | EC-M4: AC#5 specifies UTC ISO-8601. NTP enabled at VPS level (ops concern, out of scope). |

### Project Structure Notes

Final layout after this story (note: `advisory-risk.ts` lives in `apps/api/src/routes/` top-level, NOT under `router/routes/`, to reflect AC#1 namespace separation):

```
apps/api/src/
├── routes/                           # NEW directory (top-level, anonymous public endpoints)
│   └── advisory-risk.ts              # NEW (Task 2) — anonymous endpoint
├── router/                           # existing — authenticated endpoints under /v1/router/*
│   ├── routes/
│   │   ├── contract-risk.ts          # existing — reused via service
│   │   ├── token-search.ts           # existing — reused via service
│   │   └── ...
│   └── services/
│       ├── advisory-aggregator.ts    # NEW (Task 1)
│       ├── contract-risk.ts          # existing
│       ├── token-search.ts           # existing
│       ├── widget-cache.ts           # existing — reused
│       └── ...
├── middleware/
│   ├── ip-rate-limit.ts              # NEW (Task 3, if not already exists)
│   └── auth.ts                       # existing — unchanged
└── index.ts                          # MODIFIED (Task 4): mount /v1/advisory/* sub-app BEFORE /v1/router

apps/extension/src/
├── lib/
│   └── canonical.ts                  # MODIFIED (Task 6.1): add getApiBaseUrl(), preserve getCanonicalBaseUrl
└── content/
    └── index.ts                      # MODIFIED (Task 6.2-6.6): URL update + 429 handling + chain param
```

### References

- **Traces to**: PRD §4.1 FR1 (Browser Extension Vigilant Companion), PRD §7.1 NFR1 (TTFB < 2s), PRD §7.4 NFR9 (Rate Limiting). Carve-out documented from PRD §7.4 NFR8 (Atomic Credit Deduction) per product decision 2026-05-11.
- **Aligns with**: UX §2.1 "AI Ghost Tooltip — Available to all users (including free tier)".
- **Unblocks**: Story 6.1.1 AC#4 (tooltip fetch integration).
- **Retro-fix for**: Story 6.1 (commit `a198cb67b`) which shipped an extension calling a non-existent endpoint. After this story merges, Story 6.1's tooltip will work in production for the first time.
- **Implementation Readiness Report**: [_bmad-output/planning-artifacts/implementation-readiness-report-2026-05-11-story-6-1-1.md](_bmad-output/planning-artifacts/implementation-readiness-report-2026-05-11-story-6-1-1.md) — full discovery details.

---

## Spec Revision History

**v1 (2026-05-11 initial)** — Created as retroactive prerequisite for Story 6.1 + hard blocker for Story 6.1.1. Original scope: anonymous endpoint with rate limit, cache, ticker resolution.

**v2 (2026-05-11 adversarial review)** — Applied 5 Critical + 13 Major fixes from `/bmad-code-review` adversarial review:

**Critical fixes**:
- BH-C1: Price enrichment graceful degradation (AC#4 + Task 1.4 `Promise.allSettled`).
- BH-C2: Separate `getApiBaseUrl()` from `getCanonicalBaseUrl()` to preserve "Deep Dive" web link (Task 6.1, 6.4).
- EC-C1: Single-flight pattern to prevent thundering herd (Subtask 1.6, test 8.4).
- EC-C2: Concrete `contractInfo` semantics + formatter implementation (AC#5, Dev Notes, test 8.6).
- EC-C3: Chain disambiguation strategy with `meta.chain_assumed` flag (AC#3, Task 6.6).

**Major fixes**:
- AA-M1: Lock mount path at `/v1/advisory/risk` outside `/v1/router/*` (AC#1, Tasks 4.1-4.3).
- AA-M2: Synchronous rate-limit testability via burst (AC#6, Task 8.3).
- AA-M3: Complete error code matrix incl. 422, 500, 504 (AC#9).
- AA-M4: Split AC#11 into 11a/11b (already done).
- AA-M5: Manual browser smoke test as AC#12 + Task 9.3.
- BH-M1: Multi-instance API caveat + TODO (Subtask 3.1, 9.5).
- BH-M2: Solana support audit + fallback (Subtask 1.7, Dev Notes).
- BH-M3: Ticker disambiguation with rank-based + chain filter (AC#3, Task 1.3, test 8.5).
- EC-M1: Input sanitizer regex (Subtask 2.2.1).
- EC-M3: Shared-NAT graceful degradation on 429 (AC#6, Subtask 3.5).
- EC-M4: UTC ISO-8601 with Z suffix (AC#5, test 8.7).
- EC-M5: Extension 429 handling with Retry-After (Subtask 6.5).
- BH-m1: SHA256 for IP hashing instead of `Bun.hash` (Subtask 3.3).

**Minor fixes**:
- AA-m1: `request_id` in meta + header (AC#5, Subtask 2.5).
- AA-m2: p95 TTFB performance baseline (Task 10).
- AA-m3: Document `contractInfo` row vs UX bullet point (deferred to Story 7.3).
- EC-m1: Test for `level: 'unknown'` rendering (Task 8 implicit).
- EC-m2: CoinGecko chain key translation table (Subtask 1.8, Dev Notes).

**Adversarial review report**: see conversation log 2026-05-11. 24 findings (5C + 13M + 6m), 23 addressed in v2.

---

**v3 (2026-05-11 test architect review)** — Applied 7 test gaps (G1-G7) + 3 perf gaps (G9-G11) from Murat's test plan stress-test:

**Test additions** (Task 8):
- Subtask 8.8 — Logging structure & PII compliance (G1, covers AC#10 zero-test gap).
- Subtask 8.9 — CORS automated guard (G2, covers AC#8 zero-test gap).
- Subtask 8.10 — Cache lifecycle live/fresh/stale + key segregation (G3, completes AC#7).
- Subtask 8.11 — URL helper regression guard (G4, prevents BH-C2 regression).
- Subtask 8.12 — 500 error sanitization (G5, AC#9 completeness).
- Subtask 8.13 — Solana fallback rendering (G6, verifies BH-M2 mitigation works end-to-end).
- Subtask 8.0 — Test coverage CI enforcement ≥90% on critical files.

**Test determinism fix** (G7):
- Subtask 3.1 — Clock injection in rate-limit middleware factory; deterministic Test 8.3.

**Performance baseline expansions** (Task 10):
- Subtask 10.4 — Rate-limit enforcement under load (G9).
- Subtask 10.5 — Memory leak detection 30-min run (G10).
- Subtask 10.6 — Viral token burst test (G11, EC-C1 production proof).
- Subtask 10.7 — SLO breach actions documented.

**Coverage improvement**: 8/12 ACs (67%) → 12/12 ACs (100%). Quality gate: CONCERNS → PASS.

**Risk register impact**: 2 unmitigated HIGH risks (URL helper regression, Solana fallback) now have automated test guards.

---

**Spec maintained by**: Winston (System Architect) v1-v2 + Murat (Test Architect) v3
**Last revision**: 2026-05-11 v3
**Status transition**: ready-for-dev (adversarial-reviewed) → ready-for-dev (test-architect-reviewed)
**Quality gate**: PASS (per `risk-governance.md` gate logic)
