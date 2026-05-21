# Deferred Work

Items deferred from code reviews — pre-existing issues or hard policy calls that aren't actionable in the current change.

## Deferred from: code review of story-11.1 (2026-05-20)

- **`react-diff-viewer-continued@3.4.0` peer `react: ^18`** — `apps/web/package.json:224`. Class component nội bộ; chưa thấy UNSAFE_* lifecycle gây crash với React 19, nhưng peer dep gap thực. Track upgrade hoặc replacement (`@monaco-editor/react` cho diff view) ở story FE-cleanup riêng.
- **`@novu/nextjs@3.13.0` peer dep + dead dep** — `apps/web/package.json:47`. Không có import nào trong `apps/web/src` dùng package này. Xoá ở story cleanup deps riêng (cùng `@novu/notification-center`).
- **`@cyntler/react-doc-viewer@1.17.1` React 19 compat unverified** — `apps/web/package.json:29`. `peerDependencies: { react: ">=17.0.0" }` match v19 theo semver nhưng dùng class component nội bộ. Smoke test PPTX khi có usage.
- **`@logtail/next withBetterStack` production-only path chưa verified với Next 16** — `apps/web/next.config.ts:131`. Local `bun run dev` không trigger wrapper. Verify ở deploy preview.
- **`eslint-config-next@16` rule changes chưa verified** — `apps/web/eslint.config.mjs`. Chạy `next lint` khi CI fast-tier expand để catch deprecated/renamed rules.
- **AC4 Build pass — không có CI artifact** — Dev Agent Record claim "build pass với env runtime tối thiểu" nhưng không có log. Verify lại sau khi fix AC3 (forwardRef).
- **AC5 Tests pass — claim 248/248 không có evidence** — Verify lại sau khi fix AC3.
- **`cmdk` runtime warnings từ `forwardRef` nội bộ** — `apps/web/src/components/ui/command.tsx`. Phụ thuộc decision upgrade `cmdk@1.x`. Nếu chọn pin v0.2.1, accept warnings và defer cho story upgrade dep batch riêng.

## Deferred from: Story 5.5.1 (2026-05-19)

- **Sunset `run_swarm` MCP tool by 2026-06-19.** Story 5.5.1 deprecates the synchronous tool via proxy 410 Gone + docstring marker. Separate cleanup story Q3 should remove the tool body from `Vibe-Trading/agent/mcp_server.py` (after the 30-day grace window expires) and drop the `vt_mcp_run_swarm` `TOOL_PRICING` entry in `apps/api/src/config.ts`. Until then the entry is kept so direct-sandbox-bypass test rigs still bill correctly.
- **Other long-running tools sharing the same 30s mismatch** — `backtest`, `factor_analysis`, `run_shadow_backtest`, `render_shadow_report` work today with typical inputs <30s, but follow the same architectural defect as `run_swarm`. Track a follow-up story to migrate them to the async start/poll/finalize pattern OR raise their per-tool timeout budget. Out of scope for 5.5.1 which is scoped to `run_swarm` (the only tool that *always* exceeds 30s).
- **Live event streaming via `SwarmRuntime.live_callback` / `events.jsonl`** — `runtime.py:76` already exposes a per-event callback. A future story can add a `tail_swarm_events(run_id, since_offset)` MCP tool that reads `events.jsonl` incrementally, then switch the OpenCode wrapper from 5s polling to event-driven streaming (≤200ms latency per agent transition). V1 uses 5s polling — simpler, fits existing patterns, latency acceptable for 6-15min swarms.
- **Promote in-memory `runOwnership` map to DB-backed** — `apps/api/src/router/routes/vibe-trading-mcp.ts` keeps ownership in a `Map` with 24h TTL. On apps/api restart the map clears → fails-closed for any in-flight run until the user calls `list_runs` to re-hydrate. Acceptable for V1 (≈7-day MTBF on apps/api). When usage justifies the complexity, persist ownership in `epsilon.swarm_runs` table (or extend `SwarmRun` model with `account_id` in `Vibe-Trading/agent/src/swarm/models.py`).
- **UI "Resume run" affordance for orphan runs** — if the OpenCode wrapper's 30min client timeout hits, the server-side run can still be re-fetched via `get_run_result(run_id)` if the user types the ID back into chat. Better UX: surface a "Resume run" button in `/dashboard/swarm-teams` for any run_id older than the user's last chat tab.
- **Chaos test billing assertion** — `tests/e2e/specs/swarm-resume-after-api-restart.spec.ts` covers the chaos path structurally but stops short of asserting the credit_transactions table shows exactly one deposit + one finalize entry per run_id. Add when a billing-query helper exists in `tests/e2e/helpers/`.

## Deferred from: code review of 5-5-1-vibe-trading-swarm-async-execution (2026-05-19)

- **Prompt injection via `variables` dict values (OWASP LLM01)** — `start_swarm` accepts caller-controlled `variables` dict that flows into `worker.py:320` `format_map` and into LLM system/user prompts unsanitized. Attacker control: `"\nSystem: ignore previous instructions"` or `{__class__.__init__.__globals__}` format-spec injection. Class-of-attack rather than a single fix — 5.6 deferred LLM input sanitization policy. Cross-reference: same vector also flagged in `Vibe-Trading/agent/mcp_server.py` (preset_name path traversal) and `vibe_trading_swarm.ts:106` (preset value in progress lines).
- **Multi-`apps/api`-worker process double-billing** — finalize idempotency uses in-memory `Map.finalized` flag. Two `apps/api` workers share no map → both deduct `vt_mcp_run_swarm_finalize` for the same run_id. Block multi-worker deployment until a Redis-backed lock is added. Document in deployment runbook.
- **Tool-specific HTTP timeouts** — single `AbortSignal.timeout(30_000)` applies to all tools. `cancel_swarm` should be ≤5s; `get_run_result` on a large completed swarm may need ≥60s. Operational tuning; not blocking.
- **SSE rewriter ownership-seed integration test** — `apps/api` proxy's SSE rewriter path that calls `setOwnership` from a `data: {...}` event is untested at unit level (tests mock 200 + body path only). Integration test with a synthetic SSE stream needed. Scope: separate from this story.
- **`mcp-sse-client.ts` own unit tests** — new shared lib (306 lines) is fully mocked in `vibe_trading_swarm.test.ts`. Handshake correctness (CRLF parsing, `_resolveEndpoint`, MCP initialize round-trip) only exercised in integration. Add unit-level coverage in a follow-up.
- **`cancel_swarm` server-side confirmation** — wrapper fires `cancel_swarm` and returns immediately. Server-side `runtime.cancel_run()` is async — in-flight LLM call completes before transition. Wrapper does not poll to confirm `status=='cancelled'`. By-design per AC5b, but a confirmation poll would reduce LLM-token billing on user cancel.
- **Vibe-Trading async swarm tests hit real disk + LLM** — `tests/test_async_swarm_mcp_tools.py` doesn't mock `SwarmRuntime` / `SwarmStore` / LLM provider. `<2s` budget may flake on loaded CI runners; `test_start_then_cancel_roundtrip` requires `LANGCHAIN_*` env vars. Refactor to inject-mock at unit tier; keep real-IO behind `@pytest.mark.integration` in a separate run.
- **`factor_analysis` cleanup batch (5 issues)** — pre-existing tool, not Story 5.5.1 scope: CSV files in `/tmp/factor_analysis_<ts>/` never cleaned (`mcp_server.py:242-249`); same-second TOCTOU dir collision; bare `except: continue` swallows all errors including `KeyboardInterrupt`; unbounded `codes` list (no per-call limit); `start_date`/`end_date` strings forwarded to yfinance without format validation.
- **Stop button on `/dashboard/swarm-teams` run rows (AC5b deviation)** — Story 5.6 page has no in-flight run row UI to attach a Stop affordance to. The OpenCode chat-level Stop affordance handles cancel correctly via `ctx.abort` → `cancel_swarm`. AC5b text mentioning "Stop button on any in-flight run row" predates 5.6 final UI; add the affordance in a future swarm-teams UI iteration if needed.
- **Out-of-scope sidebar/tabs UI changes untested** — `apps/web/src/components/sidebar/sidebar-left.tsx` adds `summarizeConfigProblem` helper (legitimate bug fix for sandbox `/config/status` overflow). `page-tab-content.tsx` adds `SwarmTeamsPage` + `ShadowAccountPage` lazy registrations (required by AC4.5 for swarm-teams reachability). Both ship without tests. Add coverage in a UI-test follow-up.

## Deferred from: code review of 5-0-3-sandbox-token-lifecycle-db-canonical (2026-05-18)

- Task 6.4 WebSocket `{ type: 'reauth', newKeyVersion: N }` signal to active sandbox connections — spec marks `[ ]`, explicitly deferred to future PR. AC4 partially unmet without it.
- AC5 PROVISIONING_KEY 24h TTL — spec language ambiguous: AC5 says "HMAC-based with 24h TTL" but Dev Notes say "kept in DB for re-bootstrap if container restarts mid-life" (implies key valid for sandbox lifetime). Defer until threat model is clarified.
- AC5 leaked-key abuse detection (auto-invalidate + force re-provision on suspicious bootstrap pulls from unexpected IPs) — partial mitigation via rate limiter; full IP anomaly detection out-of-scope for this PR.
- Task 6.1 file-location deviation: rotation route lives at `apps/api/src/admin/index.ts` instead of spec-listed `apps/api/src/router/routes/admin-rotate-sandbox-token.ts` — functionally equivalent; tests already match the implementation location. Low value to refactor.
- `serviceKey` stored as plaintext in `epsilon.sandboxes.config` JSONB (Blind Hunter F2) — out-of-scope for 5.0.3; same pattern existed in 5.0.2 and prior. Track as a separate hardening story: "encrypt sandbox.config secrets at rest" (depends on Story 5.7 BYOK key derivation).

## Deferred from: code review of 5-0-2-sandbox-token-sync-reliability (2026-05-18)

- `RECENT_ALERTS` map in [epsilon-user-middleware.ts:40-55] unbounded under sustained attack with >256 distinct sandboxIds. Bound to 512 LRU. Narrow in single-process Bun + 5-min debounce, but worth fixing in observability hardening pass.
- Dynamic `import('..')` for `buildSignedUserContextHeader` in [local-preview.ts:325-326] may resolve to `undefined` on cold-start circular-dep race. Document rationale; if smoke confirms it works, leave as-is.
- Drizzle `db.transaction` + `createApiKey` (which uses module-level `db`) can deadlock on Supabase free-tier `pool_size=5` under burst. Same root cause as D1 (createApiKey orphan) — bundle with that fix.
- Provider dynamic `import('../providers')` in error handler (sandbox-provisioner.ts:155) may throw under `bun --hot` reload mid-flight. Rare race.
- Concurrent drift reconcile path can overwrite DB with stale container key in narrow window (two requests both pass circuit check simultaneously). Idempotent if no external party concurrently rotates.
- `.env` sync silently skipped when `ENV_MODE=staging` + local Docker hybrid (Story 5.0.3 territory). Document.

## Deferred from: code review of 5-0-1-shadow-account-volume-hotfix (2026-05-18)

- Non-atomic `Path.write_text` on shared shadow_accounts volume can corrupt JSON profiles when vibe-trading + worker write concurrently. Vibe-Trading `storage.py:68-73`. Pre-existing storage logic. Fix needs tmpfile+rename or `FileLock` — track as VT shadow-storage hardening.
- `reporter.py:176` embeds `file://` URIs in HTML reports → broken when api_server delivers report over HTTP (PDF path via weasyprint works). Pre-existing reporter bug.
- Worker `HOME` env var not pinned in compose `vibe-trading-worker` block → Celery subprocesses may resolve `Path.home()` to `/` or raise `RuntimeError`. Pre-existing infrastructure pattern; applies to all `Path.home()` callsites.
- `find_by_journal_hash` glob+load in `storage.py:118-128` silently drops files on `JSONDecodeError/OSError` → returns `None` for valid prior profiles, triggering duplicate `extract_shadow_profile` runs. Pre-existing storage logic.
- Volume name collision risk when `COMPOSE_PROJECT_NAME` is not pinned — volume namespace is derived from compose-file directory name. Applies to all volumes equally; first user-identity-level persistent data (shadow profiles) makes the risk more material. Track as compose-project-name pinning task.
- No volume driver/backup policy on new volumes (or existing `vibe-trading-runs`, `redis-data`). Track as separate backup story.

## Deferred from: code review of 5-6-shadow-account-swarm-ui (2026-05-18)

- `sessionStorage.setItem` calls in `shadow-account.utils.ts` + `swarm-teams.utils.ts` không có try/catch cho `QuotaExceededError`. Edge case rất hiếm; `session-chat.tsx` đã có retry loop hấp thụ một phần. Cần policy chung về client storage error handling.
- Double-click guard cho "Analyze with AI" / "Run" button dựa trên React state (`isAnalyzing`, `running`) — async state update có thể fire 2 lần nếu user click siêu nhanh. Functional impact: 2 session orphan + 2 navigation race. Pattern fix: `useRef` lock đồng bộ — nhưng impact thực tế thấp.
- Prompt injection qua user-controlled `vars` (Swarm Teams) và `uploadedPath` (Shadow Account) — input được embed trực tiếp vào LLM prompt. JSON.stringify giúp escape JSON syntax nhưng không ngăn được "ignore previous instructions" attacks. Class-of-attack rộng hơn 1 story; cần policy chung cho LLM input sanitization (OWASP LLM01).

## Deferred from: code review of 2-3-2-financial-statement-data-token-terminal (2026-05-18)

- Module-level mutable `lastReqAt` throttle in `apps/api/src/router/services/token-terminal.ts:6-12` is TOCTOU under concurrent callers (route loop + worker simultaneously). Same pattern in other service throttles; partially mitigated once interval is raised to ~1100ms. Track for cross-service throttle harmonization.
- `processSnapshots` SQL `inArray(metricId, [])` evaluates to false when allowlist is empty → all-null snapshots written silently. Edge case only when operator clears `TOKEN_TERMINAL_METRICS`; guard with early-return.
- No FK constraint on `token_terminal_project_metrics.project_id` referencing `token_terminal_projects`. Repo convention is mostly soft references in epsilon schema; track for schema-hardening pass.
- `processMetadata` does serial inserts (N round-trips per metric/project). Performance not correctness; daily cadence with ~200 projects is acceptable. Batch with chunked `INSERT ... ON CONFLICT` if cron window becomes tight.

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

## Deferred from: code review of 3-4-token-detail-page (2026-05-17)

- AC1 path drift — files at `apps/web/src/app/(dashboard)/dashboard/token/[address]/` vs spec File List `apps/web/src/app/(dashboard)/token/[address]/`; URL correct at runtime, doc-only mismatch.
- `streaming.test.tsx` missing — Bun cannot reliably render Suspense streams; deferred to Story 3.4.5 Playwright scope.
- PATCH-33 (Story 3.3 regression run) — process claim with no artifact; re-run `bun test apps/web/src/components/thread/tool-views/opencode/__tests__/OcContractRiskToolView.test.ts` before merge.
- Task 1 — `normalizeAddress` not adopted inside `services/contract-risk.ts`; inline `.toLowerCase()` semantically equivalent for EVM.
- Dual canonical-URL env vars (`CHAINLENS_BASE_URL` extension vs `NEXT_PUBLIC_APP_URL` web) — defer until extension+web env unified post-MVP.
- Shadow DOM `.matches(':hover')` reliability for extension tooltip — defer to Story 6.x cross-browser E2E.

## Deferred from: code review of 2-1-1-mempool-sniffing-mev-tracking (2026-05-17)

- WebSocket exponential backoff with jitter cap — fix in Story 8.5 production-grade reliability scope.
- Provider failover (multiple WSS URLs) — defer to Epic 2.x infra story.
- `unknown_large_tx` design noise (wallet-to-wallet large native transfers flooding feed at typical thresholds) — tune post-MVP.
- `tx.value='0x'` empty-hex edge — current fail-closed behavior correct; not real-world provider output.
- `TOOL_TIMEOUT_MS = 5000` deviation from CLAUDE.md 1.5s typical — document rationale (mempool query may need 5s on cold cache).

## Deferred from: code review of 5-0-5-ci-workflow-bun-test-playwright (2026-05-18)

- `pnpm-store` cache sem `restore-keys` fallback — melhoria de performance, não afeta corretude. Adicionar `restore-keys: pnpm-${{ runner.os }}-` em ambos os workflows quando houver oportunidade.
- `pkill -f "bun run.*apps/api"` pattern pode não matar processo correto — risco baixo em runner efêmero (processo morre com o runner). Considerar `kill $(lsof -ti:8008)` como alternativa mais precisa.
- `tail -3` no Summary trunca nomes de testes — cosmético. Considerar `grep "(fail)" /tmp/api-results.txt | head -20` para mostrar nomes dos testes que falharam.
- `continue-on-error: true` mascara falhas de infra (OOM, disk) — design tradeoff intencional para não bloquear merge. Considerar threshold check (total tests < 400 → alerta) em story futura.

## Deferred from: code review of 5-9-multi-strategy-backtest-comparison (2026-05-20)

- AC2 per-tab Zod error message uses array index, not `tab_id` — polish for client-side error mapping. [apps/api/src/router/routes/vibe-trading.ts:137-143]
- AC1 `quotaWarnedRef` warn-once-per-session toast not implemented — silent fallback works, only user notice missing. [apps/web/src/components/backtest/multi-strategy-editor.tsx:81-87]
- AC4 timeout banner triggers on any-timeout vs spec's all-timeout — current behavior arguably more informative; spec is ambiguous. [apps/web/src/components/backtest/comparison-visualizer.tsx:84]
- AC2 outer `session_id` not forwarded into per-job VT payload — observability gap, not user-visible. [apps/api/src/router/routes/vibe-trading.ts:170-172]
- AC2 response shape missing `run_id` per submission — requires service-layer `SubmitJobResponse` change; frontend already treats as optional. [apps/api/src/router/routes/vibe-trading.ts:200-214]

## Deferred from: code review of 5-9-multi-strategy-backtest-comparison (2026-05-21)

- No per-account multi-backtest rate limit — user can fire 4 × 5-strategy requests = 20 concurrent VT submissions. Same class as `/jobs` abuse. System-wide rate-limit story needed. [apps/api/src/router/routes/vibe-trading.ts:136-269]
- `pollRun` storm during all-timeout — 5 concurrent strategies × 180s × 2.5s interval = ~360 fetches in 3min. Coordinated backoff needed but acceptable at current scale. [apps/web/src/components/backtest/multi-strategy-editor.tsx:280]
- sessionStorage 7-day TTL is dead code — TTL only meaningful for localStorage; either change storage or remove TTL constant. [apps/web/src/components/backtest/multi-strategy-editor.tsx:977-985]
- `STREAM_BUDGET_MS` tripled (60s → 180s) — intentional per spec; observe load impact in future capacity review.
- `bestByKey` arbitrary "winner" when all rows share same value (e.g., all-zero drawdown) — cosmetic only. [apps/web/src/components/backtest/comparison-visualizer.tsx:471-474]
- Stream-open loop uses `Promise.all` (each iteration own try/catch) — optical guardrail violation but semantically equivalent to `allSettled`. [apps/web/src/components/backtest/multi-strategy-editor.tsx:1211]

## Deferred from: code review of think-mode-infra (2026-05-21)

- **D1 — Pool counters reset on deploy (thundering herd on list[0])** — `freeIdx`, `premiumIdx`, `freeThinkIdx`, `premiumThinkIdx` are module-level integers; every `apps/api` restart routes the first N calls to `list[0]` until traffic rotates them. At current scale (single process, low RPS) impact is negligible, but with ≥2 pool models the skew is observable in logs. Fix: randomize starting offset via `Math.floor(Math.random() * list.length)` at module init, or store counter in Redis. Defer to platform-hardening story. [`apps/api/src/router/services/model-pool.ts`]

- **D2 — `validatePoolConfig()` doesn't cross-check `ANTHROPIC_PROXY_URL` presence** — if `FREE_THINK_MODEL_POOL` or `PREMIUM_THINK_MODEL_POOL` is set but `ANTHROPIC_PROXY_URL` is absent, server boots without warning and every think request gets a runtime `[LLM] Think mode requires ANTHROPIC_PROXY_URL` error. Boot-time validation should emit a `console.warn` when a think pool is non-empty but the proxy URL is unset. [`apps/api/src/router/services/model-pool.ts:validatePoolConfig`]

- **D3 — `validatePoolConfig()` skips `FREE_MODEL_POOL` / `PREMIUM_MODEL_POOL`** — the function validates think-mode pools but not the base free/premium pools. An empty `FREE_MODEL_POOL` silently causes 503 on every non-think request. Extend validation to cover all four pool env vars. [`apps/api/src/router/services/model-pool.ts:validatePoolConfig`]

- **D4 — Think response `extractUsage()` not integration-tested against real chainlens-proxy** — F2 added `input_tokens`/`output_tokens` fallback fields, but unit tests mock `response.json()`. If chainlens-proxy ever returns a streaming SSE body on the think endpoint (format change upstream), `response.json()` throws and billing silently fails. Add an integration smoke test when chainlens-proxy is deployed. [`apps/api/src/router/services/llm.ts:extractUsage`]

- **D5 — Forced non-streaming (F3) unverified end-to-end with billing** — `apps/api/src/router/routes/llm.ts` forces `stream: false` for think requests and switches to `deductLLMCredits(... usage)` path. The `usage` field from a non-streaming Anthropic response includes `reasoning_tokens` which are not currently counted in `calculateCost()` (only `promptTokens` + `completionTokens`). Reasoning tokens are billed at input rate by Anthropic — verify billing accuracy once chainlens-proxy is live. [`apps/api/src/router/services/llm.ts:calculateCost`]

- **D6 — Think model `openrouterId` field is misleading** — `epsilon/free-think` and `epsilon/premium-think` entries in `MODELS` have `openrouterId: 'anthropic/...'` which is never used (think requests bypass OpenRouter entirely via `proxyToThinkEndpoint`). The field could confuse future devs or cause accidental OpenRouter routing if pool alias detection fails. Either remove `openrouterId` for think aliases or add a comment. [`apps/api/src/router/config/models.ts`]

- **D7 — Think pricing entries are placeholders** — `epsilon/free-think` and `epsilon/premium-think` in `MODELS` carry the same `inputPer1M`/`outputPer1M` as their base model counterparts. Anthropic charges reasoning tokens at input rate, capped by `budget_tokens` × input price. Until reasoning-token billing is wired into `calculateCost()`, the `TOOL_PRICING` entry cost effectively undercounts think call cost. Document as placeholder; revisit when chainlens-proxy usage data is available. [`apps/api/src/router/config/models.ts`]

## Deferred from: session 2026-05-21 — Think Mode UI & Model Picker Simplification

**Quyết định kiến trúc**: Giữ UI đơn giản (Free | Premium), backend tự routing. Think mode infra đã implement nhưng chưa expose UI.

**Đã implement (backend, không expose UI):**
- `apps/api/src/router/services/model-pool.ts`: `PoolType` mở rộng thành 4 values (`'free' | 'premium' | 'free-think' | 'premium-think'`). Helpers mới: `isThinkPool()`, `thinkBudgetTokens()`, `freeThinkIdx`, `premiumThinkIdx`
- `apps/api/src/router/services/llm.ts`: `proxyToThinkEndpoint()` — route think requests tới `ANTHROPIC_PROXY_URL` (chainlens-proxy) với `thinking: { type: 'enabled', budget_tokens: N }` + `temperature: 1`
- `apps/api/src/router/routes/llm.ts`: POOL_ALIAS mở rộng thành 4 entries; conditional routing `thinkPool ? proxyToThinkEndpoint : proxyToOpenRouter`
- `apps/api/src/config.ts`: 4 env vars mới: `FREE_THINK_MODEL_POOL`, `PREMIUM_THINK_MODEL_POOL`, `FREE_THINK_BUDGET_TOKENS` (default 5000), `PREMIUM_THINK_BUDGET_TOKENS` (default 10000)
- `apps/api/.env`: env vars đã populate (`FREE_THINK_MODEL_POOL=claude-haiku-4-5-20251001`, `PREMIUM_THINK_MODEL_POOL=claude-sonnet-4-6`)
- `apps/api/src/router/config/models.ts`: 2 virtual model entries `epsilon/free-think` + `epsilon/premium-think` (placeholder pricing)

**Không expose UI (intentional):**
- `core/epsilon-master/opencode/opencode.jsonc`: chỉ có `epsilon/free` và `epsilon/premium` — `free-think`/`premium-think` đã bị remove
- Reason: chainlens-proxy (port 3002) không chạy local + v98store silently drops `thinking` param → feature broken nếu expose

**Blockers để activate think mode:**
1. Deploy `apps/chainlens-proxy` (port 3002) — hoặc configure `ANTHROPIC_PROXY_URL` trỏ tới service đang chạy
2. Verify upstream (v98store hoặc Anthropic direct) support `thinking: { type: 'enabled', budget_tokens: N }` và trả về non-zero `reasoning_tokens`
3. Uncomment `free-think` / `premium-think` trong `opencode.jsonc` epsilon provider models

**Implementation delta so với Story 7.1 spec:**
- Spec: `thinkingEnabled: boolean` flag trong deductTokens. Actual: separate PoolType values (`free-think`/`premium-think`) — semantic equivalent nhưng routing-first thay vì billing-first. Billing vẫn dùng boolean `thinkingEnabled` (AC20). Không có conflict — billing layer nhận `thinkingEnabled=true` từ pool type detection.

## Deferred from: code review of 7-1-internal-credits-system (2026-05-21)

- **W1 — `/dashboard/billing` route doesn't exist** [apps/web/src/app/(home)/pricing/page.tsx:144-146] — pricing CTA links to `/dashboard/billing?upgrade=tierN` but route doesn't exist (404 on click). Belongs to a future frontend story. Workaround until then: CTA can call `/v1/billing/subscriptions/upgrade` API directly and redirect to Stripe `checkoutUrl`. Track as new story.
- **W2 — AC16 402 `insufficient_tokens` response wrapper missing** — story 7.1 scope boundary explicitly says "KHÔNG wire `deductTokens()` vào LLM call chain — transition story riêng". The 402 HTTP wrapper belongs in that LLM-chain wiring story, not here.

## Deferred from: code review of 5-9-1-conversational-multi-backtest (2026-05-21)

- E2E spec for `chat-multi-backtest-agent` is smoke-quality, gated `BACKTEST_E2E_ENABLED=true`, relies on real LLM invoking the tool from Vietnamese NL — non-deterministic; needs mocking infra. [tests/e2e/specs/chat-multi-backtest-agent.spec.ts]
- Source-string sniffing tests (parity Story 5.9 backend tests) give false confidence — behavioral regressions pass if source text unchanged. [apps/api/src/__tests__/unit/vibe-trading-propose-multi-route.test.ts]
- `parsedResultSchema` strict enum on `caller_tier` — future tier additions break proposal rendering. [OcProposeBacktestMultiToolView.tsx:25]
- Revise path silently swaps `strategy_family` — user asks to revise SMA strat → service returns breakout under same tab_id. UX polish needed. [apps/api/src/router/services/vibe-trading.ts:123-132]
- `proposeBacktestStrategies` is synchronous — combined with bare-catch, hides programming bugs. Small N OK at current scale. [apps/api/src/router/services/vibe-trading.ts:487-527]
- Test files read source via `process.cwd()` — works from apps/api only; use `import.meta.dir` for portability. [apps/api/src/__tests__/unit/vibe-trading-propose-multi-route.test.ts:6-11]
- Tests mock `sanitizeUpstreamErr` as identity — doesn't verify real sanitize strips tokens/URLs in production. [core/epsilon-master/opencode/tools/__tests__/propose_backtest_multi.test.ts:13-15]
