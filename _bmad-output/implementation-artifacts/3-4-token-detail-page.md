# Story 3.4: Token Detail Page — Canonical `/dashboard/token/[address]`

Status: in-progress

<!-- Spec'd 2026-05-10. Verified against actual codebase via MCP trio (Serena + SymDex + CRG)
     and validated by independent reviewer 2026-05-10. All 7 CRITICAL findings from validator
     resolved before this version. See "Spec Revision Notes" at end of file. -->

## Story

As a crypto user click vào một token (từ browser extension Story 6.x, dashboard Story 3.1, hoặc URL trực tiếp),
I want xem một trang detail tổng hợp price + risk analysis + top holders + recent transactions tại canonical URL `/dashboard/token/[address]`,
so that tôi có view toàn diện về token tại 1 URL ổn định mà extension có thể link tới, server-streamed từng section độc lập (Suspense), 404 inline (cùng page) thân thiện cho address invalid (gợi ý token gần giống).

## Acceptance Criteria

1. **AC1 — Canonical route `(dashboard)/token/[address]` render server-side với 4 sections (Suspense streaming):**
   - **Given** user navigate đến `/dashboard/token/[address]` (nested trong `(dashboard)` group → auth-gated parity với chart + markets routes; Story 6.x extension deep-link qua auth flow nếu user chưa login).
   - **When** Next.js 15 App Router server component render với address param (EVM `0x[a-fA-F0-9]{40}` hoặc Solana base58).
   - **Then** page render 4 sections theo thứ tự: **Header** (symbol, name, price, market cap, 24h change), **Risk Analysis** (Risk Badge từ Story 3.3 — standalone component), **Top Holders** (table top 20 EVM holders với balance + %), **Recent Transactions** (list 50 most recent ERC-20 transfers).
   - **And** mỗi section là async server component riêng, wrap trong `<Suspense fallback={<SectionSkeleton />}>` — sections render độc lập, không block lẫn nhau (parity với existing chart route at `apps/web/src/app/(dashboard)/chart/[token]/page.tsx`).
   - **And** layout container theme parity với `markets-client.tsx`: `container max-w-6xl py-8 space-y-6` + Cyber-Glass cards (`border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl`).
   - **And** **Chart section là DEFERRED** — render "Chart coming soon" placeholder card với link tới existing `/dashboard/chart/[symbol]` route (Story 3.2) khi user click. Lý do: existing OHLCV endpoint (`/v1/market/ohlcv/*`) hardcode mock data cho 10 known symbols, không phù hợp cho arbitrary token addresses. Real OHLCV provider integration là Story 3.4.5 / 4.x scope.
   - **And** **Header behavior cho unindexed tokens**: nếu CoinGecko không có entry cho address (token chưa list), Header render fallback: address shortened (0x1234…abcd) + chain badge + "Listing pending" placeholder thay cho symbol/name/price; KHÔNG crash, KHÔNG hide section. Risk + Holders + Transactions sections vẫn render normally (không phụ thuộc CoinGecko).

2. **AC2 — Backend services + routes cho Holders, Transactions, Search:**
   - **Given** spec yêu cầu 3 data sections cần backend mới (token-info + contract-risk đã có từ Story 3.3).
   - **When** Story 3.4 implement.
   - **Then** 3 services mới ở `apps/api/src/router/services/`:
     - `token-holders.ts` → `fetchTokenHolders(address, chain, options)`: gọi **Moralis Web3 Data API** `/erc20/{address}/owners` (free tier 25k req/day, multi-chain native: ethereum/arbitrum/base/polygon/bsc/avalanche/optimism). Return `{ holders: Array<{ address, balance: string, percentage: number, rank: number }>, total_holders: number, chain, address, checked_at, source: 'moralis' }`. KHÔNG dùng Etherscan `tokenholderlist` — endpoint đó là PRO-only (verified May 2026).
     - `token-transactions.ts` → `fetchTokenTransactions(address, chain, options)`: gọi **Etherscan family** `?module=account&action=tokentx` (endpoint NÀY có trên free tier, 5 cps / 10k day). Multi-chain mapping: `ethereum→api.etherscan.io`, `arbitrum→api.arbiscan.io`, `base→api.basescan.org`, `polygon→api.polygonscan.com`. Return `{ transactions: Array<{ hash, from, to, value: string, value_decimal: number, timestamp, block_number, gas_used, type: 'transfer' }>, chain, address, checked_at, source }`. Chỉ `'transfer'` ở MVP (decode swap/mint/burn defer post-MVP).
     - `token-search.ts` → `searchTokens(query, options)`: gọi CoinGecko `/search?query={q}` (free tier). Return top 5 `{ id, name, symbol, image_url, market_cap_rank }`.
   - **And** 3 Hono routes ở `apps/api/src/router/routes/`: `token-holders.ts`, `token-transactions.ts`, `token-search.ts`. Pattern parity với `token-info.ts` từ Story 3.3 post-patches (atomic billing với `await deductToolCredits`, widget-cache TTL fallback, `stale: false` khi no data exists, session_id charset/length validation).
   - **And** **Auth strategy**: 3 routes mới + existing `contract-risk` route + `token-info` route SWITCH sang `combinedAuth` thay vì `apiKeyAuth`. Lý do: routes này được consumed bởi cả OpenCode tools (epsilon_* token) lẫn SSR pages (Supabase JWT forwarded từ incoming request). `combinedAuth` accept cả 2; OK cho read-only data routes có billing. Update `apps/api/src/router/index.ts`:
     ```ts
     // Old: router.use('/token-info/*', apiKeyAuth);
     router.use('/token-info/*', combinedAuth);
     router.use('/contract-risk/*', combinedAuth);
     router.use('/tx-simulator/*', combinedAuth);  // tx-simulator vẫn cần auth (billing $0.50/call)
     router.use('/token-holders/*', combinedAuth);
     router.use('/token-transactions/*', combinedAuth);
     router.use('/token-search/*', combinedAuth);
     ```
     Story 3.3 OpenCode tools KHÔNG bị break — tools vẫn pass `Authorization: Bearer epsilon_*` header, `combinedAuth` accept cả epsilon_ prefix lẫn Supabase JWT. Run Story 3.3 tests để confirm no regression.

3. **AC3 — Standalone `<RiskBadgeCard>` reusable component (refactor từ Story 3.3):**
   - **Given** `OcContractRiskToolView` hiện chỉ dùng được trong chat thread context (cần `toolCall + toolResult` props).
   - **When** Story 3.4 cần render risk trên page detail (không qua thread).
   - **Then** extract presentation logic thành `apps/web/src/components/widgets/RiskBadgeCard.tsx`:
     - Props: `{ data: ContractRiskResult; isLoading?: boolean; errorMessage?: string }` — KHÔNG còn `toolCall`/`toolResult` shape
     - Export `RiskBadgeCard` (presentation only, không tự fetch)
     - Reuse helpers: `riskColorClass`, `severityColorClass`, `severityDescription`, `relativeTimeFrom`, `shortAddr` từ `OcContractRiskToolView.tsx` — dedupe bằng cách extract sang `apps/web/src/components/widgets/risk-badge-utils.ts`. Story 3.3 test file (`OcContractRiskToolView.test.ts`) test against `riskColorClass` + `shortAddr` — KEEP signatures identical để tests pass without modification.
   - **And** refactor `OcContractRiskToolView.tsx` để render `<RiskBadgeCard>` internally (parse `toolResult.output` → call `<RiskBadgeCard data={parsed} />`). Giữ public API + tests xanh — không breaking change cho ToolRegistry. Run `bun test apps/web/src/components/thread/tool-views/opencode/__tests__/OcContractRiskToolView.test.ts` sau refactor — fail = block merge.
   - **And** Token Detail Page Risk section fetch `/v1/router/contract-risk` server-side với address + chain (qua `combinedAuth`, forward Supabase JWT từ incoming request), pass result vào `<RiskBadgeCard>`. Stale flag và error path render đúng.

4. **AC4 — Address validation, multi-chain support, normalization (shared package):**
   - **Given** address param có thể là EVM (40 hex) hoặc Solana base58.
   - **When** page load.
   - **Then** validate ở route layer (server component) trước khi fetch:
     - EVM: regex `/^0x[a-fA-F0-9]{40}$/` → lowercase normalize trước cache key
     - Solana: regex `/^[1-9A-HJ-NP-Za-km-z]{32,44}$/` → preserve case (parity Story 3.3 contract-risk)
     - Invalid → trigger inline 404 UI render trong page.tsx (KHÔNG dùng `notFound()` + `not-found.tsx` — Next.js 15 not-found component không nhận `params` props, làm fuzzy-match impossible)
   - **And** chain detection dựa trên address format: EVM → default `ethereum` (user có thể override qua `?chain=arbitrum|base|polygon` query param), Solana → `solana`.
   - **And** Holders + Transactions services CHỈ support EVM ở MVP (Moralis hỗ trợ Solana ở paid tier, defer). Cho Solana, render section với "Top Holders coming soon — Solana support requires paid tier (planned post-MVP)" message — KHÔNG crash, KHÔNG empty table.
   - **And** **Address utils dùng REAL shared package** (không duplicate cross-app):
     - Tạo `packages/shared/src/address.ts` (NEW file trong existing package):
       ```ts
       export const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
       export const SOL_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
       export const ALLOWED_EVM_CHAINS = ['ethereum', 'arbitrum', 'base', 'polygon', 'bsc', 'avalanche', 'optimism'] as const;
       export type EvmChain = typeof ALLOWED_EVM_CHAINS[number];
       export function detectChain(address: string): 'evm' | 'solana' | 'unknown';
       export function normalizeAddress(address: string, chain: string): string;
       ```
     - Both `apps/api` và `apps/web` import từ `@chainlens/shared/address` (hoặc whatever existing import alias dùng cho `packages/shared`).
     - Refactor existing `apps/api/src/router/routes/contract-risk.ts` + `tx-simulator.ts` + `services/contract-risk.ts` để dùng shared helper (eliminate inline regex duplication).
     - **DON'T touch `apps/api/src/router/routes/jit-sync.ts`** — file đó dùng regex `/^0x[a-f0-9]{40}$/` (lowercase-only, KHÔNG có `A-F`) intentionally vì input đã được lowercased upstream. Refactor sang shared regex sẽ change semantics (allow uppercase). Document trong Dev Notes.
   - **And** Story 3.3 tests phải vẫn pass sau refactor.

5. **AC5 — Inline 404 UI với fuzzy match suggestions (NO `not-found.tsx`):**
   - **Given** address không hợp lệ hoặc token không tồn tại.
   - **When** validation trong page.tsx fail (regex không match cả EVM lẫn Solana).
   - **Then** page.tsx render TokenNotFound UI inline (cùng component file hoặc `_components/TokenNotFound.tsx`) thay vì call `notFound()`:
     - Header: "Token not found"
     - Body: nếu raw param có thể là search term (length 1-30, alphanumeric), gọi `/v1/router/token-search?q={raw}` SERVER-SIDE (page.tsx async function có sẵn) → render top 5 suggestions với `<Link href="/dashboard/token/${result.id}">` và avatar image
     - Empty fallback: hiển thị link tới `/dashboard/markets` ("Browse all tokens")
     - Suggestions fetched server-side với 1s timeout — render trong same page response, KHÔNG flash empty
   - **And** Page metadata cho TokenNotFound case: `<title>Token not found — Chainlens</title>` + `<meta name="robots" content="noindex">` (SEO hygiene). Achieved qua conditional `generateMetadata` returning different metadata khi address invalid.

6. **AC6 — Browser extension canonical URL alignment (Story 6.x prep):**
   - **Given** browser extension `apps/extension/src/content/index.ts:164` hiện hardcode `https://app.chainlens.com/analyze?token=${token}`.
   - **When** Story 3.4 deploy.
   - **Then** update extension content script để dùng canonical: `https://app.chainlens.com/dashboard/token/${address}` (parity với new auth-gated route).
   - **And** add metadata cho route — `apps/web/src/app/(dashboard)/token/[address]/page.tsx` export:
     ```ts
     export async function generateMetadata({ params }) {
       const { address } = await params;
       // Best-effort fetch token-info; fallback to address-only on any error
       try {
         const info = await fetchTokenInfo(address);
         return {
           title: `${info.symbol} ${info.name} — Chainlens`,
           description: `Live price, risk analysis, holders, and transactions for ${info.name}`,
           alternates: { canonical: `https://app.chainlens.com/dashboard/token/${address}` },
           openGraph: { title: ..., description: ..., url: ... },
         };
       } catch {
         return {
           title: `${address.slice(0,10)}… — Chainlens`,
           alternates: { canonical: `https://app.chainlens.com/dashboard/token/${address}` },
         };
       }
     }
     ```
   - **And** add `getCanonicalBaseUrl()` helper trong `apps/extension/src/lib/canonical.ts`:
     - Return `process.env.CHAINLENS_BASE_URL ?? 'https://app.chainlens.com'`
   - **Lưu ý**: Story 6.x sẽ test full extension flow — Task 5 chỉ là URL alignment prep, không test extension end-to-end ở Story 3.4.

## Tasks / Subtasks

### Task 1 — Shared Package + Backend Service Layer (AC2/AC4)

- [ ] Create `packages/shared/src/address.ts` (NEW file in existing package):
  - Export `EVM_ADDRESS`, `SOL_ADDRESS` regex constants
  - Export `ALLOWED_EVM_CHAINS` const array + `EvmChain` type
  - Export `detectChain(address: string): 'evm' | 'solana' | 'unknown'`
  - Export `normalizeAddress(address: string, chain: string): string` — lowercase EVM, preserve Solana
- [ ] Update `packages/shared/src/index.ts` to re-export new module
- [ ] Refactor existing `apps/api/src/router/routes/contract-risk.ts` + `tx-simulator.ts` + `services/contract-risk.ts` to import from shared package (remove inline regex)
- [ ] **DO NOT** refactor `apps/api/src/router/routes/jit-sync.ts` — uses lowercase-only regex intentionally; document rationale as inline comment when reviewing
- [ ] Create `apps/api/src/router/services/token-holders.ts`:
  - Import `MORALIS_API_KEY` from `config` (add to envSchema as `optStr`)
  - Multi-chain mapping: chain → moralis chain identifier
    - `ethereum` → `eth`, `arbitrum` → `arbitrum`, `base` → `base`, `polygon` → `polygon`, `bsc` → `bsc`, `avalanche` → `avalanche`, `optimism` → `optimism`
    - `solana` → throw `new Error('Solana token holders require paid tier (planned post-MVP)')`
  - Endpoint: `GET https://deep-index.moralis.io/api/v2.2/erc20/{address}/owners?chain={chain}&limit={limit}` với header `X-API-Key: ${MORALIS_API_KEY}`
  - `AbortSignal.timeout(2500)` (2.5s)
  - Parse Moralis response shape `{ result: [{ owner_address, balance, balance_formatted, percentage_relative_to_total_supply }] }`
  - Return `{ holders: HolderEntry[], total_holders: number | null, chain, address, checked_at: ISO, source: 'moralis' }`
- [ ] Create `apps/api/src/router/services/token-transactions.ts`:
  - Multi-chain Etherscan family (free tier supports `tokentx`):
    - `ethereum` → `https://api.etherscan.io`, `arbitrum` → `https://api.arbiscan.io`, `base` → `https://api.basescan.org`, `polygon` → `https://api.polygonscan.com`
  - API key resolution: `config.ETHERSCAN_API_KEY` default, optional per-chain override (`ARBISCAN_API_KEY`, `BASESCAN_API_KEY`, `POLYGONSCAN_API_KEY`)
  - Endpoint: `?module=account&action=tokentx&contractaddress={addr}&page=1&offset=50&sort=desc&apikey={key}`
  - Solana → throw same "post-MVP" error
  - `AbortSignal.timeout(2000)` (2s)
  - Return `{ transactions: TransactionEntry[], chain, address, checked_at, source: 'etherscan' | 'arbiscan' | ... }`
- [ ] Create `apps/api/src/router/services/token-search.ts`:
  - Gọi CoinGecko `/search?query={q}` (free; rate limit dùng `COINGECKO_API_KEY` demo key nếu có)
  - Return top 5 results
  - `AbortSignal.timeout(800)` (0.8s — search phải fast)
  - Return `{ results: SearchResult[], query, source: 'coingecko' }`

### Task 2 — Backend Routes (AC2)

- [ ] Update `apps/api/src/router/index.ts`:
  - **Switch existing `apiKeyAuth` → `combinedAuth`** for: `/token-info/*`, `/contract-risk/*`, `/tx-simulator/*` (Story 3.3 routes — they need to be SSR-callable too)
  - Register 3 new routes with `combinedAuth`: `/token-holders/*`, `/token-transactions/*`, `/token-search/*`
  - Run Story 3.3 tests after switch — confirm no regression (`combinedAuth` accepts epsilon_* tokens fine)
- [ ] Create `apps/api/src/router/routes/token-holders.ts` (Hono):
  - Pattern parity với Story 3.3 `token-info.ts` post-patches:
    - Import `EVM_ADDRESS`, `SOL_ADDRESS`, `ALLOWED_EVM_CHAINS` from `@chainlens/shared/address`
    - Zod schema:
      ```ts
      const SESSION_ID = z.string().max(128).regex(/^[A-Za-z0-9_-]+$/).optional();
      const TokenHoldersRequestSchema = z.object({
        address: z.string().min(1).max(255),
        chain: z.enum([...ALLOWED_EVM_CHAINS, 'solana']).default('ethereum'),
        limit: z.number().min(1).max(100).optional().default(20),
        session_id: SESSION_ID,
      });
      ```
    - Validate address format theo chain
    - `checkCredits(accountId)` ATOMIC trước fetch
    - `widget-cache` với TTL 24h (holders thay đổi chậm) — `cacheGet` fresh → return; miss → live fetch → `cacheSet`; live fail → `cacheGetStale` fallback; stale miss → `{ success: false, stale: false, error }` (parity Story 3.3 patches)
    - `await deductToolCredits` trước response (atomic billing parity)
    - Response: `{ success: true, stale, cache_status, cost, ...snapshot }`
- [ ] Create `apps/api/src/router/routes/token-transactions.ts`:
  - Same pattern, TTL 5 minutes (transactions are current)
- [ ] Create `apps/api/src/router/routes/token-search.ts`:
  - GET endpoint (search là idempotent)
  - Query param `?q={search}`
  - TTL 1 hour (search results stable)
  - Lower bill (search rẻ — chỉ proxy CoinGecko)
- [ ] Update `apps/api/src/config.ts`:
  - Add to envSchema: `MORALIS_API_KEY: optStr`, `ETHERSCAN_API_KEY: optStr`, `ARBISCAN_API_KEY: optStr`, `BASESCAN_API_KEY: optStr`, `POLYGONSCAN_API_KEY: optStr`
  - Add to TOOL_PRICING:
    ```ts
    token_holders: { baseCost: 0.15, perResultCost: 0, markupMultiplier: 1.0 },
    token_transactions: { baseCost: 0.12, perResultCost: 0, markupMultiplier: 1.0 },
    token_search: { baseCost: 0.02, perResultCost: 0, markupMultiplier: 1.0 },
    ```

### Task 3 — RiskBadgeCard refactor (AC3)

- [ ] Create `apps/web/src/components/widgets/risk-badge-utils.ts`:
  - Move `riskColorClass`, `severityColorClass`, `severityDescription`, `relativeTimeFrom`, `shortAddr` từ `OcContractRiskToolView.tsx` (KEEP function signatures IDENTICAL — Story 3.3 tests `OcContractRiskToolView.test.ts` test against these)
  - Export type `RiskLevel`, `RiskFactor`, `ContractRiskResult` (move from inline interfaces)
- [ ] Create `apps/web/src/components/widgets/RiskBadgeCard.tsx`:
  - Props: `{ data: ContractRiskResult | null; isLoading?: boolean; errorMessage?: string }`
  - Render Cyber-Glass Card với risk level badge (color-coded), score, address shortened, chain badge, top 3 factors với severity tooltips, sources footer + relative timestamp
  - Stale "⚠️ Cached" badge khi `data.stale === true`
  - Loading state: skeleton placeholders
  - Error state: "Risk check unavailable" + errorMessage
- [ ] Refactor `apps/web/src/components/thread/tool-views/opencode/OcContractRiskToolView.tsx`:
  - Remove inline helpers — import from `risk-badge-utils.ts`
  - Render body delegates to `<RiskBadgeCard data={parsed} errorMessage={isError ? parsed?.error : undefined} />`
  - Keep `parseOutput` + `isError` logic + ToolViewIconTitle/ToolViewFooter wrapper (those are thread-specific)
  - **Mandatory test stability check**: run `bun test apps/web/src/components/thread/tool-views/opencode/__tests__/OcContractRiskToolView.test.ts` — all 7 tests MUST stay green. Failure = block merge. Story 3.3 tests are pure-function tests on `riskColorClass` + `shortAddr` so they survive refactor IF helpers are exported with identical signatures.

### Task 4 — Frontend Token Detail Page (AC1/AC4/AC5/AC6)

- [ ] Create directory `apps/web/src/app/(dashboard)/token/[address]/`:
  - `page.tsx` — server component, root page
  - `loading.tsx` — fallback for initial render
  - `_components/` — internal section components (folder prefix `_` excludes from routing)
- [ ] Implement `page.tsx`:
  - Server component: `export default async function TokenDetailPage({ params, searchParams }: { params: Promise<{ address: string }>; searchParams: Promise<{ chain?: string }> })`
  - **Validation logic at top**:
    ```ts
    const { address: raw } = await params;
    const { chain: chainParam } = await searchParams;
    const detected = detectChain(raw);
    if (detected === 'unknown') {
      // Render inline 404 UI with fuzzy-match (AC5) — DO NOT call notFound()
      const suggestions = await searchTokensServerSide(raw); // 1s timeout, fallback []
      return <TokenNotFound rawQuery={raw} suggestions={suggestions} />;
    }
    const chain = chainParam ?? (detected === 'evm' ? 'ethereum' : 'solana');
    const address = normalizeAddress(raw, chain);
    ```
  - Layout container: `<div className="container max-w-6xl py-8 space-y-6">` (parity với chart route)
  - Render 4 sections wrap `<Suspense>` (Chart deferred — see ChartPlaceholderCard):
    ```tsx
    <Suspense fallback={<HeaderSkeleton />}><HeaderSection address={address} chain={chain} /></Suspense>
    <ChartPlaceholderCard symbol={null} />  {/* render synchronously, no Suspense */}
    <Suspense fallback={<RiskSkeleton />}><RiskSection address={address} chain={chain} /></Suspense>
    <Suspense fallback={<HoldersSkeleton />}><HoldersSection address={address} chain={chain} /></Suspense>
    <Suspense fallback={<TxsSkeleton />}><TxsSection address={address} chain={chain} /></Suspense>
    ```
  - Export `generateMetadata({ params })` — try-catch fetch token-info; fallback address-only on error (KHÔNG block page render trên metadata error)
- [ ] Implement section components in `_components/` (mỗi section là async server component):
  - `HeaderSection.tsx` (server): fetch `/v1/router/token-info` (forward `Authorization` header from incoming request, parity chart route pattern). If fetch returns `success: false` (CoinGecko không có entry), render fallback UI: `address shortened + chain badge + "Listing pending"`. Set `next: { revalidate: 60 }` cho fetch.
  - `ChartPlaceholderCard.tsx` (server): render Cyber-Glass card với "Chart coming soon" message + "View existing chart for known tokens →" link to `/dashboard/chart/[symbol]` (parity với markets-client.tsx link pattern). NO fetch, no Suspense needed.
  - `RiskSection.tsx`: server fetches `/v1/router/contract-risk` với address + chain (auth via combinedAuth, forward Supabase JWT). Pass result vào `<RiskBadgeCard>` (Client Component — tooltips need `'use client'`). `next: { revalidate: 30 }` (risk has 5min upstream TTL via widget-cache).
  - `HoldersSection.tsx` (server): fetch `/v1/router/token-holders`, render table (top 20) với Tailwind table classes. Solana → render "Top Holders coming soon (Solana support is post-MVP)" message. `next: { revalidate: 600 }` (10 min — holders change slowly).
  - `TxsSection.tsx` (server): fetch `/v1/router/token-transactions`, render list 50 items với hash linkified (`https://etherscan.io/tx/{hash}` or chain-equivalent), from/to shortened, value formatted, relative timestamp. `next: { revalidate: 30 }` (transactions are current).
- [ ] Implement `_components/TokenNotFound.tsx`:
  - Props: `{ rawQuery: string; suggestions: SearchResult[] }`
  - Render "Token not found" header + suggestions list (top 5 với CoinGecko thumbnails) + fallback link tới `/dashboard/markets`
- [ ] Implement skeletons in `_components/skeletons.tsx`:
  - `HeaderSkeleton`, `RiskSkeleton`, `HoldersSkeleton`, `TxsSkeleton` — dùng existing `<Skeleton>` từ `apps/web/src/components/ui/skeleton.tsx`
- [ ] Update `apps/web/next.config.js`:
  - Add to `images.remotePatterns`:
    ```js
    { protocol: 'https', hostname: 'coin-images.coingecko.com' },
    { protocol: 'https', hostname: 'assets.coingecko.com' },
    ```
  - Required cho `<Image>` từ Next.js render CoinGecko thumbnails trong TokenNotFound

### Task 5 — Browser Extension Update (AC6)

- [ ] Update `apps/extension/src/content/index.ts:164`:
  - Replace hardcoded `https://app.chainlens.com/analyze?token=${token}` với `${getCanonicalBaseUrl()}/dashboard/token/${address}`
- [ ] Add `apps/extension/src/lib/canonical.ts`:
  - Export `getCanonicalBaseUrl(): string` — Return `process.env.CHAINLENS_BASE_URL ?? 'https://app.chainlens.com'`
- [ ] Update extension manifest `host_permissions` nếu cần (verify `https://app.chainlens.com/dashboard/*` được include)
- **Lưu ý**: Story 6.x sẽ test full extension flow — Task 5 chỉ là URL alignment prep.

### Task 6 — Tests

- [ ] Backend unit tests (Bun test, parity với Story 3.3 location):
  - `apps/api/src/__tests__/unit/token-holders-service.test.ts` — mock fetch, test happy/error/Solana-not-supported paths (≥4 tests)
  - `apps/api/src/__tests__/unit/token-transactions-service.test.ts` — same coverage (≥4 tests)
  - `apps/api/src/__tests__/unit/token-search-service.test.ts` — happy + error + empty results (≥3 tests)
  - `apps/api/src/__tests__/unit/token-holders-route.test.ts` — Hono `app.request()` HTTP-level tests, parity với `token-info-route.test.ts` (≥4 tests: 200 success, 200 success=false stale-fallback (`stale: false`), 400 invalid address/chain, 402 insufficient credits)
  - `apps/api/src/__tests__/unit/address-utils.test.ts` (in `packages/shared` test location) — `detectChain`, `normalizeAddress`, regex tests (≥6 tests)
  - **Add suspense ordering test (NEW, prevent regression)**: mock `fetchTokenHolders` to delay 3s, `fetchTokenInfo` to resolve 100ms, assert Header section renders BEFORE Holders in stream output. Place at `apps/web/src/app/(dashboard)/token/[address]/__tests__/streaming.test.tsx` — if Bun cannot render Suspense streams reliably, document as deferred + use Playwright in Story 3.4.5.
- [ ] Frontend unit tests (Bun test):
  - `apps/web/src/components/widgets/__tests__/RiskBadgeCard.test.ts` — pure-function tests on extracted helpers (parity Story 3.3 `agentNameToTier` pattern). Test `riskColorClass`, `severityColorClass`, `severityDescription`, `relativeTimeFrom`, `shortAddr`. ≥6 tests.
  - `apps/web/src/lib/__tests__/address.test.ts` — verify shared package import works from web app + smoke test `detectChain` + `normalizeAddress` (≥4 tests)
- [ ] Type-check: `bunx tsc --noEmit` — KHÔNG được introduce new errors trong files đã đụng. Pre-existing errors trong unrelated files (e.g., `fumadocs-mdx`, `jit-cache.test.ts` import path) acceptable.
- [ ] **Story 3.3 regression check**: run `bun test apps/web/src/components/thread/tool-views/opencode/__tests__/OcContractRiskToolView.test.ts` + all backend Story 3.3 tests AFTER Task 3 RiskBadgeCard refactor + AFTER Task 2 combinedAuth switch. All 55 Story 3.3 tests MUST remain green. Block merge if any fail.

### Task 7 — Documentation + Configuration

- [ ] Update `apps/api/.env.example`:
  - Add `MORALIS_API_KEY=` (commented placeholder, link to docs.moralis.io)
  - Add `ETHERSCAN_API_KEY=`, `ARBISCAN_API_KEY=`, `BASESCAN_API_KEY=`, `POLYGONSCAN_API_KEY=` placeholders
- [ ] Update `apps/api/.env`:
  - Add empty values (KHÔNG commit real keys)
- [ ] Update Story 3.3 `_bmad-output/implementation-artifacts/3-3-generative-ai-chat-widgets.md`:
  - Note tại Change Log: "RiskBadgeCard extraction in Story 3.4 enables standalone use beyond chat thread; routes switched to combinedAuth for SSR consumption."

### Review Findings (2026-05-10 — bmad-code-review)

**Sources:** Blind Hunter (30) + Edge Case Hunter (44) + Acceptance Auditor (16). Deduped to 33 actionable items.

#### Decision-needed (3)

- [ ] [Review][Decision] Token-transactions multi-chain coverage: Zod schema accepts 7 EVM chains (`[...ALLOWED_EVM_CHAINS, 'solana']`) but `ETHERSCAN_CHAIN_MAP` only has 4 (eth/arb/base/polygon) — request với `chain=bsc|avalanche|optimism` throw "Unsupported chain". Decide: narrow Zod xuống 4 hoặc add 3 chain mappings. [token-transactions.ts:868-873, token-holders.ts:466]
- [ ] [Review][Decision] `layout-content.tsx` tab-system bypass — hardcoded `pathname.startsWith('/token/')` ngoài File List của spec. Decide: keep + document trong File List, hoặc refactor sang Next.js route-segment metadata. [layout-content.tsx:232-233]
- [ ] [Review][Decision] `getServerAuthHeader` deviates from spec parity — uses `supabase.auth.getSession()` thay vì `headers().get('Authorization')` forward (chart route pattern). Decide: keep current (cookies-based, works) hoặc revert to header forward.

#### Patch (27)

**CRITICAL — block merge:**
- [ ] [Review][Patch] Stage `apps/extension/src/lib/canonical.ts` — `getCanonicalBaseUrl` import unresolved → extension build break [extension/src/content/index.ts:200]
- [ ] [Review][Patch] Stage `apps/web/next.config.ts` — CoinGecko `images.remotePatterns` missing → TokenNotFound `<Image>` runtime crash [next.config.ts]
- [ ] [Review][Patch] Tests Task 6 — 0 tests added; spec mandates ≥17 (services + routes + RiskBadgeCard + address utils + Suspense ordering). At minimum: address utils unit tests + RiskBadgeCard render test + 1 route happy-path per service.
- [ ] [Review][Patch] Run Story 3.3 regression — `bun test apps/web/src/components/thread/tool-views/opencode/__tests__/OcContractRiskToolView.test.ts` chưa run sau RiskBadgeCard refactor.

**HIGH — fix this PR:**
- [ ] [Review][Patch] Token-info contract resolver hardcodes `ethereum` — Base/Arbitrum/Polygon tokens always 404. Use chain param: `/coins/{platform}/contract/{address}` với platform map [token-info.ts:139-163]
- [ ] [Review][Patch] `Number(holder.balance) / 1e18` — precision loss + hardcoded 18 decimals. Use BigInt + decimals từ token-info response (USDC=6, WBTC=8 hiển thị sai 12 orders) [HoldersSection.tsx:1257]
- [ ] [Review][Patch] `fetchTokenInfoServer` không pass `chain` — non-Ethereum token luôn fall back UI. Forward chain prop như RiskSection/HoldersSection [HeaderSection.tsx:1746-1771]
- [ ] [Review][Patch] `searchParams.chain` không validate — arbitrary string flow xuống fetch + UI Badge. Add allowlist (`if (!ALLOWED_EVM_CHAINS.includes(c) && c !== 'solana') notFound()`) [page.tsx:1117-1125]
- [ ] [Review][Patch] `searchTokensServerSide` không pre-filter length 1-30 / alphanumeric per AC5 — bot scrape `/token/foo` burns billing credit/request, no rate limit [page.tsx:1034]
- [ ] [Review][Patch] Holder/Tx addresses linked như token addresses — EOA/zero-address click → `/token/<EOA>` → infinite TokenNotFound loop. Render plain text khi address không phải known token (hoặc bỏ link entirely) [HoldersSection.tsx:1248-1255, TxsSection.tsx:1423-1430]
- [ ] [Review][Patch] `token-holders` silent empty when `MORALIS_API_KEY` missing — different contract from `token-transactions` (which throws). Add explicit error hoặc `unconfigured: true` flag để UI distinguish "no data" vs "misconfigured" [token-holders.ts:754-763]
- [ ] [Review][Patch] `block_number` type mismatch — service returns string (Etherscan/Blockscout), client types as `number`. Align type to `string` [token-transactions.ts:951, TxsSection.tsx:1298]
- [ ] [Review][Patch] URL injection: address chưa `encodeURIComponent` trước string interp trong upstream URLs [token-holders.ts:765, token-transactions.ts:922]
- [ ] [Review][Patch] `as any` 3x trong RiskSection error path → discriminated union (`{ success: true, data } | { success: false, error }`) [RiskSection.tsx:1537,1552,1557]
- [ ] [Review][Patch] `generateMetadata` canonical URL dùng raw address (không lowercase) → SEO duplicate content cho mixed-case access. Lowercase EVM trước khi build canonical [page.tsx:1089-1105]
- [ ] [Review][Patch] Hardcoded `https://app.chainlens.com` trong canonical URL — staging/preview deploys broadcast canonical pointing tới production. Use `getCanonicalBaseUrl()` (exists at line 200) [page.tsx:1089-1105]
- [ ] [Review][Patch] `apps/api/.env.example` — add 5 placeholders: `MORALIS_API_KEY=`, `ETHERSCAN_API_KEY=`, `ARBISCAN_API_KEY=`, `BASESCAN_API_KEY=`, `POLYGONSCAN_API_KEY=`
- [ ] [Review][Patch] Story 3.3 spec changelog update: `_bmad-output/implementation-artifacts/3-3-generative-ai-chat-widgets.md` — note RiskBadgeCard extraction + combinedAuth switch
- [ ] [Review][Patch] `tx.timeStamp` NaN guard — `new Date(NaN).toISOString()` throws RangeError → entire fetch crash. Filter or fallback [token-transactions.ts:947-952]
- [ ] [Review][Patch] `tokenDecimal` falsy fallback — `tx.tokenDecimal ? Number(...) : 18` falsely fallbacks `0` (zero-decimal token) hoặc `''` to 18. Use `!= null` check [token-transactions.ts:948]
- [ ] [Review][Patch] Etherscan rate-limit message false-positive — `"Max rate limit reached"` triggers "API key required" misleading message. Distinguish `NOTOK` vs rate-limit explicitly [token-transactions.ts:933-939]
- [ ] [Review][Patch] Etherscan `result` string error — when API returns string error in `result`, `Array.isArray` false → silently empty. Throw explicit [token-transactions.ts:931-939]
- [ ] [Review][Patch] `AbortSignal.timeout()` missing trong RiskSection fetch — server component hangs on slow upstream blocking Suspense waterfall [RiskSection.tsx:1538-1558]
- [ ] [Review][Patch] JSON parse error handling — `res.json()` throws on non-JSON body crashes Suspense boundary. Wrap với `text()` + try/catch [HeaderSection.tsx:1746-1771, RiskSection.tsx, HoldersSection.tsx, TxsSection.tsx]
- [ ] [Review][Patch] NaN handling cho `change_24h_pct` — `NaN >= 0` false → falsely red. Use `Number.isFinite` guard [HeaderSection.tsx:1819-1820]
- [ ] [Review][Patch] CoinGecko 429 rate-limit handling — treated như generic error. Surface `RateLimitError` [token-search.ts:830-832]
- [ ] [Review][Patch] CoinGecko entry shape validation — `coin.id` missing makes link `/dashboard/token/undefined`. Filter `typeof coin.id === 'string' && coin.id.length > 0` [token-search.ts:837-843]
- [ ] [Review][Patch] Holder duplicate addresses key collision — Moralis can return dupes. Use composite `key={\`${rank}-${address}\`}` [HoldersSection.tsx:1245-1264]

#### Defer (3) — pre-existing or post-MVP

- [x] [Review][Defer] TTL 24h cho token-holders cache không có `?fresh=true` bypass — add post-MVP [token-holders.ts:461]
- [x] [Review][Defer] Loading.tsx + Suspense fallback timing duplication → 3-frame flicker on nav from external. UX polish, not breaking. [loading.tsx vs page.tsx Suspense]
- [x] [Review][Defer] Singleflight / billing atomicity hardening — concurrent cache misses + non-atomic check/deduct pattern is shared across all 3 new routes (matches Story 3.3 pattern). Address as cross-cutting platform improvement, not Story 3.4 scope.

#### Dismissed (10) — false positive / handled

- `SOL_ADDRESS` unused import (Auditor confirmed used downstream)
- CoinGecko query double-encoding concern (single-encoding standard)
- EIP-55 checksum validation (overkill, lowercase normalize sufficient)
- Comment "AC1" orphan reference (minor doc smell)
- Address `"` injection visual concern (React escapes)
- `&apos;` HTML entity escaping (non-issue)
- Multi-tenant cache pollution (cache key includes session_id)
- Whitespace-only query schema (already filtered)
- Unicode unicode pre-encoding (false positive)
- Skeleton CSS timing classes (covered by Defer item above)

## Dev Notes

### Verified Assumptions (MCP Trio Pre-Spec Verification + Independent Quality Review)

| Assumption | Verification | Result |
|---|---|---|
| TradingView chart từ Story 3.2 reusable cho Token Detail Page | Read `trading-view-chart.tsx` + chart `page.tsx` + market routes | ⚠️ **DEFERRED** — `TradingViewChart` chỉ dùng `data` prop (KHÔNG dùng `token`), và `/v1/market/ohlcv/*` hardcode mock data cho 10 known symbols. Real OHLCV provider integration là Story 3.4.5+ scope. Token Detail Page render "Chart coming soon" placeholder. |
| Cyber-Glass theme pattern | Read `markets-client.tsx` + chart `page.tsx` | ✅ `border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl` confirmed |
| `OcContractRiskToolView` standalone-ready | Read full file | ❌ Cần `toolCall + toolResult` props — refactor to `<RiskBadgeCard>` (AC3) |
| Story 3.3 test stability under refactor | Read `OcContractRiskToolView.test.ts` | ✅ Tests are pure-function tests on `riskColorClass` + `shortAddr` — survive refactor IF helpers re-exported with identical signatures |
| `widget-cache` reusable cho new tools | Read `apps/api/src/router/services/widget-cache.ts` | ✅ Generic Map với TTL, lowercase logic ALREADY moved to caller post-Story 3.3 patches |
| Onchain indexing service đã có holders/tx data | Search `onChainDataIndex` schema | ❌ Schema generic; current data là protocol metrics + smart money flows. MUST build new services. |
| **Etherscan free tier sufficient cho `tokenholderlist`** | Etherscan API docs verification (May 2026) | ❌ **PRO-ONLY endpoint** — Original spec assumption WRONG. **Switched to Moralis `/erc20/{address}/owners`** (free tier 25k req/day, multi-chain native). |
| Etherscan free tier sufficient cho `tokentx` | Etherscan API docs | ✅ Free tier supports `tokentx` (5 cps, 10k/day) — Transactions section uses Etherscan family |
| CoinGecko `/search` endpoint exists | API verification | ✅ Free tier, returns up to ~25 results với image, market_cap_rank |
| **Next.js 15 `not-found.tsx` receives params** | Next.js docs + GitHub discussion | ❌ **NO** — `not-found.tsx` does not get `params` prop. Inline 404 UI in `page.tsx` instead. |
| Suspense + skeleton patterns | Read chart page + Skeleton component | ✅ Multi-Suspense pattern works in Next.js 15 IF `await params/searchParams` happen at top of page.tsx BEFORE Suspense JSX |
| Address regex helpers consolidatable | Read `contract-risk.ts` + `tx-simulator.ts` + `jit-sync.ts` routes | ⚠️ Inline regex duplicated; **3 variants exist** — `contract-risk.ts` and `tx-simulator.ts` use `/^0x[a-fA-F0-9]{40}$/`, but `jit-sync.ts` uses lowercase-only `/^0x[a-f0-9]{40}$/`. Refactor only the first 2; leave jit-sync alone. |
| Browser extension URL hardcoded location | Read `apps/extension/src/content/index.ts:164` | ✅ Confirmed |
| **`/v1/router/*` apiKeyAuth + SSR fetch compat** | Read `auth.ts` + `router/index.ts` | ❌ **`apiKeyAuth` requires `epsilon_*` token prefix** — SSR cannot generate this. **Switch to `combinedAuth`** (accepts both epsilon_* and Supabase JWT). Story 3.3 tools still work because they pass epsilon_* tokens. |
| Auth pattern cho route placement | Read middleware + chart route auth | ⚠️ **Original spec proposed top-level `/token/*` + PUBLIC_ROUTES — BROKEN** because SSR fetches require auth. **Resolved**: route nested in `(dashboard)` group → auth-gated parity với chart + markets. Extension deep-link goes through auth flow if user not logged in. |
| `packages/shared` available cho cross-app import | Read root `package.json` + workspace config | ✅ Use real shared package instead of duplicate constants |

### Reference Patterns

**Backend service pattern (Moralis holders, parity Story 3.3 token-info.ts):**

```ts
// apps/api/src/router/services/token-holders.ts
import { config } from '../../config';
import { ALLOWED_EVM_CHAINS, type EvmChain } from '@chainlens/shared/address';

const TOKEN_HOLDERS_TIMEOUT_MS = 2500;

const MORALIS_CHAIN_MAP: Record<EvmChain, string> = {
  ethereum: 'eth',
  arbitrum: 'arbitrum',
  base: 'base',
  polygon: 'polygon',
  bsc: 'bsc',
  avalanche: 'avalanche',
  optimism: 'optimism',
};

export interface HolderEntry {
  address: string;
  balance: string;
  percentage: number;
  rank: number;
}

export interface TokenHoldersSnapshot {
  holders: HolderEntry[];
  total_holders: number | null;
  chain: string;
  address: string;
  checked_at: string;
  source: 'moralis';
}

export async function fetchTokenHolders(
  address: string,
  chain: string,
  options: { signal?: AbortSignal; limit?: number } = {},
): Promise<TokenHoldersSnapshot> {
  if (chain === 'solana' || chain === 'sol') {
    throw new Error('Solana token holders require paid tier (planned post-MVP)');
  }
  if (!config.MORALIS_API_KEY) {
    throw new Error('MORALIS_API_KEY not configured');
  }
  const moralisChain = MORALIS_CHAIN_MAP[chain as EvmChain];
  if (!moralisChain) {
    throw new Error(`Unsupported chain: ${chain}`);
  }
  const limit = Math.min(options.limit ?? 20, 100);
  const url = `https://deep-index.moralis.io/api/v2.2/erc20/${address}/owners?chain=${moralisChain}&limit=${limit}`;

  const resp = await fetch(url, {
    headers: { 'X-API-Key': config.MORALIS_API_KEY, Accept: 'application/json' },
    signal: options.signal ?? AbortSignal.timeout(TOKEN_HOLDERS_TIMEOUT_MS),
  });
  if (!resp.ok) {
    throw new Error(`Moralis API error: ${resp.status} - ${await resp.text().then(t => t.slice(0, 200))}`);
  }
  const body = await resp.json() as { result?: any[] };
  const holders: HolderEntry[] = (body.result ?? []).map((entry, idx) => ({
    address: entry.owner_address,
    balance: entry.balance,
    percentage: entry.percentage_relative_to_total_supply ?? 0,
    rank: idx + 1,
  }));
  return {
    holders,
    total_holders: holders.length, // Moralis doesn't return total in this endpoint
    chain,
    address,
    checked_at: new Date().toISOString(),
    source: 'moralis',
  };
}
```

**Backend route pattern (parity Story 3.3 token-info.ts post-patches):**

```ts
// apps/api/src/router/routes/token-holders.ts
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { ALLOWED_EVM_CHAINS, EVM_ADDRESS, SOL_ADDRESS } from '@chainlens/shared/address';
import { fetchTokenHolders, type TokenHoldersSnapshot } from '../services/token-holders';
import { widgetCacheKey, cacheGet, cacheGetStale, cacheSet } from '../services/widget-cache';
import { checkCredits, deductToolCredits } from '../services/billing';
import { getToolCost } from '../../config';
import type { AppContext } from '../../types';

const TOOL = 'token_holders';
const TTL_MS = 24 * 60 * 60 * 1000; // 24h
const SESSION_ID = z.string().max(128).regex(/^[A-Za-z0-9_-]+$/, 'session_id must be alphanumeric/dash/underscore').optional();

const TokenHoldersRequestSchema = z.object({
  address: z.string().min(1).max(255),
  chain: z.enum([...ALLOWED_EVM_CHAINS, 'solana']).default('ethereum'),
  limit: z.number().min(1).max(100).optional().default(20),
  session_id: SESSION_ID,
});

export const tokenHolders = new Hono<{ Variables: AppContext }>();

tokenHolders.post('/', async (c) => {
  const accountId = c.get('accountId');
  const body = await c.req.json().catch(() => null);
  if (body === null) throw new HTTPException(400, { message: 'Invalid JSON body' });
  const parseResult = TokenHoldersRequestSchema.safeParse(body);
  if (!parseResult.success) {
    throw new HTTPException(400, { message: `Validation error: ${parseResult.error.message}` });
  }

  const { address, chain, limit, session_id } = parseResult.data;
  const isSolana = chain === 'solana';
  if (!isSolana && !EVM_ADDRESS.test(address)) {
    throw new HTTPException(400, { message: 'Invalid EVM address format' });
  }
  if (isSolana && !SOL_ADDRESS.test(address)) {
    throw new HTTPException(400, { message: 'Invalid Solana address format' });
  }

  const cacheAddr = isSolana ? address : address.toLowerCase();
  const key = widgetCacheKey(TOOL, cacheAddr, chain, String(limit));
  const creditCheck = await checkCredits(accountId);
  if (!creditCheck.hasCredits) throw new HTTPException(402, { message: 'Insufficient credits' });

  let data: TokenHoldersSnapshot;
  let stale = false;
  let cache_status: 'live' | 'cache_fresh' | 'cache_stale' = 'live';
  try {
    const fresh = cacheGet<TokenHoldersSnapshot>(key);
    if (fresh) {
      data = fresh.data;
      cache_status = 'cache_fresh';
    } else {
      data = await fetchTokenHolders(address, chain, { limit });
      cacheSet(key, data, TTL_MS);
      cache_status = 'live';
    }
  } catch (err) {
    const staleEntry = cacheGetStale<TokenHoldersSnapshot>(key);
    if (staleEntry) {
      data = staleEntry.data;
      stale = true;
      cache_status = 'cache_stale';
    } else {
      return c.json({
        success: false,
        stale: false,
        error: err instanceof Error ? err.message : 'Token holders unavailable',
        cost: 0,
      });
    }
  }

  const cost = getToolCost(TOOL, 0);
  c.header('X-Cache-Status', cache_status === 'live' ? 'fresh' : cache_status === 'cache_fresh' ? 'hit' : 'stale-fallback');

  try {
    await deductToolCredits(accountId, TOOL, 0, `Token holders: ${address} on ${chain}`, session_id);
  } catch (e) {
    console.warn(`[EPSILON][billing-failure] tool=${TOOL} account=${accountId} err=${e instanceof Error ? e.message : String(e)}`);
  }

  return c.json({ success: true, stale, cache_status, cost, ...data });
});
```

**Frontend page pattern (auth-gated, inline 404, deferred chart):**

```tsx
// apps/web/src/app/(dashboard)/token/[address]/page.tsx
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { detectChain, normalizeAddress } from '@chainlens/shared/address';
import { HeaderSection } from './_components/HeaderSection';
import { ChartPlaceholderCard } from './_components/ChartPlaceholderCard';
import { RiskSection } from './_components/RiskSection';
import { HoldersSection } from './_components/HoldersSection';
import { TxsSection } from './_components/TxsSection';
import { TokenNotFound } from './_components/TokenNotFound';
import { HeaderSkeleton, RiskSkeleton, HoldersSkeleton, TxsSkeleton } from './_components/skeletons';

async function searchTokensServerSide(query: string) {
  // Best-effort: 1s timeout, return empty array on any error
  try {
    const baseUrl = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!baseUrl) return [];
    const hdrs = await headers();
    const auth = hdrs.get('Authorization') ?? hdrs.get('authorization');
    const res = await fetch(`${baseUrl}/v1/router/token-search?q=${encodeURIComponent(query)}`, {
      headers: auth ? { Authorization: auth } : {},
      signal: AbortSignal.timeout(1000),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const body = await res.json() as { results?: any[] };
    return Array.isArray(body.results) ? body.results : [];
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<{ address: string }> }): Promise<Metadata> {
  const { address: raw } = await params;
  const detected = detectChain(raw);
  if (detected === 'unknown') {
    return {
      title: 'Token not found — Chainlens',
      robots: { index: false },
    };
  }
  // Best-effort fetch token-info for title; fallback to address-only on any error
  try {
    // ... attempt fetchTokenInfo, return rich metadata
  } catch {
    // fallback
  }
  return {
    title: `${raw.slice(0, 10)}… — Chainlens`,
    alternates: { canonical: `https://app.chainlens.com/dashboard/token/${raw}` },
  };
}

export default async function TokenDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ address: string }>;
  searchParams: Promise<{ chain?: string }>;
}) {
  const { address: raw } = await params;
  const { chain: chainParam } = await searchParams;
  const detected = detectChain(raw);

  // Inline 404 UI — NOT calling notFound() (Next.js 15 not-found.tsx cannot read params)
  if (detected === 'unknown') {
    const suggestions = await searchTokensServerSide(raw);
    return <TokenNotFound rawQuery={raw} suggestions={suggestions} />;
  }

  const chain = chainParam ?? (detected === 'evm' ? 'ethereum' : 'solana');
  const address = normalizeAddress(raw, chain);

  return (
    <div className="container max-w-6xl py-8 space-y-6 animate-in fade-in zoom-in duration-500 ease-out">
      <Suspense fallback={<HeaderSkeleton />}>
        <HeaderSection address={address} chain={chain} />
      </Suspense>
      <ChartPlaceholderCard symbol={null} />
      <Suspense fallback={<RiskSkeleton />}>
        <RiskSection address={address} chain={chain} />
      </Suspense>
      <Suspense fallback={<HoldersSkeleton />}>
        <HoldersSection address={address} chain={chain} />
      </Suspense>
      <Suspense fallback={<TxsSkeleton />}>
        <TxsSection address={address} chain={chain} />
      </Suspense>
    </div>
  );
}
```

### Architecture Constraints

- **Server vs Client Components**: Default to Server Components for sections (data fetch + render). Client Components ONLY khi cần interactivity (RiskBadgeCard tooltips). Pattern: server fetches data, passes via props to client component — KHÔNG để client component fetch data lần nữa.
- **Auth header forwarding**: SSR fetch từ section components phải forward `Authorization` header từ incoming request (parity với chart `page.tsx:21-23`). Otherwise backend reject với 401.
- **`combinedAuth` for `/v1/router/*` data routes**: Switch existing `token-info`, `contract-risk`, `tx-simulator` + new `token-holders`, `token-transactions`, `token-search` to `combinedAuth`. OpenCode tools continue to work (combinedAuth accepts epsilon_*); SSR pages now work too (combinedAuth accepts Supabase JWT).
- **Cyber-Glass theme**: `bg-black/40 backdrop-blur-xl border border-white/10 shadow-2xl rounded-xl` cho all section cards. Consistent với markets + chart routes.
- **Cache strategy (defense in depth)**:
  - Frontend: Next.js `next: { revalidate: N }` per section (60s header, 30s risk/tx, 600s holders, 3600s search)
  - Backend: widget-cache TTL (60s/300s/24h depending on tool)
  - Layered caching means even if frontend revalidate triggers, backend cache absorbs upstream call
- **NFR1 <2s TTFB**: Header section streams within 2s (token-info 1.2s timeout). Suspense boundaries keep TTFB low.
- **NFR8 atomic billing**: `await deductToolCredits` BEFORE response (parity Story 3.3 patches — KHÔNG dùng `queueMicrotask`).
- **Multi-chain at MVP**: EVM only cho Holders + Transactions (Moralis EVM tier + Etherscan family). Solana → render "coming soon" message, không crash.

### Security & UX Guardrails

- **Input validation**: Address regex enforced at route layer (Zod) trước khi cache key, parity với Story 3.3 patches. Reject malformed early.
- **Chain enum validation**: Use `z.enum([...ALLOWED_EVM_CHAINS, 'solana'])` to prevent injection of arbitrary chain values into upstream URL building.
- **Cache key normalization**: EVM addresses lowercase ở caller (route), Solana preserve case (parity với widget-cache.ts comment).
- **Moralis / Etherscan API key**: Don't hardcode in service. Read from `config.MORALIS_API_KEY` / `config.ETHERSCAN_API_KEY` (validated by envSchema). Empty key → service throws clear error.
- **Stale-fallback semantics**: `success: false, stale: false` khi no data exists (parity Story 3.3 patches — don't lie với `stale: true`).
- **CSRF / open redirect**: TokenNotFound renders external links (CoinGecko thumbnails) — `next.config.js` `images.remotePatterns` updated to whitelist `coin-images.coingecko.com` + `assets.coingecko.com`.
- **Robots / SEO**: TokenNotFound metadata sets `robots: { index: false }`. Valid token: `alternates.canonical` set explicit.
- **Search rate limit**: TTL=1h with cache key including query — identical queries không refetch. Per-user throttle deferred (CoinGecko has server-IP rate limit which provides some protection); add per-account token bucket if abuse observed.

### Testing Standards

- **Bun test runner** (parity Story 3.3): `bun test` cho cả backend + frontend. Frontend tests sử dụng pure-function extraction pattern (see Story 3.3 `agentNameToTier` refactor) khi React render không possible trong Bun.
- **Test location**: backend `apps/api/src/__tests__/unit/`, frontend `apps/web/src/.../__tests__/` hoặc `*.test.ts(x)` adjacent.
- **Coverage**: ≥17 new tests (4 holders-service + 4 transactions-service + 3 search-service + 4 holders-route + 6 address-utils + 6 RiskBadgeCard helpers + 4 web address smoke + 1 Suspense ordering).
- **Mandatory regression checks**:
  - Run `bun test apps/web/src/components/thread/tool-views/opencode/__tests__/OcContractRiskToolView.test.ts` after Task 3 — 7 tests must stay green
  - Run all Story 3.3 backend tests after Task 2 combinedAuth switch — 21 tests must stay green
  - Run all Story 3.3 frontend tests after merge — 34 tests must stay green
- **TypeScript**: `bunx tsc --noEmit` from each app root must không introduce errors trong files đã đụng. Pre-existing errors trong unrelated files acceptable.

### Performance Budget (NFR1, NFR2)

| Metric | Target | Implementation Strategy |
|---|---|---|
| TTFB (header section) | <2s | token_info service 1.2s + 800ms HTTP overhead |
| Risk section first paint | <3s | contract_risk 2.5s service + auth + HTTP overhead |
| Holders section first paint | <3s | Moralis `/erc20/owners` ~1.5-2s + HTTP overhead |
| Full page load (4 sections) | <5s | Parallel Suspense streaming; slowest section drives |
| Moralis rate limit headroom | 25k req/day | 24h cache TTL absorb most repeat hits |
| Cache hit ratio target | ≥80% | After 24h warmup; popular tokens dominate access |

### Dev Notes from Story 3.3 (Carry-forward Learnings)

Story 3.3 review surfaced these patterns — apply preventively:

1. **Adapter pattern matters**: Story 3.3 had `ocPartToViewProps` adapter để bridge ToolProps → ToolViewProps. Story 3.4 RiskBadgeCard refactor là cleaner approach (avoid adapter, separate concerns).
2. **Atomic billing**: Use `await deductToolCredits` from start (not `queueMicrotask`).
3. **Stale-fallback semantics**: `stale: true` chỉ khi serve cached data. No data → `stale: false + success: false + error`.
4. **Cache key chain-aware**: EVM lowercase ở caller, Solana preserve case.
5. **session_id charset/length**: `z.string().max(128).regex(/^[A-Za-z0-9_-]+$/)`.
6. **Pure-function extraction for tests**: Bun không support React render trong nhiều case → extract pure helpers.
7. **Test mocks must mock the right module**: verify mock module path matches actual import (use `mcp__symdex__get_callers`).
8. **Sanitize upstream errors**: nếu future expose holders/tx as OpenCode tools, áp dụng `sanitizeUpstreamErr()` Story 3.3 lib.

## File List

**New files (≈21 files):**
- `packages/shared/src/address.ts`
- `apps/api/src/router/services/token-holders.ts`
- `apps/api/src/router/services/token-transactions.ts`
- `apps/api/src/router/services/token-search.ts`
- `apps/api/src/router/routes/token-holders.ts`
- `apps/api/src/router/routes/token-transactions.ts`
- `apps/api/src/router/routes/token-search.ts`
- `apps/api/src/__tests__/unit/token-holders-service.test.ts`
- `apps/api/src/__tests__/unit/token-transactions-service.test.ts`
- `apps/api/src/__tests__/unit/token-search-service.test.ts`
- `apps/api/src/__tests__/unit/token-holders-route.test.ts`
- `packages/shared/src/__tests__/address.test.ts` (or in `apps/api`/`apps/web` test dir per existing convention)
- `apps/web/src/components/widgets/risk-badge-utils.ts`
- `apps/web/src/components/widgets/RiskBadgeCard.tsx`
- `apps/web/src/components/widgets/__tests__/RiskBadgeCard.test.ts`
- `apps/web/src/lib/__tests__/address.test.ts` (smoke test for shared package import)
- `apps/web/src/app/(dashboard)/token/[address]/page.tsx`
- `apps/web/src/app/(dashboard)/token/[address]/loading.tsx`
- `apps/web/src/app/(dashboard)/token/[address]/_components/HeaderSection.tsx`
- `apps/web/src/app/(dashboard)/token/[address]/_components/ChartPlaceholderCard.tsx`
- `apps/web/src/app/(dashboard)/token/[address]/_components/RiskSection.tsx`
- `apps/web/src/app/(dashboard)/token/[address]/_components/HoldersSection.tsx`
- `apps/web/src/app/(dashboard)/token/[address]/_components/TxsSection.tsx`
- `apps/web/src/app/(dashboard)/token/[address]/_components/TokenNotFound.tsx`
- `apps/web/src/app/(dashboard)/token/[address]/_components/skeletons.tsx`
- `apps/extension/src/lib/canonical.ts`

**Modified files (≈10 files):**
- `packages/shared/src/index.ts` — re-export new address module
- `apps/api/src/config.ts` — add MORALIS_API_KEY + ETHERSCAN family + 3 TOOL_PRICING entries
- `apps/api/src/router/index.ts` — register 3 new routes + switch existing 3 routes from `apiKeyAuth` to `combinedAuth`
- `apps/api/src/router/routes/contract-risk.ts` — refactor to use shared address module
- `apps/api/src/router/routes/tx-simulator.ts` — refactor to use shared address module
- `apps/api/src/router/services/contract-risk.ts` — refactor to use shared address module
- `apps/api/.env.example` — add Moralis + Etherscan family keys
- `apps/web/next.config.js` — add CoinGecko hostnames to images.remotePatterns
- `apps/web/src/components/thread/tool-views/opencode/OcContractRiskToolView.tsx` — delegate render to RiskBadgeCard
- `apps/extension/src/content/index.ts` — update line 164 canonical URL

**NOT modified (intentionally):**
- `apps/api/src/router/routes/jit-sync.ts` — uses lowercase-only EVM regex (`/^0x[a-f0-9]{40}$/`) intentionally because input is pre-lowercased upstream. Switching to shared `EVM_ADDRESS` regex would change semantics. Document with inline comment if touched in future.

### References

- [Source: epics.md#Epic 3 Story 3.4]
- [Source: existing chart route](apps/web/src/app/(dashboard)/chart/[token]/page.tsx) — Suspense + auth-forward reference template
- [Source: existing markets-client](apps/web/src/app/(dashboard)/markets/markets-client.tsx) — Cyber-Glass theme reference
- [Source: Story 3.3 token-info.ts route](apps/api/src/router/routes/token-info.ts) — backend route pattern reference (post-review-patches)
- [Source: Story 3.3 Risk component](apps/web/src/components/thread/tool-views/opencode/OcContractRiskToolView.tsx) — extraction source for RiskBadgeCard
- [Source: widget-cache.ts](apps/api/src/router/services/widget-cache.ts) — caller-normalize-case API contract
- [Moralis Web3 Data API — ERC20 owners](https://docs.moralis.io/web3-data-api/evm/reference/get-token-owners) — `/erc20/{address}/owners` endpoint, free tier 25k req/day
- [Etherscan API — tokentx (free tier)](https://docs.etherscan.io/api-endpoints/accounts#get-a-list-of-erc20-token-transfer-events-by-address)
- [CoinGecko search](https://docs.coingecko.com/reference/search-data) — `/search?query={q}` endpoint
- [browser extension content script](apps/extension/src/content/index.ts) — Story 6.x prep target

## Dev Agent Record

### Implementation Notes

(To be filled by dev agent during implementation.)

### Completion Notes

(To be filled by dev agent.)

### Change Log

- 2026-05-10: Story spec'd via `bmad-create-story`, verified via MCP trio (Serena + SymDex + CRG).
- 2026-05-10: Spec validated via `validate-create-story` — 7 critical issues found and resolved before ready-for-dev. See "Spec Revision Notes" below.

## Spec Revision Notes (2026-05-10 post-validation)

Independent quality validator surfaced 7 critical blockers in initial spec. All resolved before this version:

| Issue | Original spec | Resolved |
|---|---|---|
| Etherscan `tokenholderlist` is PRO-only | "Free tier 5cps/10k day ✅" | Switched to Moralis `/erc20/{address}/owners` (free tier 25k req/day, multi-chain native) |
| `apiKeyAuth` requires epsilon_* token, breaks SSR | "Pattern parity với Story 3.3 (apiKeyAuth)" | Switch new + existing 3 routes to `combinedAuth` (accepts both epsilon_ and Supabase JWT) |
| Next.js 15 `not-found.tsx` không nhận params | "Route-level not-found.tsx with fuzzy match" | Inline 404 UI in `page.tsx` (TokenNotFound component) — DROP not-found.tsx |
| Cross-app duplication of address-utils | "Duplicate constants apps/api ↔ apps/web" | Use `packages/shared/src/address.ts` (real shared package) |
| TradingViewChart embed broken (mock data) | "Embed Story 3.2 chart" | Defer ChartSection — render "Chart coming soon" placeholder; real OHLCV provider is Story 3.4.5+ |
| Address→slug mapping undefined for unindexed tokens | (not addressed) | Header fallback: address shortened + chain badge + "Listing pending" |
| Top-level public `/token/*` route + SSR auth conflict | "Top-level + PUBLIC_ROUTES" | Nested in `(dashboard)/token/[address]` (auth-gated parity with chart + markets) |

Plus enhancements from validator:
- Zod enum validation for chain query param (`z.enum([...ALLOWED_EVM_CHAINS, 'solana'])`)
- `next.config.js` `images.remotePatterns` update for CoinGecko thumbnails
- Explicit `next: { revalidate: N }` per SSR fetch
- Document jit-sync.ts regex semantic divergence (don't refactor)
- Mandatory regression test runs after Task 2 (combinedAuth switch) and Task 3 (RiskBadgeCard refactor)

Reviewer notes: Story 3.4 spec đã đi qua MCP trio verification + independent fresh-context validation trước khi ready-for-dev. Original spec assumptions WRONG về 7 areas đã được fix by switching data sources, restructuring auth strategy, and deferring infeasible scope (Chart with mock OHLCV).
