# Deferred Work

Items deferred from code reviews — pre-existing issues or hard policy calls that aren't actionable in the current change.

## Deferred from: code review of 1-1-deep-research-tool-perplexity-sonar (2026-05-09)

- Race condition: concurrent requests can both pass credit check before deduction (matches search-web.ts pattern; needs codebase-wide atomic credit reservation).
- No rate limiting on `/deep-research` endpoint (no rate limiting on any router endpoint).
- No structured logging (plain `console.log`/`console.warn` is codebase-wide).
- No idempotency key / duplicate-submission protection (codebase-wide gap).
- Citations array has no length cap (mirrors web_search pattern; pathological responses balloon memory).
- `session_id` accepted but not format-validated (parity with `WebSearchRequestSchema`).
- `max_tokens` cap of 4000 hardcoded without source-of-truth comment.
- Empty `answer` from Perplexity still bills the user (hard policy call: refusal vs error response).
- `requestBody: Record<string, unknown>` in `perplexity.ts` defeats compile-time type safety on the Perplexity API request shape.
- `query.slice(0, 50)` may split UTF-16 surrogate pairs in billing description and logs (parity with tavily route).
- Pricing tiers (0.10/0.25/0.50) lack inline source-of-truth comment tying them to Perplexity's per-request cost.

## Deferred from: code review of 1-2-jit-crypto-data-snapshot (2026-05-09)

- `AbortSignal.timeout` không cover body read trong `defillama.ts` — slow body stream có thể vượt budget; rare edge with Bun fetch.
- Console-based logging cho billing/perf metrics — project-wide convention, cần structured logger ở scope khác.
- In-memory cache + horizontal scaling sẽ divergence (per-process); spec acknowledged, Story 2.1 sẽ Redis-back.
- `new Date(...).getTime()` parse mỗi cache hit — micro-perf optimization (store epoch alongside ISO).
- Negative cache cho upstream failures (thundering herd) — hiện tại traffic thấp, không cần.
- E2E test mocks ignore arguments — schema regression sẽ silent pass; test-quality follow-up.
- `combinedAuth` test stub — auth chưa được integration-tested với Supabase fixture thật.
- Hono body-size limit middleware — project-wide gap, không story-specific.
- `fetched_at` ISO timestamp trong snapshot string — relative time format tốt hơn cho LLM reasoning; UX polish.
- Tool defensive guards (URL parse robustness, args.chain whitespace trim, response.text size cap, args.metrics enum-validate) — low-priority hardening.

## Deferred from: code review of 1-3-ai-generated-code-validation-layer.md (2026-05-09)
- Reckless Type Duplication [core/epsilon-master/opencode/tools/code_validator.ts]
- Free Resource Exhaustion Vector
- Missing Request Rate Limiting
- Block comments `/* */` not skipped in per-line scan — false positives on NatSpec (spec only requires `//`; multiline state tracking out of scope).
- `queueMicrotask` billing fire-and-forget no retry/compensation — pre-existing architectural pattern (parity jit-sync); needs background job queue to fix codebase-wide.
- TOCTOU credit check vs deduction race — pre-existing codebase-wide design; needs atomic credit reservation.
- `formatReport` pipe chars `|` unescaped in markdown table cells — current messages safe; add escaping when rule messages are user-configurable.
- `/code-validator/*` wildcard middleware coverage ambiguity in Hono — same as working jit-sync pattern; verify with integration test.
- Zod `parsed.error.message` raw string exposed in 400 responses — minor UX; use `parsed.error.flatten()` codebase-wide.
- Empty API/tool test stubs (`tests/api/code-validator.spec.ts`, `tests/unit/tools/`) — P0 service tests have real assertions; P1 stubs need real implementation.
- `unchecked-call` rule fires on `.send()` inside string literals — inherent regex limitation; fix requires AST-based parsing.
- `old-pragma` rule ID doesn't match AC2's `integer-overflow` naming — cosmetic traceability gap; rename rule ID if spec alignment is needed.

## Deferred from: code review of 1-4-chainlens-tier-1-and-tier-2-subagent-definitions (2026-05-09)

- F1: Multiple `mode: primary` agents interaction risk — khi chainlens-tier1, chainlens-tier2, general, orchestrator đều có `mode: primary`, OpenCode behavior chưa được document; framework-level question, not story-specific.
- F2: Tier 1 `read: deny` may need revisit — nếu future Tier 1 tools cần file inspection/caching, deny sẽ block; hiện tại jit_sync/deep_research không cần read.

## Deferred from: code review of 1-4-chainlens-tier-1-and-tier-2-subagent-definitions (implementation) (2026-05-09)

- IF1: Tier 2 `bash`+`pty_*` grants unrestricted host shell — sandbox confinement (seccomp, chroot, network namespace) not present in agent files; spec deliberately grants bash for sandbox execution; confinement is Epic 5 infrastructure scope.
- IF2: OpenCode permission deny enforcement model unverifiable — if deny is advisory (UI filter) rather than hard API-level block, a jailbreak or indirect injection could cause Tier 1 to call `code_validator`; runtime behavior must be validated in Task 3.6.
- IF3: Tier 1 `jit_sync` has no credit rate cap at agent layer — loop across many slugs exhausts credits server-side; NFR9 explicitly out-of-scope (AC6); 402 guard exists server-side.

## Deferred from: code review of 3-1-defi-and-market-dashboard-page round 2 (2026-05-09)

- Pagination architecture for `/v1/market/protocols` and `/v1/market/smart-money` — hardcoded `limit(50)` with no offset/cursor. Same gap as discover-feed and onchain-index endpoints. Defer to a single cross-cutting pagination story.
- Rate limiting on `/v1/market/*` — codebase-wide gap, no Hono router endpoints have rate-limiting today. Defer to cross-cutting middleware story (parity with 2-2/2-3 deferred items).
- Production deployment readiness for `INTERNAL_SERVICE_KEY` — server-side fetches in `app/(dashboard)/markets/page.tsx` send `Authorization: Bearer ${INTERNAL_SERVICE_KEY}`. If unset in prod, all `/v1/market/*` server-side fetches will 401. Add boot-time validation warning + document in `.env.example`.

## Deferred from: code review of 2-3-dune-and-nansen-on-chain-index-worker (2026-05-09)

- Rate limiting on `/jit-sync/onchain/:identifier` — codebase-wide gap, no Hono router endpoints have rate-limiting today. Defer to a cross-cutting middleware story.
- Real Dune query IDs / Nansen API paths — content/integration work to be flipped on alongside discover-feed `fetchRawNews` follow-up. Worker ships feature-flagged off; flip flag + replace placeholder URLs in production env when real query IDs land.
- DB pool shutdown ordering with in-flight transactions — `apps/api/src/index.ts` awaits worker stops sequentially but does not coordinate with DB pool close. Needs broader audit of shutdown order across all background services (drainer, discover-feed, onchain-index, tunnel, auto-replenish, etc.). Codebase-wide concern, not story-specific.

## Deferred from: code review of 2-2-ai-generated-discover-feed (2026-05-09)

- Drizzle migration generation `0001_discover_feeds.sql` — written manually at `packages/db/drizzle/0001_discover_feeds.sql` + journal updated. **NOTE**: no `meta/0001_snapshot.json` — drizzle-kit generate will recompute diff from scratch on next run. Run `bunx drizzle-kit generate` from an interactive terminal before the next schema change to regenerate the snapshot.
- ~~Real `fetchRawNews()` implementation~~ — **RESOLVED**: NewsAPI integrated (`NEWS_API_URL` + `NEWS_API_KEY` env vars). Set `DISCOVER_WORKER_ENABLED=true` + `NEWS_API_KEY=<key>` in production .env to enable. Twitter/Nansen/Dune remain future follow-up.

## Deferred from: code review of 3-1-defi-and-market-dashboard-page (2026-05-09)
- Missing Pagination Architecture — Hardcoded limit(50) without cursors.

## Deferred from: code review of 3-2-tradingview-advanced-charting (2026-05-10)

- Server-side MA/RSI computation per spec preference ("nên được thực hiện ở Server hoặc thông qua API") — requires endpoint redesign (return precomputed indicators alongside OHLCV); current implementation does indicator math on main thread. Defer to a follow-up performance story.
- Lazy-init the RSI chart — current code unconditionally creates the RSI chart + subscribes to time-scale sync at mount, even when toggle stays off. Defer as perf optimization.
- Forwarding raw `Authorization` header from inbound request to backend in `apps/web/src/app/(dashboard)/chart/[token]/page.tsx:23-26` — confused-deputy / token-leak risk. Defer to project-wide SSR auth-forwarding policy review (also affects markets page).
- `TradingViewChart` does not refetch when `token` prop changes after mount (`useEffect` only fires when `initialData.length === 0`). Defer — prop is stable in practice on this route.
- Hard-coded hex colors in chart `THEME` (`#94a3b8`, `#60a5fa`, `#f59e0b`, `#a78bfa`, `#10b981`, `#f43f5e`) instead of CSS variables / Tailwind tokens — defer cosmetic alignment with Cyber-Glass palette to a design-token sweep.

## Deferred from: code review of 3-3-generative-ai-chat-widgets (2026-05-10)

- FIFO cache eviction in `widget-cache.ts` is not LRU — hot keys can be evicted ahead of cold ones. OK at MVP scale (200 entries cap), revisit if cache thrash observed.
- `gas_cost_native` returns `"{N} gas"` instead of native currency string; `gas_cost_usd` always null. Requires gas-price oracle integration (CoinGecko ETH price → USD conversion) — out of MVP scope.
- `expected_outcome` always null from Tenderly simulation path — needs parsing of Tenderly response asset-changes / decoded events. Full extraction is a Story 5.x enhancement.
- `slippage_bps` always null — same root cause as expected_outcome (Tenderly response not parsed for swap-specific fields).
- `parseOutput` in 3 tool views silently swallows JSON arrays / primitives — edge case not observed from current upstream APIs (CoinGecko/GoPlus/Tenderly all return objects), revisit if upstream shape changes.

## Deferred from: code review of 5-0-vibe-trading-platform-foundation (2026-05-10)

- **NET_ADMIN sandbox capability allows untrusted code to flush in-container iptables egress whitelist** — current implementation (NET_ADMIN + s6-init iptables) là defense-in-depth, defeatable bởi attacker với code execution inside sandbox. Real security boundary là epsilon-api API key auth + billing limits + sandbox không có credentials cho external services. Proper fix: sandbox network `internal: true` + dedicated egress proxy container whitelisting epsilon-api/vibe-trading destinations. Requires architectural rework — track as separate story (5.0.1 hoặc platform-security follow-up). Current Phase 1 acceptable cho MVP threat model (LLM accident prevention). [apps/api/src/platform/providers/local-docker.ts:992]

- conntrack kernel module dependency unverified — `iptables -m conntrack --ctstate ESTABLISHED,RELATED` requires `nf_conntrack` loaded on host. With `set -e`, missing module aborts script → sandbox bricked với OUTPUT DROP policy + no ACCEPT rules. Add module check + early-fail message [core/init-scripts/95-egress-whitelist.sh:16].
- Volume sharing `vibe-trading-runs` + `vibe-trading-sessions` giữa `vibe-trading` (API) và `vibe-trading-worker` containers → concurrent file writes (session state, run artifacts) without coordination. Race conditions trên backtest job state. VT internal design — address upstream [scripts/compose/docker-compose.yml:13-15,39-41].
- Services không run as non-root user trong compose (no `user:` directive). Vibe-Trading Dockerfile creates `vibe` user nhưng compose có thể override. Sandbox running arbitrary Python execution as root inside container = privilege escalation vector if container escape exists [scripts/compose/docker-compose.yml].
- Worker rebuilds frontend dist mỗi lần build (VT Dockerfile multi-stage includes frontend stage even cho worker — wasted 200MB+ image space và CI time). VT image optimization, separate from Chainlens story [Vibe-Trading/Dockerfile].
- Secret leak via toolbox env command logs — `pool/env-injector.ts` writes full env list to toolbox shell command, secret values may appear in toolbox logs and `console.warn` if call fails. Pre-existing pattern affecting all secrets (TAVILY, EPSILON_TOKEN, etc.). Cross-cutting fix needed [apps/api/src/pool/env-injector.ts:107-109].
- `redis` service no auth, no protected-mode — defense-in-depth. Within Docker network anyone can read/write Celery broker including job payloads (which contain `strategy_code`, `executable_code`). Add `--requirepass` post-MVP [scripts/compose/docker-compose.yml:60-67].

## Deferred from: code review of 3-5-real-ohlcv-chart (2026-05-10)

- HeaderSection cache TTL 60s vs ChartSection OHLC TTL 5min → divergent prices on same page (header current price vs chart last close). Drift max ~0.5%; fix needs unified data source or 5x increase in CoinGecko API load. Known UX limitation.
- Thundering herd on cold cache start — no in-flight singleflight dedup. Parity with token-info pattern. Address as cross-cutting platform improvement (matches Story 3.4 deferred item).
- `resolveCoinIdFromAddress` error-string sniffing for control flow (`e.message.includes('CoinGecko')`). Refactor to typed error subclasses (e.g. `RateLimitError`, `NotFoundError`).
- `TradingViewChart` `token` prop is dead code — component only destructures `data`. Cleanup pass.
- `last_updated: new Date().toISOString()` in OHLCV snapshot is fetch-time, not upstream data-time. CoinGecko `/ohlc` doesn't return upstream timestamp.
- No error boundary around ChartSection — sibling sections (Risk/Holders/Txs) also lack one. Cross-cutting Next.js error boundary story.
- `deductToolCredits` writes DB row on every cache hit despite cost=0 — pure DB latency overhead. Sibling parity, cross-cutting billing optimization.
- `COINGECKO_PLATFORM_MAP` missing chains: `linea`, `scroll`, `mantle`, `zksync`. Add when those chains see token-info traffic.
- Test cleanup: `_clearWidgetCacheForTests` imported but never called in `token-ohlcv.test.ts:8` (mock factory doesn't export it). Dead import.
- `x-cg-demo-api-key` header hardcoded — would silently fail Pro tier (which uses `x-cg-pro-api-key`). No Pro tier configured currently.

## Deferred from: code review of 3-4-token-detail-page (2026-05-10)

- **TTL 24h cho `token-holders` cache không có `?fresh=true` bypass** — `apps/api/src/router/routes/token-holders.ts:461`. Stale top-holders data ở các tokens có mining/mint events thay đổi ranking trong vài phút. Add admin/dev override post-MVP.
- **Loading.tsx + Suspense fallback timing duplication** — `apps/web/src/app/(dashboard)/token/[address]/loading.tsx` vs `page.tsx` Suspense fallbacks → 3-frame flicker on external nav. UX polish, không breaking.
- **Singleflight / billing atomicity cross-cutting hardening** — `checkCredits → fetch → deductToolCredits` pattern là non-atomic + không có in-flight dedup ở 3 routes mới (matches Story 3.3 pattern). Address as platform-level improvement (atomic UPDATE…RETURNING + Map-based singleflight) áp dụng cho tất cả routes.

## Deferred from: code review of 5-2-backtest-strategy-editor-monaco-editor (2026-05-11)

- **No cross-tab localStorage sync** — Hai tab cùng user → last write wins per debounced save. No `storage` event listener. `apps/web/src/components/backtest/strategy-editor.tsx:282-303`
- **`loadDraft` race with in-flight edits** — User gõ trong khi auth load → khi user resolve, draft load overwrites in-flight content. Effect deps `[user?.id]`. `apps/web/src/components/backtest/strategy-editor.tsx:320-325`
- **AC3 inline 400 field-level highlighting** — Spec qualifies "nếu có thể infer". No CodeMirror linter integration, scroll-to, hoặc underline trên Zod error path. `apps/web/src/components/backtest/strategy-editor.tsx`
- **AbortSignal listener accumulates per pollRun iteration** — `{ once: true }` listener registered per loop tick; chỉ removed khi fired. `apps/web/src/lib/backtest-api.ts:869-879`
- **No payload size guard on submitBacktest** — Large paste triggers synchronous JSON5.parse per keystroke. Backend may 413. `apps/web/src/lib/backtest-api.ts:813`
- **No `beforeunload` warning during executing state** — User close tab mid-poll → orphaned job, no user signal.
- **Test isolation: cached module re-import** — `await import('@/lib/backtest-api')` per-test returns same instance; mock works via `globalThis.fetch` reassignment only. `apps/web/src/lib/__tests__/backtest-api.test.ts:611-689`
- **JSON5→strict-JSON round-trip not explicitly tested** — Currently works by accident via JS object materialization + `JSON.stringify`. Add regression test for default template containing comments.
- **7-day localStorage expiry silently purges** — User load tab on day 8 → silently sees template. No "draft expired" notice.
- **PAGE_COMPONENTS lazy() wrapping dynamic({ssr:false}) page** — `apps/web/src/components/tabs/page-tab-content.tsx:534-536`. Fragile composition; works in current Next.js but may break with future prefetch changes.
- **No CSRF assertion / same-origin guard** — Relies on Supabase JWT bearer entirely. Out of scope but worth tracking.

## Deferred from: code review of 5-3-backtest-results-visualizer (2026-05-11)

- **Generic error.message leaked to UI error banner** — `setError({ status: 503, message: err.message })` exposes internal stack/URL details. Pre-existing 5.2 pattern. `apps/web/src/components/backtest/strategy-editor.tsx:311`
- **`hasBenchmark` rejects all-negative benchmark series** — theoretical edge case; VT will never produce all-negative equity (capital starts positive). `apps/web/src/components/backtest/result-visualizer.utils.ts:93-94`
- **No-auth-token test path omitted from streamRun tests** — `getSupabaseAccessTokenWithRetry()` exponential-backoff causes 5s+ test timeout under real timers; documented inline.
- **jobId regex permits leading dash** — `/^[A-Za-z0-9_-]{1,128}$/` allows `--foo`. Pre-existing pattern at GET /runs/:jobId line 105.
- **No concurrent-stream dedup per (account, jobId)** — same job opened twice doubles VT polling load. Not in AC scope; flag for capacity follow-up.
- **DOM render tests for `<BacktestResultVisualizer>` (AC4 deviation)** — apps/web has no @testing-library/react / happy-dom / jsdom infra. After review patch P8, `classifyResultBranch()` is the single source of branch decisions and is fully tested (45 tests). Adding DOM testing infra solely for this component is over-engineering. File follow-up story to install testing infra once a second component needs DOM tests.
## Deferred from: code review of 6-1-extension-core-and-token-auto-detection.md (2026-05-11)
- Open Shadow DOM — Acceptable for internal extensions, deferred.
- Fragile Pointer Events — CSS pointer events toggle might be brittle, deferred.
- Dirty Submodule — Pre-existing submodule state, deferred.

## Deferred from: code review of 6-1-extension-core-and-token-auto-detection.md round 2 (2026-05-11)
- process.env runtime vs build-time in canonical.ts — pre-existing; bundler inlines at build time; silent fallback to prod URL is acceptable behavior.
- Tooltip off-screen rendering — viewport clamping not required by AC2; UX polish for a future pass.

## Deferred from: code review of 5-4-contextual-backtest-integration round 2 (2026-05-11)
- Component/integration tests for ContextualBacktestTrigger and ContextualBacktestModal — apps/web has no @testing-library/react / jsdom infra (parity with Story 5.3 defer). Bundle with the testing-infra follow-up story.
- Monaco editor fixed height (480px) inside modal — may overflow on small viewports (mobile/tablet). UX polish for responsive editor sizing inside Dialog wrapper.
- `isStrategy` substring sniff false-positive risk on prose code blocks mentioning `simulation_environment` and `context_rules` — intentional trade-off (speed > correctness for marginal misclassifications); already deferred Round 1.
## Deferred from: code review of 5-4-contextual-backtest-integration.md (2026-05-09)
- Brittle strategy detection logic: raw string .includes used in isStrategy. Deferred because string manipulation is much faster inside markdown rendering than parsing JSON for every block.
- Silent JSON parsing failure masking: JSON parsing swallowed without log. Deferred intentionally to fail gracefully with default asset/timeframes if user enters partial JSON.
- React key remounting anti-pattern: editorKey used to trigger remount. Deferred as this is an acceptable workaround for resetting complex unmanaged internal state in Monaco editor.
- Obtrusive UI overlay for trigger button: absolute placement. Deferred as it's transparent (opacity-0) until hovered, mitigating obtrusiveness.
- Global performance drag in markdown renderer: trigger injected in generic component. Deferred because logic is fast and low-impact.
- Hardcoded defaults in TradingViewChart: defaults to 4h and BTC-USDT. Deferred, acceptable for this MVP/Story boundary.

## Deferred from: code review of 2-1-crypto-data-worker-with-bullmq (2026-05-14)

- `rawSnapshot` column always null [crypto-worker.ts:57] — reserved for future use, documented in Dev Notes; either remove or populate later.
- `stopCryptoWorker` no timeout on `worker.close()` [crypto-worker.ts:144-152] — hang risk during shutdown if job in-flight; add `Promise.race` with timeout.
- Multiple horizontal worker instances → 2x DeFiLlama requests on same slug [crypto-worker.ts:108-116] — operator-level concern; BullMQ row-level lock + Postgres upsert prevents data corruption but wastes API budget.
- DB cache hit but chain filter mismatch (worker stores aggregate TVL, JIT route ignores `chain=` param in DB lookup) [jit-sync.ts:63-72 + crypto-worker.ts:37] — chain-filtered request gets stale all-chain TVL; worker should store per-chain rows OR JIT route should skip db_cache when chain is set.
- `db_cache` path charges full credits same as live fetch [jit-sync.ts:101] — product decision needed; if intent is DB-cached cheaper, requires config knob.
- Empty `protocol_watchlist` → silent no-op success [crypto-worker.ts:29-32] — operator monitoring concern; add warn log if active count is 0.
- AC1 Redis service not added to `core/docker/docker-compose.dev.yml` (production `scripts/compose/docker-compose.yml` already has it) — document gap.
- `_journal.json` missing trailing newline [packages/db/drizzle/meta/_journal.json:275] — cosmetic.
- `updatedAt: new Date()` set explicitly instead of relying on DB `defaultNow()` trigger [crypto-worker.ts:69] — theoretical clock skew issue between app and DB host.
