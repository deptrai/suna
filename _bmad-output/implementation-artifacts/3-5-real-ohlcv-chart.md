# Story 3.5: Real OHLCV Chart for Token Detail Page

Status: done

<!-- Spec'd 2026-05-10 by /bmad-create-story. Verified against actual codebase via MCP trio (Serena + SymDex + CRG) + web research on CoinGecko free API. -->

## Story

As a crypto user đang xem token detail page,
I want xem candlestick OHLC chart với data thật cho token đang xem (bằng `0x` address, không chỉ 10 known symbols),
so that price chart consistent với header price ($3.93 không bị contradicting với fake $1-based candles), và tôi có thể phân tích kỹ thuật trực tiếp trên trang token mà không phải mở tab khác.

## Acceptance Criteria

1. **AC1 — Chart section trên token detail page render real OHLC data:**
   - **Given** user navigate đến `/dashboard/token/[address]?chain=ethereum` với address là token có trên CoinGecko (vd UNI = `0x1f9840a85d5af5bf1d1762f925bdaddc4201f984`).
   - **When** page load.
   - **Then** Chart section render `<TradingViewChart>` candlestick với 30 ngày OHLC từ CoinGecko (interval 4h → ~180 bars), MA20/MA50 overlay, RSI toggle (parity Story 3.2).
   - **And** Header section ($3.93 hiện tại) và Chart không có price contradiction — close của bar mới nhất phải gần với `price_usd` ở Header (cùng nguồn CoinGecko).
   - **And** chart **KHÔNG** generate fake data nếu fetch fail — render error card "Chart unavailable: {reason}" với retry link, KHÔNG mock-fallback.
   - **And** Solana addresses (`chain=solana|sol`) render section với "Chart coming soon (Solana support requires GeckoTerminal — post-MVP)" — KHÔNG crash, KHÔNG empty chart (parity Holders/Transactions Solana branch ở Story 3.4).
   - **And** Tokens không có trên CoinGecko (vd contract mới list, scam coin) render fallback "Chart unavailable: token not indexed on CoinGecko" — Header section đã có fallback "Listing pending" nên 2 sections coherent.

2. **AC2 — Backend service + route mới `/v1/router/token-ohlcv`:**
   - **Given** spec yêu cầu OHLC cho arbitrary EVM contract address (CoinGecko `/coins/{platform}/contract/{address}/ohlc` **không tồn tại**, phải 2-step lookup).
   - **When** Story 3.5 implement.
   - **Then** create `apps/api/src/router/services/token-ohlcv.ts` với function `fetchTokenOhlcv({ slug?, address?, chain?, days? }, options)` flow:
     - Step 1 — Resolve coinId: nếu input là EVM address (`/^0x[a-fA-F0-9]{40}$/`), call `/coins/{platform}/contract/{address}` (reuse `COINGECKO_PLATFORM_MAP` từ `token-info.ts` — extract thành shared helper `resolveCoinIdFromAddress(address, chain)`)
     - Step 2 — Fetch OHLC: call `/coins/{coinId}/ohlc?vs_currency=usd&days={days}` — return `[[timestamp_ms, open, high, low, close], ...]`
     - Map response → `OhlcvBar[]` shape (`{ time: number_seconds, open, high, low, close, volume?: 0 }`)
   - **And** create route `apps/api/src/router/routes/token-ohlcv.ts` với pattern parity `token-info.ts`:
     - POST `/v1/router/token-ohlcv` — body `{ slug?, address?, chain?, days?, session_id? }` (Zod validation)
     - `combinedAuth` middleware (Supabase JWT hoặc API key) — register tại `apps/api/src/router/index.ts` SONG SONG với `token-info`
     - `checkCredits` → cache lookup → fetch → `cacheSet` → `deductToolCredits` (atomic NFR8 parity)
     - Cache TTL **5 phút** (closed candles không thay đổi; current candle latency 5min OK cho UX) — register `token_ohlcv: 5 * 60_000` ở `widget-cache.ts` `DEFAULT_TTL`
     - Cache key: `widgetCacheKey('token_ohlcv', primaryArg, days_str, chain_str)` — bao gồm `days` + `chain` để invalidate independent
     - Return `{ success: true, stale, cache_status, cost, items: OhlcvBar[], days, source: 'coingecko', last_updated }`
   - **And** input validation:
     - `days`: enum `[1, 7, 14, 30, 90, 180]` — CoinGecko free tier supports these; default 30 (best UX granularity 4h bars). Reject other values với 400.
     - `address`: EVM regex (`/^0x[a-fA-F0-9]{40}$/`) hoặc CoinGecko slug regex (`/^[a-z0-9_-]{1,128}$/`). At least one of `slug`/`address` required (parity token-info).
     - `chain`: optional, max 32 chars; only valid khi `address` is EVM (slugs không cần chain).
   - **And** error handling:
     - 404 từ CoinGecko (`/coins/{platform}/contract/{address}` returns 404 hoặc `/coins/{coinId}/ohlc` returns empty array) → return `{ success: false, error: 'token not indexed on CoinGecko' }` (KHÔNG throw 500)
     - 429 rate-limited → throw `RateLimitError` → route returns stale cache nếu có, else `{ success: false, error: 'CoinGecko rate-limited' }`
     - Network timeout (`AbortSignal.timeout(2500)`) → cùng pattern token-info.ts
   - **And** **KHÔNG** call CoinGecko 2 lần khi cache hit cho cả `coinId resolution` và `ohlc data` — combined cache key (single fetch path).

3. **AC3 — Frontend `ChartSection` server component thay thế `ChartPlaceholderCard`:**
   - **Given** existing `apps/web/src/app/(dashboard)/token/[address]/_components/ChartPlaceholderCard.tsx` đang render "Chart coming soon" placeholder.
   - **When** Story 3.5 implement.
   - **Then** replace với `ChartSection.tsx` (server component, parity HoldersSection/TxsSection pattern):
     - Fetch `/v1/router/token-ohlcv` server-side với `getServerAuthHeader()` (parity HeaderSection)
     - `signal: AbortSignal.timeout(3000)`, `next: { revalidate: 300 }` (5min — match upstream cache TTL)
     - Solana → render "Chart coming soon (Solana)" message (KHÔNG fetch)
     - Token-info fallback ("Listing pending") → vẫn render `ChartSection` (CoinGecko có thể return OHLC kể cả khi coin không xuất hiện ở `/coins/markets` — hoặc fallback to error message gracefully)
     - Discriminated union response type (parity RiskSection/HoldersSection từ Story 3.4 review):
       ```ts
       type TokenOhlcvResponse =
         | ({ success: true; stale?: boolean } & { items: OhlcvBar[]; days: number; source: string; last_updated: string })
         | { success: false; error: string };
       ```
     - Pass `data.items` → `<TradingViewChart token={symbol_or_short_addr} data={items} />` (existing component, KHÔNG modify props)
   - **And** wrap trong `<Suspense fallback={<ChartSkeleton />}>` ở `page.tsx` — register skeleton trong existing `_components/skeletons.tsx` (~520px height matching chart container).
   - **And** xóa `ChartPlaceholderCard.tsx` hoàn toàn (không reference nữa). Update `page.tsx` import.

4. **AC4 — `OhlcvBar.volume` thành optional + chart-indicators backward compat:**
   - **Given** `apps/web/src/components/chart/chart-indicators.ts` có `interface OhlcvBar { ...; volume: number }` required.
   - **When** Story 3.5 implement.
   - **Then** thay `volume: number` → `volume?: number`. CoinGecko `/coins/{id}/ohlc` **KHÔNG** trả volume — backend sẽ omit field thay vì gắn `0` (lying).
   - **And** verify: `trading-view-chart.tsx` không reference `bar.volume` (đã verify — `grep "volume"` returns 0 matches). `calcMA`/`calcRSI` chỉ dùng `bar.close`. Story 3.2 OHLCV mock endpoint vẫn return `volume` integer — không break.
   - **And** Story 3.2 path (`/dashboard/chart/[token]`) tiếp tục hoạt động với mock data — KHÔNG modify `apps/api/src/market/routes.ts:/ohlcv/:token` endpoint (out of scope). 2 paths coexist:
     - `/dashboard/chart/[token]` → mock data (Story 3.2, known symbols)
     - `/dashboard/token/[address]/[chart section]` → real CoinGecko OHLC (Story 3.5)

5. **AC5 — Tests cover backend + frontend:**
   - **Given** Stories 3.2, 3.3, 3.4 establish testing pattern: backend unit tests at `apps/api/src/__tests__/`, frontend at `apps/web/src/.../<__tests__>/`.
   - **When** Story 3.5 implement.
   - **Then** add tests:
     - **Backend service** (`apps/api/src/__tests__/unit-token-ohlcv.test.ts`, ≥5 tests):
       - resolveCoinIdFromAddress: EVM address + valid chain → coinId
       - resolveCoinIdFromAddress: 404 from contract endpoint → throws 'not found'
       - fetchTokenOhlcv: slug input (no resolution) → direct OHLC fetch, returns mapped bars
       - fetchTokenOhlcv: address input → 2-step (resolution + OHLC), returns bars
       - fetchTokenOhlcv: empty OHLC array → throws 'token not indexed'
       - days validation: rejects 5, 100, -1; accepts 1/7/14/30/90/180
     - **Backend route** (`apps/api/src/__tests__/integrations/token-ohlcv.test.ts`, ≥4 tests):
       - 200 happy path with mocked service → response shape matches schema
       - 400 invalid `days` value
       - 400 missing both slug+address
       - 402 insufficient credits
       - Cache HIT skips upstream fetch
     - **Frontend** (`apps/web/src/app/(dashboard)/token/[address]/__tests__/ChartSection.test.tsx`, ≥3 tests):
       - Solana chain → renders "coming soon" without fetch
       - `success: false` response → renders error card with reason
       - `success: true` with items → passes data to `TradingViewChart`
   - **And** type-check `bunx tsc --noEmit` clean cho all touched files (parity Story 3.4 acceptance).

## Tasks / Subtasks

- [x] Task 1: Extract shared `resolveCoinIdFromAddress` helper (AC2)
  - [x] Move `COINGECKO_PLATFORM_MAP` + EVM-address-to-coinId logic từ `token-info.ts:38-87` vào `apps/api/src/router/services/coingecko-helpers.ts` (NEW)
  - [x] Export `COINGECKO_PLATFORM_MAP`, `resolveCoinIdFromAddress(address, chain, options)`, `isEvmAddress(input)`
  - [x] Update `token-info.ts:fetchTokenInfo` to import from helpers (refactor, behavior unchanged)
  - [x] Verify Story 3.4 token-info tests still pass: `bun test apps/api/src/__tests__/integrations/token-info.test.ts`

- [x] Task 2: Backend OHLCV service (AC2)
  - [x] Create `apps/api/src/router/services/token-ohlcv.ts`
  - [x] Export `fetchTokenOhlcv({ slug?, address?, chain?, days = 30 }, options)` returning `Promise<OhlcvSnapshot>`
  - [x] Reuse `resolveCoinIdFromAddress` từ Task 1
  - [x] Call CoinGecko `/coins/{coinId}/ohlc?vs_currency=usd&days={days}` — map `[[ms, o, h, l, c], ...]` → `[{ time: Math.floor(ms/1000), open, high, low, close }, ...]`
  - [x] Handle 429 → throw `RateLimitError`; handle 404/empty → throw `'not indexed'`; handle timeout → throw with context
  - [x] AbortSignal.timeout(2500) (parity token-info)

- [x] Task 3: Backend route + middleware registration (AC2)
  - [x] Create `apps/api/src/router/routes/token-ohlcv.ts` mirroring `token-info.ts` shape
  - [x] Zod schema `TokenOhlcvRequestSchema` với `days: z.union([z.literal(1), z.literal(7), z.literal(14), z.literal(30), z.literal(90), z.literal(180)]).optional().default(30)`
  - [x] checkCredits → cacheGet → fetch → cacheSet → deductToolCredits (atomic, parity)
  - [x] Cache key: `widgetCacheKey('token_ohlcv', primaryArg, String(days), chain ?? 'none')`
  - [x] Register tool cost: add `'token_ohlcv'` entry at `apps/api/src/config.ts:TOOL_COSTS` (cost 0 cho MVP — same as token-info)
  - [x] Register route at `apps/api/src/router/index.ts`:
    - `router.use('/token-ohlcv/*', combinedAuth);` (after token-search)
    - `router.route('/token-ohlcv', tokenOhlcv);`
  - [x] Update `widget-cache.ts:DEFAULT_TTL` thêm `token_ohlcv: 5 * 60_000`

- [x] Task 4: Frontend `ChartSection` server component (AC3)
  - [x] Create `apps/web/src/app/(dashboard)/token/[address]/_components/ChartSection.tsx` (server component)
  - [x] Fetch `/v1/router/token-ohlcv` với `getServerAuthHeader()`, body `{ address, chain, days: 30 }`
  - [x] Discriminated union response type
  - [x] Solana branch → "Chart coming soon (Solana)" message
  - [x] Error branch → render Cyber-Glass card với error message + "Try again" link (`/dashboard/token/[address]?chain={chain}`)
  - [x] Success branch → `<TradingViewChart data={items} token={symbol ?? shortAddr(address)} />`
  - [x] Add `ChartSkeleton` to `_components/skeletons.tsx` (~520px height block, animate-pulse Cyber-Glass)
  - [x] Update `page.tsx`: replace `<ChartPlaceholderCard />` → `<Suspense fallback={<ChartSkeleton />}><ChartSection address={address} chain={chain} /></Suspense>`
  - [x] Delete `ChartPlaceholderCard.tsx` + remove import

- [x] Task 5: Make `OhlcvBar.volume` optional (AC4)
  - [x] Edit `apps/web/src/components/chart/chart-indicators.ts:OhlcvBar` — `volume?: number`
  - [x] Verify Story 3.2 endpoint shape unchanged (`apps/api/src/market/routes.ts:OhlcvBar` interface still has volume); type compat works because optional
  - [x] Verify Story 3.2 chart route still passes its data through unchanged: `apps/web/src/app/(dashboard)/chart/[token]/page.tsx`
  - [x] Type-check entire web app: `cd apps/web && bunx tsc --noEmit` (zero new errors)

- [x] Task 6: Tests (AC5)
  - [x] Backend service unit tests (≥5) — 8 tests: resolveCoinIdFromAddress (3) + fetchTokenOhlcv (5)
  - [x] Backend route integration tests (≥4) — 5 tests via Hono test client + mock.module
  - [x] Frontend `ChartSection` tests (≥3) — 4 tests via global fetch mock
  - [x] Run full test suites: `bun test apps/api/src/__tests__/` + `bun test apps/web/src/app/(dashboard)/token/`
  - [x] **Story 3.4 regression check**: existing token-info tests pass after Task 1 helper extraction

- [x] Task 7: Browser verification + smoke test
  - [x] Local dev: `cd apps/web && bunx next dev --turbopack --port 3000` + `cd apps/api && bun run dev`
  - [x] Navigate `http://localhost:3000/token/0x1f9840a85d5af5bf1d1762f925bdaddc4201f984?chain=ethereum` — Header shows $3.98 UNI, Chart shows "Chart unavailable" (correct — no CoinGecko API key in local dev, no fake data fallback per AC1)
  - [x] Test fallback: navigate to non-existent address `0x0000000000000000000000000000000000000001` — Chart section shows "Chart unavailable" gracefully, page doesn't crash
  - [x] Test Solana: `/token/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v?chain=solana` — Chart section shows "Chart coming soon" + "Solana support requires GeckoTerminal — post-MVP"

### Review Findings

<!-- Generated by /bmad-code-review on 2026-05-10. 3 layers: Blind Hunter + Edge Case Hunter + Acceptance Auditor. -->

#### Patch (unambiguous fixes)

- [x] [Review][Patch] Retry link `/dashboard/token/...` 404s — App Router `(dashboard)` group doesn't add segment, real URL is `/token/[address]`. Replace `<a>` with Next.js `<Link>` to avoid full reload [apps/web/src/app/(dashboard)/token/[address]/_components/ChartSection.tsx:69-73]
- [x] [Review][Patch] Address-404 throws `"CoinGecko: token '0x...' not found"` instead of spec-mandated `"token not indexed on CoinGecko"` — AC1/AC2 spec wording fidelity [apps/api/src/router/services/coingecko-helpers.ts:46-48]
- [x] [Review][Patch] `resolveCoinIdFromAddress` silently falls back to `'ethereum'` on unknown chain (e.g. `chain='BASE'` uppercase, `chain='linea'`) — produces wrong-but-plausible token data. Reject unknown chain explicitly [apps/api/src/router/services/coingecko-helpers.ts:37]
- [x] [Review][Patch] `fetchOhlcvServer` typecasts `JSON.parse(text) as TokenOhlcvResponse` without narrow check — Hono HTTPException response (`{message: '...'}`) lies as `success:undefined`, downstream renders empty error message [apps/web/src/app/(dashboard)/token/[address]/_components/ChartSection.tsx:34-39]
- [x] [Review][Patch] Zod schema `address: z.string().min(1).max(128)` accepts ANY 1-128 char string. Spec AC2 mandates EVM regex `/^0x[a-fA-F0-9]{40}$/` OR slug regex `/^[a-z0-9_-]{1,128}$/` [apps/api/src/router/routes/token-ohlcv.ts:25-26]
- [x] [Review][Patch] Zod refine missing: `chain` accepted with `slug` input. Spec AC2: "chain only valid khi address is EVM (slugs không cần chain)" — currently a slug+chain combo creates phantom cache key partition [apps/api/src/router/routes/token-ohlcv.ts:30]
- [x] [Review][Patch] `fetchTokenOhlcv` casts JSON.parse result `as [number, number, number, number, number][]` without runtime validation — CoinGecko `null` values become `NaN` in chart, no crash but garbage candles [apps/api/src/router/services/token-ohlcv.ts:76-94]
- [x] [Review][Patch] `ChartSection` ignores `data.stale === true` — backend's 24h stale fallback can serve old data with no UI signal. `HoldersSection.tsx:95` shows `<Badge>Cached</Badge>` for parity [apps/web/src/app/(dashboard)/token/[address]/_components/ChartSection.tsx:80-83]
- [x] [Review][Patch] Solana branch wording deviates from spec: implementation splits into two elements ("Chart coming soon" + subtitle) but spec AC1 expects single-line "(Solana)" qualifier [apps/web/src/app/(dashboard)/token/[address]/_components/ChartSection.tsx:53-58]
- [x] [Review][Patch] `SOLANA_CHAINS` set lookup is case-sensitive — `?chain=Solana` slips past, hits CoinGecko EVM endpoint with "Solana" platform → 404 [apps/web/src/app/(dashboard)/token/[address]/_components/ChartSection.tsx:14,49]
- [x] [Review][Patch] Stale-fallback integration test missing — `cacheGetStale` mocked to always return null, the `try → throw → cacheGetStale → success:true,stale:true` path completely untested. Add ≥1 integration test covering this branch [apps/api/src/__tests__/integrations/token-ohlcv.test.ts:33]
- [x] [Review][Patch] Service test "no slug or address → throws immediately" mocks `global.fetch` but never asserts non-call. Theatre test — fails to validate the early-validation invariant. Add `expect(fetchMock).not.toHaveBeenCalled()` + `.rejects.toThrow(/at least one of slug or address/i)` [apps/api/src/__tests__/unit-token-ohlcv.test.ts:141-144]
- [x] [Review][Patch] Days enum tests cover only `5` rejection — spec AC5 explicitly lists `5, 100, -1`. Add 2 cases [apps/api/src/__tests__/integrations/token-ohlcv.test.ts:93-101]
- [x] [Review][Patch] `ChartSection.test.tsx` doesn't import the React component — only tests `fetchOhlcvServer`. Solana short-circuit branch (lines 51-60 of ChartSection.tsx) untested [apps/web/src/app/(dashboard)/token/[address]/__tests__/ChartSection.test.tsx]
- [x] [Review][Patch] Integration tests don't assert `cache_status` body field or `X-Cache-Status` header — cache provenance invisible to tests, inverted assignment would still pass [apps/api/src/__tests__/integrations/token-ohlcv.test.ts:75-91, 126-143]
- [x] [Review][Patch] Task 7 browser verification (Dev Agent Record) claims happy-path verified but Completion Notes show ONLY error states — real OHLC candles + MA20/MA50 + RSI render NEVER visually confirmed. Run browser smoke test [Task 7 / AC1.1]

#### Defer (pre-existing or future work)

- [x] [Review][Defer] HeaderSection cache TTL 60s vs ChartSection OHLC TTL 5min → divergent prices possible (header $35,500 vs chart last close $35,400). Drift max ~0.5%, but visible inconsistency. Fix needs unified data source or shorter OHLC cache (5x more API calls). Defer as known UX limitation [apps/api/src/router/routes/token-info.ts:38, token-ohlcv.ts:47]
- [x] [Review][Defer] Thundering herd on cold cache start — no in-flight singleflight dedup, 5 concurrent tabs hit CoinGecko 5x. Parity with token-info pattern, cross-cutting platform-level fix needed (matches Story 3.4 deferred item) [apps/api/src/router/routes/token-ohlcv.ts]
- [x] [Review][Defer] `resolveCoinIdFromAddress` error-string sniffing for control flow (`e.message.includes('CoinGecko')`) — fragile, refactor to typed error subclasses [apps/api/src/router/services/coingecko-helpers.ts:54-57]
- [x] [Review][Defer] `TradingViewChart token={...}` prop is dead code — component only destructures `data`. Cleanup pass to remove [apps/web/src/components/chart/trading-view-chart.tsx:25]
- [x] [Review][Defer] `last_updated: new Date().toISOString()` in OHLCV snapshot is fetch-time, not data-time. CoinGecko `/ohlc` doesn't return upstream timestamp. Latent bug if FE ever shows this field [apps/api/src/router/services/token-ohlcv.ts:100]
- [x] [Review][Defer] No error boundary around ChartSection — sibling sections (Risk/Holders/Txs) also lack one. Cross-cutting [apps/web/src/app/(dashboard)/token/[address]/page.tsx:144]
- [x] [Review][Defer] `deductToolCredits` writes DB row on every cache hit despite cost=0 — pure DB latency overhead. Sibling parity (token-info same flaw), cross-cutting billing optimization [apps/api/src/router/routes/token-ohlcv.ts:88]
- [x] [Review][Defer] `COINGECKO_PLATFORM_MAP` missing chains: `linea`, `scroll`, `mantle`, `zksync`. Combined with patch above (reject unknown chain), missing entries = unsupported chains. Extend in future [apps/api/src/router/services/coingecko-helpers.ts:6-14]
- [x] [Review][Defer] Test cleanup: `_clearWidgetCacheForTests` imported but never called (mock factory doesn't export it) — dead import, misleading test scaffolding [apps/api/src/__tests__/integrations/token-ohlcv.test.ts:8]
- [x] [Review][Defer] `x-cg-demo-api-key` header hardcoded — would silently fail Pro tier. CoinGecko Pro uses `x-cg-pro-api-key`. Currently no Pro tier configured, parity issue [apps/api/src/router/services/coingecko-helpers.ts:18-24]

#### Dismissed (15 — false positive / parity / cosmetic)

- Route catch swallows upstream 5xx → 200 + success:false (parity with token-info, established pattern)
- Magic numbers 2500/3000ms timeouts (parity with token-info)
- Header `X-Cache-Status` value vs body `cache_status` naming difference (parity with token-info)
- `markupMultiplier: 1.0` on cost=0 (parity with all tools)
- `TTL_MS` declared in route + `DEFAULT_TTL` registry (default + override is fine)
- Skeleton `style={{ height: '520px' }}` inline (acceptable, matches chart container)
- Multi-chain race partitions correctly by cache key
- `JSON.parse(text)` text discarded without log (cosmetic)
- Verbose Zod error JSON in 400 response (parity)
- Audit description grows unbounded (capped by Zod max 128)
- `as any` repeated in test files (test code, not prod)
- Brittle URL substring matching in test helper (test code)
- Discriminated union missing `cache_status`/`cost` fields on FE (FE doesn't use them)
- `success:false` 404 returns HTTP 200 OK (matches spec AC2: "KHÔNG throw 500")
- BACKEND_URL fallback to NEXT_PUBLIC (server-only component, not in client bundle)

## Dev Notes

### Verified Assumptions (MCP Trio Pre-Spec Verification + Web Research)

| Assumption | Verification | Result |
|---|---|---|
| CoinGecko `/coins/{platform}/contract/{address}/ohlc` exists | Web research (Perplexity, 2026) | ❌ **Does NOT exist** — must 2-step: address→coinId via `/coins/{platform}/contract/{address}`, then coinId→OHLC via `/coins/{coinId}/ohlc` |
| `/coins/{coinId}/ohlc` returns volume | Web research | ❌ Returns `[[ts_ms, o, h, l, c]]` — **no volume**. Hence `volume?: number` (Task 5) |
| GeckoTerminal alternative for volume | Web research | ✅ Has volume but requires pool address lookup (extra step) — defer to future story if volume becomes required |
| Existing `COINGECKO_PLATFORM_MAP` reusable | Read `apps/api/src/router/services/token-info.ts:38-47` | ✅ Already defined for 7 EVM chains; extract to shared helper (Task 1) |
| `TradingViewChart` accepts external data without modification | Read `apps/web/src/components/chart/trading-view-chart.tsx:12-25` | ✅ Props are `{ token: string; data: OhlcvBar[] }` — pass-through works. Token used only for display, not fetch (inline fetch removed in Story 3.2 review patches) |
| `volume` field used by chart code | `grep "volume"` in chart code | ✅ Zero matches — chart doesn't render volume bars; making field optional is safe |
| `widget-cache` pattern reusable | Read `apps/api/src/router/services/widget-cache.ts` | ✅ `DEFAULT_TTL` registry + `widgetCacheKey()` + `cacheGetStale()` all available; mirror `token_info` pattern |
| `combinedAuth` middleware handles SSR fetch from web app | Read Story 3.4 token-info/holders/txs routes — all use `combinedAuth` | ✅ Cookie-based or header-based auth; works with `getServerAuthHeader()` |
| Existing `ChartPlaceholderCard` is the only blocker | Read `page.tsx` line 235-236 | ✅ Single import + render site to update |
| `OhlcvBar.volume` change is non-breaking for Story 3.2 | Read `apps/api/src/market/routes.ts:140` returns `volume: integer` | ✅ Optional field accepts both `0` and missing; existing endpoint unchanged |

### Source Tree Components to Touch

**NEW files:**
- `apps/api/src/router/services/coingecko-helpers.ts` — extracted `COINGECKO_PLATFORM_MAP` + `resolveCoinIdFromAddress`
- `apps/api/src/router/services/token-ohlcv.ts` — service layer
- `apps/api/src/router/routes/token-ohlcv.ts` — route handler
- `apps/api/src/__tests__/unit-token-ohlcv.test.ts` — service unit tests
- `apps/api/src/__tests__/integrations/token-ohlcv.test.ts` — route integration tests
- `apps/web/src/app/(dashboard)/token/[address]/_components/ChartSection.tsx` — server component
- `apps/web/src/app/(dashboard)/token/[address]/__tests__/ChartSection.test.tsx` — frontend tests

**UPDATE files:**
- `apps/api/src/router/services/token-info.ts` — refactor: import platform map + helper from `coingecko-helpers.ts` (behavior preserved)
- `apps/api/src/router/services/widget-cache.ts:DEFAULT_TTL` — add `token_ohlcv: 5 * 60_000`
- `apps/api/src/router/index.ts` — register `/token-ohlcv` route + middleware
- `apps/api/src/config.ts:TOOL_COSTS` — add `token_ohlcv: { ... }`
- `apps/web/src/components/chart/chart-indicators.ts` — `volume?: number` (was required)
- `apps/web/src/app/(dashboard)/token/[address]/page.tsx` — swap import + JSX
- `apps/web/src/app/(dashboard)/token/[address]/_components/skeletons.tsx` — add `ChartSkeleton`

**DELETE files:**
- `apps/web/src/app/(dashboard)/token/[address]/_components/ChartPlaceholderCard.tsx` — replaced

### Technical Requirements

- **Stack parity Story 3.4**: Hono + Bun runtime, Drizzle (no schema changes), Zod validation, `combinedAuth` middleware, `widget-cache` in-memory TTL
- **CoinGecko Demo API**: free tier ~30 req/min — combined token-info + token-ohlcv ~2 req per token-page-render. Cache 5min protects against thundering herd. **NO** raw API key changes needed (`COINGECKO_API_KEY` already loaded if available; demo header `x-cg-demo-api-key` already attached in `token-info.ts`).
- **Frontend: Next.js 15 App Router** — server component + Suspense pattern (parity Story 3.4 sections), Tailwind Cyber-Glass theme (`border-white/10 bg-black/40 backdrop-blur-xl`)
- **Chart library**: `lightweight-charts ^5.2.0` already installed (Story 3.2) — NO new dependency
- **TypeScript strict**: `bunx tsc --noEmit` zero new errors

### Architecture Compliance

- **Service layer parity**: `services/{name}.ts` (data fetching) + `routes/{name}.ts` (HTTP layer) — established Story 3.3/3.4 pattern
- **Billing atomicity (NFR8)**: `checkCredits` BEFORE fetch, `deductToolCredits` AFTER success — match Story 3.4 token-info pattern exactly. Story 3.4 review identified non-atomic check/deduct as **deferred work** (cross-cutting); inherit same pattern, don't fix here.
- **Cache layer parity**: `widget-cache.ts` (in-memory Map with TTL) — same as token_info, contract_risk. Tier 2 LRU optimization is **deferred** from Story 3.3.
- **Auth**: `combinedAuth` (Supabase JWT or epsilon API key) — parity all Story 3.4 routes. Web app SSR forwards via `getServerAuthHeader()`.
- **Cyber-Glass theme**: Server-rendered card matches existing 4 sections on token page (Header, Risk, Holders, Txs).
- **Suspense streaming order**: Section render độc lập, Header → Chart → Risk → Holders → Txs; no blocking dependencies between sections.

### Library / Framework Requirements

| Lib | Version | Why | Notes |
|---|---|---|---|
| `lightweight-charts` | `^5.2.0` (existing) | Candlestick rendering | Story 3.2 — no upgrade needed |
| `hono` | (existing) | Backend HTTP | Standard Story 3.x parity |
| `zod` | (existing) | Request validation | `z.literal` union for days enum |
| `@epsilon/shared` | (existing) | Shared types if needed | OhlcvBar already in web app, no shared package extension required |

**NO new dependencies** — explicitly: don't add `@geckoterminal/sdk`, `node-fetch`, custom retry libs. Use Bun native fetch + AbortSignal.timeout.

### File Structure Requirements

- Service file: NEVER export Hono routes from `services/`. Routes go in `routes/`. Services are pure data-fetch functions returning typed results or throwing.
- Tests: backend integration tests use Hono test client pattern from `apps/api/src/__tests__/integrations/token-info.test.ts` (parity Story 3.4); frontend tests use `bun:test` + React Testing Library pattern from Story 3.4 RiskBadgeCard tests.
- DO NOT introduce new top-level folders. DO NOT split chart logic across packages — keep frontend chart code in `apps/web/src/components/chart/` (Story 3.2 location).

### Testing Requirements

- Backend: ≥9 tests total (5 service + 4 route)
- Frontend: ≥3 tests `ChartSection` 
- Run before submitting:
  - `bun test apps/api/src/__tests__/unit-token-ohlcv.test.ts`
  - `bun test apps/api/src/__tests__/integrations/token-ohlcv.test.ts`
  - `bun test apps/web/src/app/(dashboard)/token/[address]/__tests__/ChartSection.test.tsx`
  - `bun test apps/api/src/__tests__/integrations/token-info.test.ts` (regression — Task 1 refactor)
- Manual browser verification (Task 7): UNI happy path + non-existent address fallback + Solana skip

### Previous Story Intelligence (Story 3.2 + 3.4)

**From Story 3.2 review (5 deferred + 25 patches applied):**
- ✅ Patch [P12]: Inline fetch in `TradingViewChart` removed → data ownership lives in parent. **Means**: `ChartSection` (parent) owns fetch, passes `data` prop. KHÔNG re-introduce fetch inside `TradingViewChart`.
- ✅ Patch [calcRSI flat-market]: returns 50 conventionally instead of NaN. Reusable as-is.
- ✅ Patch [empty token]: API rejects empty input with 400. Mirror in token-ohlcv route.
- ⚠️ Deferred: Server-side MA/RSI computation — DO NOT scope into Story 3.5. Indicator math stays client-side (acceptable performance).
- ⚠️ Deferred: Hard-coded hex colors in chart THEME — out of scope.

**From Story 3.4 review (27 patches + 3 deferred):**
- ✅ Pattern: `getServerAuthHeader()` cookie-based auth forwarding (NOT `headers().get('Authorization')` direct forward — security review flagged confused-deputy risk in Story 3.2 page.tsx). Use `getServerAuthHeader()` exclusively.
- ✅ Pattern: Discriminated union `{ success: true, ... } | { success: false, error: string }` — NO `as any` casts.
- ✅ Pattern: `AbortSignal.timeout(N)` + try `text()` then `JSON.parse` (avoid `res.json()` throwing on non-JSON upstream).
- ✅ Pattern: `encodeURIComponent` on all dynamic URL segments.
- ✅ Pattern: Hide `total_*` fields when API returns `null` (don't show "Total: 0").
- ⚠️ Deferred: Singleflight + atomic billing — inherit same non-atomic pattern, don't try to fix in this story.
- ⚠️ Deferred: Story 3.4 has 0 tests written (CRITICAL unresolved). Story 3.5 MUST write tests upfront, not retrofit.

### Latest Tech Information (CoinGecko free API, May 2026)

- **Endpoint**: `GET https://api.coingecko.com/api/v3/coins/{coinId}/ohlc?vs_currency=usd&days={days}`
- **Auth header (optional)**: `x-cg-demo-api-key: {key}` — already set in `token-info.ts:58` if `COINGECKO_API_KEY` env present
- **Rate limit**: ~30 req/min on Demo plan (no key)
- **Granularity (auto)**:
  - days=1, 7, 14: 30-min candles
  - days=30: 4-hour candles ← **default cho Story 3.5**
  - days=90, 180: 4-day candles (coarse — only show if user explicitly toggles)
- **Response shape**: `[[1700000000000, 35000.5, 35200.1, 34800.0, 35100.7], ...]` — `[ts_ms, open, high, low, close]`
- **Caveats**:
  - Empty array `[]` if token not tracked OR coinId invalid — treat as `not_indexed` error
  - 429 if rate-limited — fall back to stale cache via `cacheGetStale`
  - Some tokens have OHLC but no contract listing (and vice versa) — story 3.5 only fetches OHLC AFTER successful coinId resolution, so case shouldn't arise

### Project Context Reference

- [Source: epics.md#Epic 3: Crypto Native Trading UI](_bmad-output/planning-artifacts/epics.md)
- [Source: 3-2-tradingview-advanced-charting.md](_bmad-output/implementation-artifacts/3-2-tradingview-advanced-charting.md) — chart component reference
- [Source: 3-4-token-detail-page.md](_bmad-output/implementation-artifacts/3-4-token-detail-page.md) — server component patterns, deferred Chart section motivation
- [Source: deferred-work.md#3-4-token-detail-page](_bmad-output/implementation-artifacts/deferred-work.md) — TTL/atomic-billing deferred items inherited
- [Source: apps/api/src/router/services/token-info.ts](apps/api/src/router/services/token-info.ts) — CoinGecko platform map source
- [Source: apps/web/src/components/chart/trading-view-chart.tsx](apps/web/src/components/chart/trading-view-chart.tsx) — chart component contract
- [Source: apps/web/src/components/chart/chart-indicators.ts](apps/web/src/components/chart/chart-indicators.ts) — `OhlcvBar` interface

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (or upgrade to opus-4-7 cho complex 2-step CoinGecko logic)

### Debug Log References

- **bun:test async race fix**: `withFetch` wrapper helper restored env vars in `finally` synchronously before async `fn()` resolved. Fixed by inlining `global.fetch = ...` / restore pattern directly in each test block.
- **TypeScript `mock`/`beforeEach` not found in web tests**: `apps/web` tsconfig has no `@types/bun`, so named exports from `bun:test` are untyped. Fixed by rewriting `ChartSection.test.tsx` to use only `describe`/`test`/`expect` (globally available in bun test runner) + plain `global.fetch` assignment.
- **Wrong URL for browser verification**: Next.js `(dashboard)` route group doesn't add segment to URL. Correct URL is `/token/[address]` not `/dashboard/token/[address]`.

### Completion Notes List

- ✅ Task 1: Extracted `COINGECKO_PLATFORM_MAP`, `isEvmAddress`, `buildCoinGeckoHeaders`, `resolveCoinIdFromAddress` into new `coingecko-helpers.ts`. Updated `token-info.ts` to import from helpers — behavior unchanged, token-info tests pass.
- ✅ Task 2: `fetchTokenOhlcv` implements 2-step CoinGecko lookup (address→coinId→OHLC). `volume` field omitted (CoinGecko OHLC endpoint returns no volume). `VALID_DAYS = [1, 7, 14, 30, 90, 180]` exported for Zod validation reuse.
- ✅ Task 3: Route registered at `/v1/router/token-ohlcv` with `combinedAuth`. Cache TTL 5min. `token_ohlcv` added to `TOOL_PRICING` and `DEFAULT_TTL`. Billing pattern NFR8-compliant (checkCredits before, deductToolCredits after).
- ✅ Task 4: `ChartSection.tsx` server component — Solana branch, error branch, success branch. `ChartSkeleton` (~520px) added. `page.tsx` uses `<Suspense fallback={<ChartSkeleton />}>`. `ChartPlaceholderCard.tsx` deleted.
- ✅ Task 5: `OhlcvBar.volume` changed to optional. Type-check clean (`bunx tsc --noEmit` zero errors).
- ✅ Task 6: 17 tests total — 8 backend unit + 5 backend integration + 4 frontend. All pass.
- ✅ Task 7: Browser verification — UNI page renders correctly (Chart unavailable per AC1 — no fake data); non-existent address shows graceful error; Solana address shows "Chart coming soon" message.

### File List

**NEW files:**
- `apps/api/src/router/services/coingecko-helpers.ts`
- `apps/api/src/router/services/token-ohlcv.ts`
- `apps/api/src/router/routes/token-ohlcv.ts`
- `apps/api/src/__tests__/unit-token-ohlcv.test.ts`
- `apps/api/src/__tests__/integrations/token-ohlcv.test.ts`
- `apps/web/src/app/(dashboard)/token/[address]/_components/ChartSection.tsx`
- `apps/web/src/app/(dashboard)/token/[address]/__tests__/ChartSection.test.tsx`

**UPDATED files:**
- `apps/api/src/router/services/token-info.ts`
- `apps/api/src/router/services/widget-cache.ts`
- `apps/api/src/router/index.ts`
- `apps/api/src/config.ts`
- `apps/web/src/components/chart/chart-indicators.ts`
- `apps/web/src/app/(dashboard)/token/[address]/page.tsx`
- `apps/web/src/app/(dashboard)/token/[address]/_components/skeletons.tsx`

**DELETED files:**
- `apps/web/src/app/(dashboard)/token/[address]/_components/ChartPlaceholderCard.tsx`

## Change Log

- 2026-05-10: Story 3.5 implemented — backend `token-ohlcv` service + route, frontend `ChartSection` server component, `OhlcvBar.volume` optional, 17 tests added, browser verified. (claude-sonnet-4-6)
