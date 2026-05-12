# Story 3.1: DeFi & Market Dashboard Page

## Story Foundation

**User Story:**
As a crypto investor,
I want xem bảng Yield/TVL đa cột có sort và Sparklines cho các protocols,
So that tôi compare performance giữa DeFi protocols nhanh mà không cần mở nhiều tab.

**Acceptance Criteria:**

- **Given** user truy cập `/dashboard/markets`
  **When** Next.js server component render
  **Then** bảng hiển thị danh sách protocols với columns: Protocol, TVL, APY 7d, APY 30d, Chain, Change 24h — có thể sort theo từng column
  **And** mỗi row có sparkline chart 7d trend inline

- **Given** Nansen Smart Money data đã được indexed
  **When** dashboard render Smart Money Flow Visualizer section
  **Then** visualizer hiển thị top wallet movements (inflow/outflow) với direction indicators
  **And** data refresh không cần full page reload

## Developer Context & Guardrails

### Technical Requirements
- Phải dùng **Next.js App Router** cho trang mới (`apps/web/src/app/(dashboard)/markets/page.tsx`).
- Bảng danh sách protocols và layout của trang phải được render dưới dạng **Server Components**.
- Các element cần tương tác (như sort table column, sparkline chart, direction indicators tự động refresh) cần được tách ra làm **Client Components** (leaf nodes với `"use client"`).
- UI Framework: Sử dụng **TailwindCSS** và **React 18**.
- Việc refresh data cho Smart Money Flow Visualizer không được làm reload toàn trang (có thể dùng SWR, React Query hoặc Next.js Server Actions với polling/hydration).
- Fetch data thông qua `packages/db` Drizzle schemas hoặc API của backend tuỳ thuộc vào pattern chuẩn của Next.js app hiện tại.

### Architecture Compliance
- **AR1 (Brownfield Extension):** Phải tích hợp vào monorepo hiện có tại `apps/web`. Không tạo app mới.
- **AR4 (Next.js App Router):** Server components ưu tiên. Các UI component nhỏ nhắn có state (`"use client"`) phải được tách riêng (leaf nodes).
- **AR7 (Shared Types):** Nếu có định nghĩa type mới cho data trả về từ bảng, phải đặt tại `packages/shared/src/types/`.
- **NFR1 & NFR4:** Đảm bảo hiệu năng tốt cho >1000 CCU, tối ưu render để không gây giật lag (chú ý Sparklines performance nếu render quá nhiều row).

### File Structure Requirements
- `apps/web/src/app/(dashboard)/markets/page.tsx`: Route chính (Server Component).
- `apps/web/src/components/...`: Chứa các Client components tái sử dụng cho Table, Sparkline, và Smart Money Flow Visualizer.
- `packages/shared/src/types/market.ts` (nếu cần): Khai báo interface cho Protocol và Smart Money Flow.

### Testing Requirements
- **Unit Tests:** Nếu có các hàm tính toán % change hoặc format number, phải viết test trong `apps/web/` bằng `bun test`.
- **E2E Tests:** Viết E2E coverage cơ bản cho Playwright (`tests/playwright.config.ts`) để đảm bảo trang `/dashboard/markets` load thành công và bảng hiển thị đầy đủ data.

## Project Context Reference
- **Tech Stack:** TypeScript, Next.js (App Router), TailwindCSS, Drizzle ORM.
- Tham khảo `project-context.md` để biết thêm chi tiết về strict typing và monorepo boundaries.

## Completion Status
**Status:** done
**Note:** Round 2 review applied 22 patches (cache-control, sort comparator, sparkline NaN guards, react-query polling, error.tsx boundary, dedup query, real unit tests, expanded e2e). All TypeScript clean, 13/13 unit tests pass.

### Review Findings

- [x] [Review][Patch] Add authentication to `/v1/market` endpoints — Enforce `apiKeyAuth` to prevent unauthorized scraping.
- [x] [Review][Patch] Smart Money Flow visualizer generates fake data instead of polling — Uses Math.random() interval instead of polling the backend as per AC2.
- [x] [Review][Patch] "Chain" column in Protocols Table is not sortable — Missing handleSort('chain') handler (violates AC1).
- [x] [Review][Patch] Missing Unit Tests for formatting and sorting logic — No unit tests created in apps/web/ for custom formatters.
- [x] [Review][Patch] Missing E2E Tests for the Dashboard Page — No Playwright tests created.
- [x] [Review][Patch] Dangerous Type Coercion / DB JSON lacks schema — Casting metricValue directly without Zod validation will crash UI on malformed data.
- [x] [Review][Patch] Deceptive Mock Data & Cache Poisoning — API returns 200 with mock data on DB error, and caches it with max-age=60.
- [x] [Review][Patch] Sparkline single-element division by zero — Division by zero when data.length === 1.
- [x] [Review][Patch] Negative APY formatting — Renders as +-x.xx% and in green.
- [x] [Review][Patch] Invalid timestamp crash — new Date(invalid) crashes the visualizer component.
- [x] [Review][Patch] Silent Error Swallowing on Frontend — Fetchers return empty arrays on network failure instead of throwing for an Error boundary.
- [x] [Review][Patch] Blocking Full-Page Render & Missing Loading States — Top-level await without <Suspense> or loading.tsx blocks UI.
- [x] [Review][Patch] Conflicting Caching Strategies — Frontend uses cache: 'no-store' while backend sends Cache-Control: max-age=60.
- [x] [Review][Patch] Fragile Table Sorting Logic — Sorting by sparkline7d evaluates array object references.
- [x] [Review][Patch] Inaccessible Visualizations — SVG lacks aria-label or <title>.
- [x] [Review][Defer] Missing Pagination Architecture — Hardcoded limit(50) without cursors. — deferred, pre-existing

### Review Findings (Round 2 — 2026-05-09)

#### Patch (22)

- [x] [Review][Patch] Dead `MOCK_PROTOCOLS`/`MOCK_SMART_MONEY` arrays declared but never referenced (prior review removed mock-fallback path but left arrays). Delete them. — [apps/api/src/market/routes.ts:36-94](apps/api/src/market/routes.ts#L36-L94)
- [x] [Review][Patch] No `error.tsx` boundary for `/markets` route — `fetchProtocols`/`fetchSmartMoney` re-throw on 5xx/timeout/JSON-fail and the throw bubbles to nearest ancestor (likely dashboard-wide), exposing whole route group instead of localized error UI. Create `apps/web/src/app/(dashboard)/markets/error.tsx`. — [apps/web/src/app/(dashboard)/markets/page.tsx:21,37](apps/web/src/app/(dashboard)/markets/page.tsx#L21)
- [x] [Review][Patch] `Cache-Control: public, max-age=60` on auth-gated endpoints lets shared/CDN caches store auth-scoped responses and serve to other callers. Switch to `private, max-age=60`. — [apps/api/src/market/routes.ts:117,146](apps/api/src/market/routes.ts#L117)
- [x] [Review][Patch] `force-dynamic` on the page conflicts with `next: { revalidate: 60 }` on each fetch — `force-dynamic` disables static rendering entirely so revalidate semantics never apply. Pick one: remove `force-dynamic` (let revalidate handle staleness) or remove `revalidate` (live data each request). Recommendation: remove `force-dynamic`. — [apps/web/src/app/(dashboard)/markets/page.tsx:7,18,34](apps/web/src/app/(dashboard)/markets/page.tsx#L7)
- [x] [Review][Patch] Sort comparator silently keeps original order on `null`/`undefined` values; future schema additions will break sort invisibly. Treat null/undefined as sentinel (always last regardless of asc/desc). — [apps/web/src/components/markets/protocols-table.tsx:54-67](apps/web/src/components/markets/protocols-table.tsx#L54-L67)
- [x] [Review][Patch] Sparkline color uses `data[last] >= data[0]` while `change24h` color uses `>= 0` — protocol with `change24h=-0.5` and ascending sparkline shows GREEN sparkline next to RED text, contradicting itself. Drive both from `change24h` sign for consistency. — [apps/web/src/components/markets/protocols-table.tsx:31,144](apps/web/src/components/markets/protocols-table.tsx#L31)
- [x] [Review][Patch] APY 7d/30d format uses `> 0 ? '+' : ''` so value `0` shows `0.00%` (no sign) while color uses `>= 0` (green). Align both to `>= 0` for the prefix. — [apps/web/src/components/markets/protocols-table.tsx:135-138](apps/web/src/components/markets/protocols-table.tsx#L135-L138)
- [x] [Review][Patch] When DB returns rows but every `safeParse` rejects (schema drift), endpoint silently returns `{ items: [] }` indistinguishable from no-data. Add `logger.warn` when `parsed.success === false` so schema drift is visible. — [apps/api/src/market/routes.ts:111-114,140-143](apps/api/src/market/routes.ts#L111-L114)
- [x] [Review][Patch] Smart-money polling uses `router.refresh()` every 60s — re-renders entire dashboard (both protocols + smart-money refetched), doubles backend load. Also `setData` is declared but never called → dead state. Replace with `useQuery` pattern (parity with discover-feed-client) so only smart-money data is refetched and replaced. — [apps/web/src/components/markets/smart-money-visualizer.tsx:14-21](apps/web/src/components/markets/smart-money-visualizer.tsx#L14-L21)
- [x] [Review][Patch] Polling continues when tab hidden — wastes battery + backend quota. Pause via `document.visibilityState` or react-query `refetchOnWindowFocus`. — [apps/web/src/components/markets/smart-money-visualizer.tsx:14](apps/web/src/components/markets/smart-money-visualizer.tsx#L14)
- [x] [Review][Patch] Sparkline `<title>` is constant `"Trend"` for every row — screen reader announces `"Trend"` 50 times. Pass `${row.name} 7-day trend`. — [apps/web/src/components/markets/protocols-table.tsx:23,156](apps/web/src/components/markets/protocols-table.tsx#L23)
- [x] [Review][Patch] `change24h` rendered as `Math.abs(value).toFixed(2)%` next to directional icon — assistive tech reads "1.20%" with no sign. Add sign-aware aria-label or include sign in displayed text. — [apps/web/src/components/markets/protocols-table.tsx:144-148](apps/web/src/components/markets/protocols-table.tsx#L144-L148)
- [x] [Review][Patch] Sparkline points become `NaN,NaN` if any data element is NaN — SVG renders nothing silently. Filter NaN before computing `min`/`max`/points. — [apps/web/src/components/markets/protocols-table.tsx:23-44](apps/web/src/components/markets/protocols-table.tsx#L23-L44)
- [x] [Review][Patch] `formatAddress(addr.slice(0,6) + '...' + addr.slice(-4))` assumes ≥10 chars; `"0x1"` becomes `"0x1...0x1"`. Guard with length check. — [apps/web/src/components/markets/smart-money-visualizer.tsx:22-24](apps/web/src/components/markets/smart-money-visualizer.tsx#L22-L24)
- [x] [Review][Patch] `let protocols`/`let movements` → `const` (already mutated via `.push`, no reassign). — [apps/api/src/market/routes.ts:108,137](apps/api/src/market/routes.ts#L108)
- [x] [Review][Patch] Drizzle `desc(timestamp).limit(50)` without per-protocol dedup returns 50 of the same protocol from latest ticks rather than 50 distinct protocols. Use `DISTINCT ON (id) … ORDER BY id, timestamp DESC` (Postgres) or sub-query with `ROW_NUMBER()`. — [apps/api/src/market/routes.ts:99-106,127-135](apps/api/src/market/routes.ts#L99-L106)
- [x] [Review][Patch] Unit test re-implements `formatCurrency` inline rather than importing from component — tests theatrics, not real logic. Export `formatCurrency`/`formatPct`/sort comparator as pure functions and import in test. — [apps/web/src/components/markets/protocols-table.test.tsx:5-13](apps/web/src/components/markets/protocols-table.test.tsx#L5-L13)
- [x] [Review][Patch] E2E test asserts only headings + table element exists; AC says "đầy đủ data". Add row-count + at-least-one-cell-content assertion. Also add login/auth setup or use storage-state pattern. — [tests/e2e/market-dashboard.spec.ts:9-20](tests/e2e/market-dashboard.spec.ts#L9-L20)
- [x] [Review][Patch] Empty `BACKEND_URL` silently returns `[]` with no log — misconfigured env looks like "no data" instead of config error. Add `logger.warn` (or `console.warn` parity with web stack). — [apps/web/src/app/(dashboard)/markets/page.tsx:15,31](apps/web/src/app/(dashboard)/markets/page.tsx#L15)
- [x] [Review][Patch] `tokenAddress: z.string().nullable()` accepts `null` but not `undefined` — if indexer ever omits the key entirely, `safeParse` rejects and row silently dropped. Use `.nullish()` (allows both null and undefined). — [apps/api/src/market/routes.ts:26](apps/api/src/market/routes.ts#L26)
- [x] [Review][Patch] Test file claims "correctly sort numeric and string data" but assertion is coincidentally satisfied by overlapping ordering of test data — doesn't actually validate sort logic. Rewrite with non-overlapping test data and explicit sort-direction toggles. — [apps/web/src/components/markets/protocols-table.test.tsx:23-27](apps/web/src/components/markets/protocols-table.test.tsx#L23-L27)
- [x] [Review][Patch] `change24h` sort sorts signed value (descending puts `+5.4%` above `-10%`); UX-wise users clicking "biggest movers" expect magnitude. Either rename column header semantics or add a second sort mode. Acceptable as-is; flag for product. — [apps/web/src/components/markets/protocols-table.tsx:62-65](apps/web/src/components/markets/protocols-table.tsx#L62-L65)

#### Defer (3)

- [x] [Review][Defer] Pagination architecture for `/v1/market/protocols` and `/smart-money` — hardcoded `limit(50)` with no offset/cursor. Carry forward from prior review; same codebase-wide gap. (E9, prior-Defer)
- [x] [Review][Defer] Rate limiting on `/v1/market/*` — codebase-wide gap, no router endpoints have rate-limiting today. Defer to cross-cutting middleware story (parity with 2-3 deferred). (Blind+E16)
- [x] [Review][Defer] Production deployment readiness: `INTERNAL_SERVICE_KEY` must be set with valid `epsilon_` prefix in production env or all `/v1/market/*` server-side fetches will 401. Document in `.env.example` + add config-validation warning at boot. (Audit#4, deployment concern not code defect)

#### Dismissed (8)

- "Auth scheme mismatch / Bearer vs apiKeyAuth" — `apiKeyAuth` accepts `Bearer epsilon_*` token; local `INTERNAL_SERVICE_KEY=epsilon_sb_…` matches. False positive. (Blind, Edge F1)
- "URL mismatch — frontend hits `/market/*` but backend mounts `/v1/market/*`" — `BACKEND_URL=http://localhost:8008/v1` already includes `/v1`; resolved URL is `/v1/market/protocols` ✓. False positive. (Audit#1)
- "Route is `/markets` not `/dashboard/markets` per spec" — Next.js route group `(dashboard)` is URL-invisible by design; pattern matches sibling pages (`/discover`, `/files`). Spec wording loose. False positive. (Audit#2)
- "Sparkline column not sortable" — AC1 lists exactly 6 columns, all 6 are sortable; sparkline is decorative `<th>` per AC. (Audit#5)
- "Wallet address truncation in MOCK data" — mocks are dead code (covered by removal patch). (Blind)
- "Missing newline at EOF" / "let → const" cosmetics — trivial style. (Blind, F10 — kept const fix as patch but EOF newline dismissed)
- "useTransition isPending flashes briefly" — UX detail, not a defect. (F13)
- "Sort comparator type widening / logger raw error string" — works in practice / server-side acceptable. (F15, F17)
