# Story 2.3.2: Financial Statement Data via Token Terminal

Status: done

Epic: 2 — Crypto Data Infrastructure
Created: 2026-05-17
FRs: FR2, FR5, FR8, FR9
NFRs: NFR4, NFR5, NFR8, NFR9
ARs: AR1, AR2, AR3, AR5, AR6, AR8

**Parent:** Story 2.3 (Dune & Nansen On-Chain Index Worker) — `done`. Story 2.3.2 adds standardized protocol fundamentals from Token Terminal as a daily cached dataset and Agent-safe valuation API/tool.

## Story

As a fundamental analyst,
I want AI có thể phân tích dự án crypto như một công ty chứng khoán truyền thống bằng dữ liệu Token Terminal,
so that tôi biết token/protocol có đang overvalued hay undervalued dựa trên revenue, fees, earnings, users, developers, P/S, P/F, và valuation matrix so với peers.

## Acceptance Criteria

1. **AC1 — Provider config, custom API plan safety, default-off:**
   - Add config in `apps/api/src/config.ts`:
     - `TOKEN_TERMINAL_WORKER_ENABLED` default `false`.
     - `TOKEN_TERMINAL_API_BASE_URL` default `https://api.tokenterminal.com/v2`.
     - `TOKEN_TERMINAL_API_KEY` optional string, backend-only.
     - `TOKEN_TERMINAL_SYNC_INTERVAL_MS` default `86_400_000` (daily).
     - `TOKEN_TERMINAL_CACHE_TTL_MS` default `86_400_000`.
     - `TOKEN_TERMINAL_PROJECTS` optional comma-separated project allowlist, default empty/operator-configured.
     - `TOKEN_TERMINAL_METRICS` default minimal set: `fees,revenue,earnings,user_dau,active_developers,code_commits,market_cap_fully_diluted,market_cap_circulating,ps_ratio_fully_diluted,ps_ratio_circulating,pf_ratio_fully_diluted,pf_ratio_circulating`.
     - `TOKEN_TERMINAL_WORKER_CONCURRENCY` default `1`.
     - `TOKEN_TERMINAL_MAX_PROJECTS_PER_RUN` default `100`.
   - Worker must not start unless enabled and API key is configured.
   - Startup must log skip reasons clearly and must not crash API.
   - Token Terminal Pro web/CSV subscription is not enough for API access; implementation assumes a Token Terminal API plan/custom contract.

2. **AC2 — Token Terminal service wrapper with strict provider boundary:**
   - Create `apps/api/src/router/services/token-terminal.ts`.
   - Use `fetch` with `Authorization: Bearer ${config.TOKEN_TERMINAL_API_KEY}` and `Accept: application/json`.
   - Supported MVP calls:
     - `GET /metrics` to cache supported metrics and IDs.
     - `GET /projects` or project discovery endpoint from docs/API reference to cache supported projects when available.
     - `GET /metrics/{metric_id}` for metric data across configured projects.
     - Optional `GET /assets` to map token addresses/symbols to project/product IDs when needed.
   - Service must handle Token Terminal HTTP statuses distinctly: `308` project rename redirect, `400` invalid query, `402` invalid subscription, `403` forbidden/invalid access, `429` rate limit, `5xx` provider failure.
   - Provider errors must be sanitized before route/tool responses; never log or return the Bearer token.

3. **AC3 — Respect Token Terminal rate limits and data access constraints:**
   - Current Token Terminal API reference states rate limit `60 requests/minute`; worker must throttle below this limit.
   - Daily worker should maintain local project/metric cache instead of rediscovering metadata every request.
   - Route must be cache-first. Live provider calls are allowed only for backend worker/admin path or explicit `force_refresh=true` with credit check.
   - Do not expose Token Terminal API key to OpenCode, sandbox, frontend, or public Discover feed.
   - Public/free redistribution should be avoided unless provider terms/contract permit it. MVP route/tool is authenticated and Tier 2+ oriented.

4. **AC4 — Dedicated additive DB schema for protocol fundamentals:**
   - Add tables in `packages/db/src/schema/epsilon.ts`; export from `packages/db/src/index.ts`.
   - Required table `token_terminal_projects`:
     - `project_id varchar(128)` primary key.
     - `project_name varchar(255)` not null.
     - `symbol varchar(64)` nullable.
     - `market_sector varchar(128)` nullable.
     - `website_url text` nullable.
     - `token_addresses jsonb` default `[]`.
     - `metadata jsonb` default `{}`.
     - `source varchar(32)` default `token_terminal` not null.
     - `fetched_at`, `created_at`, `updated_at` timestamps.
   - Required table `token_terminal_metrics`:
     - `metric_id varchar(128)` primary key.
     - `metric_name varchar(255)` not null.
     - `description text` nullable.
     - `url text` nullable.
     - `metadata jsonb` default `{}`.
     - `source varchar(32)` default `token_terminal` not null.
     - `fetched_at`, `created_at`, `updated_at` timestamps.
   - Required table `token_terminal_project_metrics`:
     - `id uuid` primary key.
     - `project_id varchar(128)` not null.
     - `project_name varchar(255)` nullable.
     - `metric_id varchar(128)` not null.
     - `metric_name varchar(255)` nullable.
     - `timestamp timestamptz` not null.
     - `value numeric(30,8)` nullable.
     - `raw_value text` nullable.
     - `source varchar(32)` default `token_terminal` not null.
     - `fetched_at`, `created_at`, `updated_at` timestamps.
     - Unique index `(project_id, metric_id, timestamp, source)`.
     - Indexes `(project_id, metric_id, timestamp DESC)`, `(metric_id, timestamp DESC)`.
   - Required table `token_terminal_valuation_snapshots`:
     - `id uuid` primary key.
     - `project_id varchar(128)` not null.
     - `project_name varchar(255)` nullable.
     - `symbol varchar(64)` nullable.
     - `sector varchar(128)` nullable.
     - `fees_annualized_usd numeric(30,4)` nullable.
     - `revenue_annualized_usd numeric(30,4)` nullable.
     - `earnings_annualized_usd numeric(30,4)` nullable.
     - `market_cap_fully_diluted_usd numeric(30,4)` nullable.
     - `market_cap_circulating_usd numeric(30,4)` nullable.
     - `ps_ratio_fully_diluted numeric(20,6)` nullable.
     - `ps_ratio_circulating numeric(20,6)` nullable.
     - `pf_ratio_fully_diluted numeric(20,6)` nullable.
     - `pf_ratio_circulating numeric(20,6)` nullable.
     - `pe_ratio numeric(20,6)` nullable.
     - `user_dau integer` nullable.
     - `active_developers integer` nullable.
     - `code_commits integer` nullable.
     - `valuation_signal varchar(32)` default `unknown`: `undervalued`, `fair`, `overvalued`, `insufficient_data`, `unknown`.
     - `peer_percentiles jsonb` default `{}`.
     - `risk_factors jsonb` default `[]`.
     - `source varchar(32)` default `token_terminal` not null.
     - `period_start`, `period_end`, `fetched_at`, `created_at`, `updated_at` timestamps.
     - Unique index `(project_id, period_end, source)`.
     - Indexes `(sector, period_end DESC)`, `(valuation_signal, period_end DESC)`, `(ps_ratio_fully_diluted)`, `(user_dau)`.
   - Migration must use the next available sequence at implementation time. Current committed migrations end at `0004_token_social_signals.sql`, while Stories 2.1.1/2.1.2/2.2.1/2.3.1 may add migrations first; coordinate and do not overwrite another story's migration.

5. **AC5 — Daily worker and valuation matrix calculation:**
   - Create `apps/api/src/queue/bullmq/workers/token-terminal-worker.ts`.
   - Queue name: `token-terminal-fundamentals`.
   - Job names:
     - `refresh-token-terminal-metadata`.
     - `refresh-protocol-fundamentals`.
     - `compute-valuation-snapshots`.
     - `cleanup-token-terminal-cache`.
   - Scheduler uses `queue.upsertJobScheduler`, not deprecated repeat options.
   - Worker fetches metrics only for configured projects/metrics; no full-dataset crawl unless explicitly configured and budget-approved.
   - Worker computes valuation snapshots after metric ingest:
     - derive annualized fees/revenue/earnings from recent period when direct annualized metric is unavailable.
     - compute P/S, P/F, P/E only when denominator is positive and non-null.
     - compare project ratios against same-sector peers to produce percentiles and `valuation_signal`.
   - Partial provider failure must not rollback successfully ingested metrics. Use per-metric/per-project transactions or `Promise.allSettled`.

6. **AC6 — API route exposes cache-first valuation data:**
   - Create route `apps/api/src/router/routes/protocol-valuation.ts`, mounted behind `combinedAuth` at `POST /v1/router/protocol-valuation`.
   - Request schema:
     - `project_id` optional.
     - `symbol` optional.
     - `token_address` optional.
     - `peer_project_ids` optional array.
     - `sector` optional.
     - `mode` enum: `project_snapshot`, `valuation_matrix`, `metric_timeseries`.
     - `metrics` optional array.
     - `force_refresh` optional default `false`.
     - `session_id` optional.
   - At least one of `project_id`, `symbol`, `token_address`, `sector`, or `peer_project_ids` is required.
   - Default behavior is DB cache read only. If cache is missing/stale and provider disabled, return `unconfigured`/`no_data` with actionable message.
   - Live refresh requires `checkCredits`, provider configured, and bounded request count.
   - Deduct with tool key `protocol_valuation` only when live Token Terminal work is performed. Cache hits cost `0` unless product explicitly decides otherwise.

7. **AC7 — OpenCode tool wrapper is internal API only:**
   - Create `core/epsilon-master/opencode/tools/protocol_valuation.ts` using `tool()` from `@opencode-ai/plugin`.
   - Tool calls only `EPSILON_API_URL/v1/router/protocol-valuation` with `Authorization: Bearer ${EPSILON_TOKEN}`.
   - Tool must never receive or use `TOKEN_TERMINAL_API_KEY`.
   - Add `protocol_valuation: allow` to `core/epsilon-master/opencode/agents/chainlens-tier2.md`.
   - Add/confirm `protocol_valuation: deny` or absence in `chainlens-tier1.md` until billing/provider redistribution is explicitly approved.
   - Update `core/epsilon-master/opencode/tools/README.md` with provider boundary, tier, cache behavior, and billing behavior.

8. **AC8 — Market dashboard and screener compatibility:**
   - Do not break existing `/market/protocols` and `/market/smart-money` routes.
   - Add optional API surface for valuation matrix under router route first; frontend/dashboard integration can consume it later.
   - If extending `apps/api/src/market/routes.ts`, project only normalized valuation fields; do not return raw Token Terminal payloads.
   - Shared types in `packages/shared/src/types/market.ts` should be updated before frontend uses richer valuation fields.
   - This story should provide data foundation for future multi-dimensional screener filters like `P/S < 5` and peer valuation heatmaps.

9. **AC9 — Response shape is normalized, compact, and non-advisory:**
   - `project_snapshot` response includes:
     - `success`, `project_id`, `project_name`, `symbol`, `sector`, `valuation_signal`, `metrics`, `risk_factors`, `peer_percentiles`, `source`, `cache_status`, `fetched_at`, `cost`.
   - `valuation_matrix` response includes:
     - `projects[]` with P/S, P/F, P/E, fees/revenue/earnings, DAU, developers, code commits, percentiles, and missing-data flags.
   - `metric_timeseries` response includes:
     - `project_id`, `metric_id`, `points[]`, `source`, `cache_status`.
   - Do not produce buy/sell advice. Use language like `overvalued relative to selected peers`, `insufficient data`, or `fundamentals improving/deteriorating`.
   - Include `provider: 'token_terminal'` and attribution when returning provider-derived data.

10. **AC10 — Tests and verification:**
    - Unit tests for Token Terminal service:
      - Bearer auth header present.
      - `/metrics` and `/metrics/{metric_id}` response normalization.
      - 308/400/402/403/429/5xx handling.
      - API key redaction.
    - Unit tests for valuation calculations:
      - positive denominator computes ratios.
      - zero/null denominator yields null + `insufficient_data` risk factor.
      - peer percentile and signal classification are deterministic.
    - Route tests:
      - cache hit costs `0` and does not call provider.
      - live refresh requires credits.
      - missing provider config returns actionable `unconfigured` response.
      - raw payload not returned.
    - Worker tests:
      - `upsertJobScheduler` used.
      - partial metric failure does not rollback successful metrics.
      - daily sync respects project/metric allowlist and request limit.
    - Tool wrapper smoke test with mocked `fetch`.
    - Run relevant `bun test` and `bun run --cwd apps/api typecheck`; document unrelated baseline failures if any.

## Tasks / Subtasks

- [x] **Task 0: Config and provider boundary (AC1, AC2, AC3)**
  - [x] 0.1 — Add Token Terminal config vars to `apps/api/src/config.ts`.
  - [x] 0.2 — Update `apps/api/.env.example` with a `Token Terminal Fundamentals Worker` section.
  - [x] 0.3 — Ensure provider key is backend-only and redacted in logs/errors.
  - [x] 0.4 — Add comments documenting API plan requirement and 60 req/min rate limit.

- [x] **Task 1: DB schema and migration (AC4)**
  - [x] 1.1 — Add `tokenTerminalProjects`, `tokenTerminalMetrics`, `tokenTerminalProjectMetrics`, `tokenTerminalValuationSnapshots` to `packages/db/src/schema/epsilon.ts`.
  - [x] 1.2 — Export new tables from `packages/db/src/index.ts`.
  - [x] 1.3 — Create next migration without collision with other ready-for-dev Epic 2 stories.
  - [x] 1.4 — Add indexes/unique constraints exactly as specified.

- [x] **Task 2: Token Terminal service wrapper (AC2, AC3, AC10)**
  - [x] 2.1 — Create `apps/api/src/router/services/token-terminal.ts`.
  - [x] 2.2 — Implement `fetchTokenTerminalMetrics()`.
  - [x] 2.3 — Implement `fetchTokenTerminalProjects()` or equivalent project discovery endpoint confirmed by docs.
  - [x] 2.4 — Implement `fetchMetricData(metricId, { projectIds, start, end })` for `/metrics/{metric_id}`.
  - [x] 2.5 — Add typed provider errors and redacted logging.
  - [x] 2.6 — Add throttling below 60 req/min.

- [x] **Task 3: Normalization and valuation logic (AC5, AC9, AC10)**
  - [x] 3.1 — Create pure helpers for numeric parsing, annualization, ratio calculation, and peer percentiles.
  - [x] 3.2 — Map configured Token Terminal metric IDs into normalized fields.
  - [x] 3.3 — Implement valuation signal classification.
  - [x] 3.4 — Add unit tests for missing/zero denominators and peer comparisons.

- [x] **Task 4: Worker implementation (AC5, AC10)**
  - [x] 4.1 — Create `apps/api/src/queue/bullmq/workers/token-terminal-worker.ts`.
  - [x] 4.2 — Implement queue singleton pattern and lifecycle exports.
  - [x] 4.3 — Implement metadata refresh job.
  - [x] 4.4 — Implement protocol fundamentals refresh job.
  - [x] 4.5 — Implement valuation snapshot compute job.
  - [x] 4.6 — Implement cleanup/retention job if snapshots should expire.
  - [x] 4.7 — Use `Promise.allSettled` or per-metric transactions for partial success.

- [x] **Task 5: Queue lifecycle wiring (AC5)**
  - [x] 5.1 — Export `startTokenTerminalWorker`, `setupTokenTerminalJobs`, `stopTokenTerminalWorker`, `getTokenTerminalQueue` from `apps/api/src/queue/index.ts`.
  - [x] 5.2 — Start/setup in `startBackgroundServices()` in `apps/api/src/index.ts`.
  - [x] 5.3 — Stop in shutdown handler alongside existing workers.

- [x] **Task 6: API route (AC6, AC8, AC9)**
  - [x] 6.1 — Create `apps/api/src/router/routes/protocol-valuation.ts`.
  - [x] 6.2 — Mount with `combinedAuth` in `apps/api/src/router/index.ts`.
  - [x] 6.3 — Implement cache-first `project_snapshot`, `valuation_matrix`, and `metric_timeseries` modes.
  - [x] 6.4 — Implement live refresh guard with `checkCredits` and bounded request count.
  - [x] 6.5 — Add `protocol_valuation` pricing to `TOOL_PRICING` with product-approved value.

- [x] **Task 7: OpenCode tool and permissions (AC7, AC9)**
  - [x] 7.1 — Create `core/epsilon-master/opencode/tools/protocol_valuation.ts`.
  - [x] 7.2 — Validate args locally.
  - [x] 7.3 — Call only Chainlens internal API with `EPSILON_TOKEN`.
  - [x] 7.4 — Add Tier 2 permission and deny/omit Tier 1.
  - [x] 7.5 — Update tools README.

- [x] **Task 8: Tests and typecheck (AC10)**
  - [x] 8.1 — Add service tests with mocked `fetch`.
  - [x] 8.2 — Add valuation helper tests.
  - [x] 8.3 — Add route cache/live/billing tests.
  - [x] 8.4 — Add worker lifecycle/job tests.
  - [x] 8.5 — Add OpenCode tool smoke test if tool tests exist.
  - [x] 8.6 — Run relevant tests and typecheck.

## Dev Notes

### Critical Brownfield Guardrails

- Do not scrape Token Terminal web UI or rely on a Pro web login. This story requires Token Terminal API access via API plan/custom contract.
- Do not expose `TOKEN_TERMINAL_API_KEY` to OpenCode, frontend, sandbox, public API responses, or logs.
- Do not make live Token Terminal calls on every Agent question. Daily worker and DB cache are the primary path.
- Do not produce investment advice. Return valuation signals and caveats, not buy/sell recommendations.
- Do not break existing market dashboard routes. Add new valuation route/tool first.
- Keep migration additive-only and coordinate sequence with other ready-for-dev Epic 2 stories.

### Previous Story Intelligence To Apply

- From Story 2.1.1: provider calls can explode cost; scope by configured allowlist and thresholds.
- From Story 2.1.2: provider data should be normalized and confidence/caveats retained; tool returns compact summaries, not raw provider payload.
- From Story 2.2.1: backend worker owns provider credentials; OpenCode only calls internal Chainlens API/DB.
- From Story 2.3: on-chain data index already exists but is generic; do not overload `onChainDataIndex` with complex financial statement schema.
- From Story 2.3.1: premium provider data must be cache-first, authenticated/Tier 2, and bill only live provider calls.

### Current Code To Preserve

- `apps/api/src/market/routes.ts`
  - Currently exposes `/market/protocols` and `/market/smart-money` backed by `onChainDataIndex`.
  - If adding valuation to market route later, project normalized fields only.
- `packages/shared/src/types/market.ts`
  - Contains `ProtocolMetrics` and `SmartMoneyMovement`. Add new shared valuation types before frontend consumption.
- `apps/api/src/router/routes/jit-sync.ts`
  - Existing JIT sync should keep working for DeFiLlama protocol snapshots and generic onchain index.
- `apps/api/src/config.ts`
  - Add `protocol_valuation` pricing deliberately; unknown tools default to `0.01`, which is too implicit for a paid provider.

### Token Terminal Provider Notes

- Token Terminal API docs describe REST v2 with predictable resource-oriented URLs and JSON responses.
- API auth uses `Authorization: Bearer <token>`.
- API reference states the API key must be kept secret and not stored in client-side code or public GitHub.
- API reference lists HTTP `429` rate limit at 60 requests/minute.
- Pricing page states Pro is web/CSV/Excel access; Standard REST API requires API plan/custom pricing.
- Token Terminal docs expose `/v2/metrics`, `/v2/metrics/{metric_id}`, `/v2/assets`, and API best practices recommending cached project/metric metadata.
- Sheets docs expose `TT_FINANCIAL_STATEMENT`, but this story should prefer REST API when available; spreadsheet functions can be used only as conceptual reference for metric set, not as implementation API.

### Suggested API Response Shape

```typescript
interface ProtocolValuationResponse {
  success: boolean;
  mode: 'project_snapshot' | 'valuation_matrix' | 'metric_timeseries';
  project_id?: string;
  project_name?: string;
  symbol?: string;
  sector?: string;
  valuation_signal?: 'undervalued' | 'fair' | 'overvalued' | 'insufficient_data' | 'unknown';
  metrics?: {
    fees_annualized_usd?: number | null;
    revenue_annualized_usd?: number | null;
    earnings_annualized_usd?: number | null;
    market_cap_fully_diluted_usd?: number | null;
    ps_ratio_fully_diluted?: number | null;
    pf_ratio_fully_diluted?: number | null;
    pe_ratio?: number | null;
    user_dau?: number | null;
    active_developers?: number | null;
    code_commits?: number | null;
  };
  peer_percentiles?: Record<string, number>;
  risk_factors?: Array<{ code: string; label: string; severity: 'low' | 'medium' | 'high' | 'critical' }>;
  projects?: Array<Record<string, unknown>>;
  points?: Array<{ timestamp: string; value: number | null }>;
  source: 'db_cache' | 'token_terminal' | 'stale_cache' | 'no_data';
  cache_status: 'cache_fresh' | 'cache_stale' | 'live' | 'queued' | 'missing';
  fetched_at?: string | null;
  cost: number;
  provider?: 'token_terminal';
}
```

### Testing Notes

- Mock `fetch` for Token Terminal service tests; never call live Token Terminal in CI.
- Use fixture data with string numeric values because API metric responses may return values as strings.
- Test partial success: one metric ID fails while others insert.
- Test 308 project rename handling without automatically following to an unsafe URL.
- Test that `TOKEN_TERMINAL_API_KEY` is redacted from error snapshots.

### Latest Technical Information Checked

- Token Terminal API reference says API uses REST, JSON, read-only resource URLs, and API keys must remain secret. Source: https://docs.tokenterminal.com/reference/api-reference
- Token Terminal API reference lists HTTP `429` for too many requests and states rate limit is 60 requests/minute. Source: https://docs.tokenterminal.com/reference/api-reference
- Token Terminal metrics endpoint docs show `GET https://api.tokenterminal.com/v2/metrics` with `Authorization: Bearer <token>`. Source: https://tokenterminal.mintlify.dev/docs/api-reference/metrics/get-a-list-of-all-metrics
- Token Terminal metric data endpoint docs show `GET https://api.tokenterminal.com/v2/metrics/{metric_id}` and partial success with `errors[]`. Source: https://tokenterminal.com/docs/api-reference/metrics/get-metric-data-for-multiple-projects
- Token Terminal assets endpoint docs show `GET https://api.tokenterminal.com/v2/assets` and token address metadata useful for mapping assets/projects. Source: https://tokenterminal.com/docs/api-reference/assets/get-a-list-of-all-assets
- Token Terminal pricing page states Pro is web/CSV/Excel, while API plan with Standard REST API is custom pricing. Source: https://webflow.tokenterminal.com/pricing
- Token Terminal key metrics FAQ defines fees, revenue, earnings, P/S, daily active users, active developers, and code commits. Source: https://tokenterminal.com/articles/token-terminal-key-metrics-faq
- Token Terminal API best practices recommend maintaining cached project and metric indexes. Source: https://docs.tokenterminal.com/reference/api-best-practices

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-2.3.2]
- [Source: _bmad-output/planning-artifacts/architecture.md#2.6-Financial-Statements]
- [Source: _bmad-output/implementation-artifacts/2-3-dune-and-nansen-on-chain-index-worker.md]
- [Source: _bmad-output/implementation-artifacts/2-3-1-vip-api-smart-money-flow.md]
- [Source: apps/api/src/market/routes.ts]
- [Source: packages/shared/src/types/market.ts]
- [Source: packages/db/src/schema/epsilon.ts]
- [Token Terminal API Reference](https://docs.tokenterminal.com/reference/api-reference)
- [Token Terminal Metrics List](https://tokenterminal.mintlify.dev/docs/api-reference/metrics/get-a-list-of-all-metrics)
- [Token Terminal Metric Data](https://tokenterminal.com/docs/api-reference/metrics/get-metric-data-for-multiple-projects)
- [Token Terminal Assets](https://tokenterminal.com/docs/api-reference/assets/get-a-list-of-all-assets)
- [Token Terminal Pricing](https://webflow.tokenterminal.com/pricing)
- [Token Terminal Key Metrics FAQ](https://tokenterminal.com/articles/token-terminal-key-metrics-faq)
- [Token Terminal API Best Practices](https://docs.tokenterminal.com/reference/api-best-practices)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

### Review Findings

_Code review 2026-05-18 — 3 layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor) on commit `6038fbaffa`._

**Decisions resolved (2026-05-18):**
- D1 → option (b) sector-percentile classification (also fixes `peerPercentiles {}`).
- D2 → option (a) align code+migration with spec object shape.
- D3 → option (a) detect period from API response (fallback 30d).

**Patch (27) — fix unambiguous:**

- [x] [Review][Patch] **`classifyValuation` use sector-percentile classification, not avg-of-3 thresholds** [token-terminal-normalize.ts:36-43](apps/api/src/router/services/token-terminal-normalize.ts#L36-L43) — D1 resolution. Compute per-project percentile within same-sector peers for P/S, P/F, P/E. Lower percentile = undervalued; cutoffs e.g. <33 undervalued / >67 overvalued / else fair / `insufficient_data` if no peer data. AC5.
- [x] [Review][Patch] **`risk_factors` migrate `string[]` → `Array<{code, label, severity}>`** [epsilon.ts:1454](packages/db/src/schema/epsilon.ts), [token-terminal-normalize.ts:63-64](apps/api/src/router/services/token-terminal-normalize.ts#L63-L64), [protocol-valuation.ts:121,152](apps/api/src/router/routes/protocol-valuation.ts#L121) — D2 resolution. Update Drizzle `$type<>`, regenerate migration column comment (jsonb already, no DDL needed), update `buildSnapshot` to push objects, update tests. AC9.
- [x] [Review][Patch] **`annualize()` detect period from API response, fallback 30d** [token-terminal-normalize.ts:18-22](apps/api/src/router/services/token-terminal-normalize.ts#L18-L22), [token-terminal-worker.ts:120-130](apps/api/src/queue/bullmq/workers/token-terminal-worker.ts#L120-L130) — D3 resolution. Pull last 2 timestamps for the same `(projectId, metricId)`, derive interval days; fallback 30 if <2 points. Pass `days` arg into `annualize()` from `processSnapshots`. AC5.



- [x] [Review][Patch] **`metric_timeseries` mode completely unimplemented — always returns `points: []`** [protocol-valuation.ts:161-172](apps/api/src/router/routes/protocol-valuation.ts#L161-L172) — AC6/AC9 require returning actual timeseries from `tokenTerminalProjectMetrics`. CRITICAL.
- [x] [Review][Patch] **`processSnapshots` `onConflictDoUpdate` does NOT update ratio/metric fields on conflict** [token-terminal-worker.ts:154-157](apps/api/src/queue/bullmq/workers/token-terminal-worker.ts#L154-L157) — only `valuationSignal`, `riskFactors`, `updatedAt`, `fetchedAt` updated. P/S, P/F, P/E, fees, revenue, market caps stay frozen at first-insert values forever. CRITICAL — daily worker effectively does nothing.
- [x] [Review][Patch] **Throttle 100ms allows 600 req/min — Token Terminal API caps at 60 req/min** [token-terminal.ts:5](apps/api/src/router/services/token-terminal.ts#L5) — AC3 explicitly says "throttle below 60 req/min". Set `MIN_REQUEST_INTERVAL_MS` to ~1100ms (or use a token-bucket); keep test override via env. HIGH.
- [x] [Review][Patch] **`peerPercentiles` always written as empty `{}` — peer percentile feature non-functional** [token-terminal-worker.ts:150](apps/api/src/queue/bullmq/workers/token-terminal-worker.ts#L150) — `percentile()` helper exists in normalize but never invoked. AC5 + AC9 require sector-peer percentile computation. HIGH.
- [x] [Review][Patch] **`processSnapshots` no `ORDER BY timestamp DESC` — `latest` map captures arbitrary (often stale) value** [token-terminal-worker.ts:121-127](apps/api/src/queue/bullmq/workers/token-terminal-worker.ts#L121-L127) — Add `.orderBy(desc(tokenTerminalProjectMetrics.timestamp))` before the `latest` map iteration so first occurrence is the newest. HIGH.
- [x] [Review][Patch] **`processFundamentals` no per-metric try/catch — first 429/error aborts loop, partial-success spec violated** [token-terminal-worker.ts:99-100](apps/api/src/queue/bullmq/workers/token-terminal-worker.ts#L99-L100) — Inner DB inserts use `Promise.allSettled` but the outer `await fetchMetricData` doesn't. Wrap each metric in try/catch. AC5/AC10. HIGH.
- [x] [Review][Patch] **Live-refresh path fetches metrics, throws away results, queues async jobs, then re-reads same stale cache** [protocol-valuation.ts:81-93](apps/api/src/router/routes/protocol-valuation.ts#L81-L93) — `fetchMetricData` returns rows but they are never persisted; the immediate `safeSelectSnapshots(ids)` returns the same data that triggered the refresh. Burns API quota for nothing and labels stale data `cache_status: 'live'`. Either persist inline (sync mode) or skip the synchronous fetch and return `cache_status: 'queued'`. HIGH.
- [x] [Review][Patch] **Live-refresh `fetchMetricData` provider error → unhandled 500** [protocol-valuation.ts:81-83](apps/api/src/router/routes/protocol-valuation.ts#L81-L83) — 429/402/5xx propagates as 500 with no actionable message. Wrap in try/catch and map to typed responses. HIGH.
- [x] [Review][Patch] **Auto-live-refresh on first request charges credits without `force_refresh`** [protocol-valuation.ts:61](apps/api/src/router/routes/protocol-valuation.ts#L61) — `noData && WORKER_ENABLED` triggers live → user pays 0.20 credits even though they asked for cache. Either gate on `force_refresh` only, or return `cache_status: 'queued'` + cost 0 and let the worker fill cache async. AC6 cache-first violated. HIGH.
- [x] [Review][Patch] **`token_terminal_valuation_snapshots.period_end` nullable in unique index — Postgres treats NULL ≠ NULL** [0009_token_terminal_fundamentals.sql:75,82](packages/db/drizzle/0009_token_terminal_fundamentals.sql#L75) — Unique index `(project_id, period_end, source)` does not deduplicate when `period_end IS NULL`. Make `period_end NOT NULL` (worker always sets it) or use a partial unique index. HIGH.
- [x] [Review][Patch] **`tokenAddresses` null element crashes lookup with `null.toLowerCase()`** [protocol-valuation.ts:52](apps/api/src/router/routes/protocol-valuation.ts#L52) — Provider returns `["0xabc", null, ...]` → 500 for the entire query. Filter falsy: `(r.tokenAddresses || []).filter(Boolean).map(x => x.toLowerCase())`. HIGH.
- [x] [Review][Patch] **`fetchMetricData` falls back to `new Date().toISOString()` for missing timestamp → unbounded row growth** [token-terminal.ts:105](apps/api/src/router/services/token-terminal.ts#L105) — Unique key `(project_id, metric_id, timestamp, source)` never collides → new row every sync. Either skip rows without timestamp or compute a deterministic synthetic key. HIGH.
- [x] [Review][Patch] **NaN propagates through normalize → false `'fair'` signal** [token-terminal.ts:106](apps/api/src/router/services/token-terminal.ts#L106), [token-terminal-worker.ts:127](apps/api/src/queue/bullmq/workers/token-terminal-worker.ts#L127), [token-terminal-normalize.ts](apps/api/src/router/services/token-terminal-normalize.ts) — Provider string `"NaN"`/`"Infinity"`/`"-"` → `Number(val)` = NaN/Infinity → stored as text → `Number(m.value)` in `processSnapshots` returns NaN → bypasses `den <= 0` and `typeof === 'number'` filter → `classifyValuation` returns `'fair'`. Use `asNum()` (which already filters non-finite) at every numeric ingest point, especially [worker line 127] and route mapping. HIGH.
- [x] [Review][Patch] **`safeRatio` rejects negative denominators → P/E with negative earnings silently dropped** [token-terminal-normalize.ts:24-27](apps/api/src/router/services/token-terminal-normalize.ts#L24-L27) — Loss-making protocol gets `pe = null` + `insufficient_data` instead of a meaningful negative-earnings flag. Allow negative numerator with a `risk_factors` entry, or only guard against zero denominator. MEDIUM.
- [x] [Review][Patch] **`processSnapshots` ignores `projectAllowlist()`, snapshots all DB projects** [token-terminal-worker.ts:117](apps/api/src/queue/bullmq/workers/token-terminal-worker.ts#L117) — `processFundamentals` correctly filters but `processSnapshots` reads all `tokenTerminalProjects` rows. Off-allowlist projects get snapshots with stale/missing metrics. AC3. MEDIUM.
- [x] [Review][Patch] **`project_snapshot` response missing `mode` field** [protocol-valuation.ts:106-129](apps/api/src/router/routes/protocol-valuation.ts#L106-L129) — Spec AC9 `ProtocolValuationResponse` declares `mode` as top-level field; `valuation_matrix` and `metric_timeseries` include it but `project_snapshot` does not. MEDIUM.
- [x] [Review][Patch] **`valuation_matrix` response missing `fetched_at`** [protocol-valuation.ts:132-158](apps/api/src/router/routes/protocol-valuation.ts#L132-L158) — Spec AC9 lists `fetched_at` as top-level. LOW.
- [x] [Review][Patch] **No retention/cleanup for `tokenTerminalValuationSnapshots`** [token-terminal-worker.ts:161-164](apps/api/src/queue/bullmq/workers/token-terminal-worker.ts#L161-L164) — `processCleanup` deletes only `tokenTerminalProjectMetrics`. Snapshots grow without bound; combined with `safeSelectSnapshots(.limit(300))` causes mixed-age results per project. Add cleanup for snapshots older than retention window. MEDIUM.
- [x] [Review][Patch] **`setupTokenTerminalJobs` doesn't guard on `TOKEN_TERMINAL_WORKER_ENABLED`** [token-terminal-worker.ts:188-204](apps/api/src/queue/bullmq/workers/token-terminal-worker.ts#L188-L204) — Schedules jobs into Redis even when worker is disabled — jobs accumulate with no consumer. AC1. MEDIUM.
- [x] [Review][Patch] **`setupTokenTerminalJobs` fallback uses `q.add` with fixed `jobId` — one-shot, not recurring** [token-terminal-worker.ts:199-203](apps/api/src/queue/bullmq/workers/token-terminal-worker.ts#L199-L203) — Spec AC5 mandates `upsertJobScheduler`. Fallback path silently degrades to non-recurring; remove fallback or use repeatable scheduler. MEDIUM.
- [x] [Review][Patch] **Symbol/sector/token_address lookup hardcoded `.limit(200)` — projects beyond row 200 invisible** [protocol-valuation.ts:48](apps/api/src/router/routes/protocol-valuation.ts#L48) — Token Terminal lists hundreds of projects. Push filter to DB query (`WHERE LOWER(symbol)=...`, `marketSector`, jsonb operator for `tokenAddresses`) and add appropriate indexes. MEDIUM.
- [x] [Review][Patch] **Worker test: "partial metric failure" dispatches `JOB_REFRESH_METADATA` not `JOB_REFRESH_FUNDAMENTALS`** [token-terminal-worker.test.ts:55-60](apps/api/src/__tests__/unit/token-terminal-worker.test.ts#L55-L60) — `_failMetric` flag is declared but never toggled in this test, and the actual `processFundamentals` partial-failure path has zero coverage. AC10. MEDIUM.
- [x] [Review][Patch] **Worker test: `upsertJobScheduler` test has vacuous `else { expect(true).toBe(true) }` branch** [token-terminal-worker.test.ts:39-43](apps/api/src/__tests__/unit/token-terminal-worker.test.ts#L39-L43) — Test passes unconditionally if mock state mismatches. AC10. MEDIUM.
- [x] [Review][Patch] **Service test: API key redaction not tested** [token-terminal-service.test.ts](apps/api/src/__tests__/unit/token-terminal-service.test.ts) — Spec AC10 explicit requirement. `sanitizeTokenTerminalError` exists but has zero coverage. MEDIUM.
- [x] [Review][Patch] **Route test: "raw payload not returned" missing** [protocol-valuation-route.test.ts](apps/api/src/__tests__/unit/protocol-valuation-route.test.ts) — AC10 lists this explicitly; only 3 happy-path cases exist. MEDIUM.
- [x] [Review][Patch] **`fetchTokenTerminalProjects` calls `/projects` endpoint not documented in spec references** [token-terminal.ts:75-87](apps/api/src/router/services/token-terminal.ts#L75-L87) — Spec lists `/v2/metrics`, `/v2/metrics/{id}`, `/v2/assets`. AC2 says "or equivalent project discovery endpoint confirmed by docs". Verify against current Token Terminal docs and either confirm `/projects` exists or switch to `/assets` for project discovery. MEDIUM.

**Defer (4) — pre-existing pattern or low impact, tracked separately:**

- [x] [Review][Defer] **Module-level mutable `lastReqAt` throttle is TOCTOU under concurrent callers** [token-terminal.ts:6-12](apps/api/src/router/services/token-terminal.ts#L6-L12) — Same pattern as other service throttles in repo; partially mitigated once `MIN_REQUEST_INTERVAL_MS` is raised to ~1100ms. Track for cross-service throttle harmonization.
- [x] [Review][Defer] **`processSnapshots` SQL `inArray(metricId, [])` returns false when allowlist empty → all-null snapshots** [token-terminal-worker.ts:122](apps/api/src/queue/bullmq/workers/token-terminal-worker.ts#L122) — Config edge: only happens if operator clears `TOKEN_TERMINAL_METRICS`. Guard with early-return in `processSnapshots` when `metrics.length === 0`.
- [x] [Review][Defer] **No FK constraint on `token_terminal_project_metrics.project_id`** [0009_token_terminal_fundamentals.sql](packages/db/drizzle/0009_token_terminal_fundamentals.sql) — Repo convention is mostly soft references (epsilon schema follows this); track for schema-hardening pass.
- [x] [Review][Defer] **`processMetadata` serial inserts (N round-trips)** [token-terminal-worker.ts:55-92](apps/api/src/queue/bullmq/workers/token-terminal-worker.ts#L55-L92) — Performance not correctness; with daily cadence and ~200 projects this is acceptable. Batch with chunked `INSERT ... ON CONFLICT` later if cron window becomes tight.

**Dismissed (8) — false positives or out of scope:**

- ❌ "deductToolCredits called with 0 instead of cost" — `0` is `resultCount`, not `cost`. Pricing has `perResultCost: 0` so cost is `baseCost: 0.20`. Correct.
- ❌ "opencode.jsonc not updated to register tool" — Tools are auto-discovered from `tools/` directory; permissions live in agent .md files. Other tools (smart_money_flow, jit_sync) also not listed in jsonc.
- ❌ "Race condition: check-then-deduct billing non-atomic" — Same project-wide pattern; CLAUDE.md acknowledges; tracked at platform level.
- ❌ "as any cast on onConflictDoUpdate" — Stylistic; same pattern in other workers in repo.
- ❌ "sanitizeTokenTerminalError partial leakage (URL-encoded)" — Bearer token never appears in URL; theoretical.
- ❌ "TOKEN_TERMINAL_PROJECTS empty default doc gap" — Behavior is correct; comment style.
- ❌ "Worker singleton restart race" — `_queue` and `_worker` reset to null on stop; restart works.
- ❌ "Token address case-insensitive comparison fragile" — Both sides lowercased before `.includes`, comparison is correct.
