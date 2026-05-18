# Story 6.4: Model Availability & Quota Guardrail (Web + Extension)

Status: ready-for-dev

> **Context**: This story closes the Model Availability boundary cluster (FR26–FR30 + NFR13–NFR14) added to PRD §6.6 + §7 and Architecture §14 on 2026-05-18. It is the **UI/Extension guardrail half** of the boundary — the **backend catalog half** lives in Story 8.3 (LLM Proxy & MaaS). Per Epic 6 intro note (IR finding A4): **MUST ship after Story 8.3** so the catalog endpoint exists to consume.
>
> **IR critical finding C1 resolution**: This story file resolves the planning-half of C1 (FR26-30 cluster untracked). When this story ships, the LLM model picker on web + extension stops letting users select models that will fail at runtime due to `quota_exceeded`, `provider_unhealthy`, or `plan_not_entitled` — the failure mode the cluster was scoped to prevent.

## Story

As a Chainlens user chọn model để chat/phân tích trên web hoặc browser extension,
I want model picker chỉ cho chọn model còn khả dụng theo quyền tài khoản hiện tại (entitlement, quota, provider health),
So that tôi không bị fail runtime do quota hết, provider tạm unavailable, hoặc plan không support model đó.

## Acceptance Criteria

### AC1 — Backend exposes per-account model availability catalog (FR26)

**Given** Story 8.3 (LLM Proxy & MaaS) has shipped the backend model registry
**When** Story 6.4 ships
**Then** a new endpoint `GET /v1/llm/catalog` (under existing `apps/api/src/router/routes/llm.ts`) returns:

```json
{
  "models": [
    {
      "providerID": "openai",
      "modelID": "gpt-4o-mini",
      "modelName": "GPT-4o Mini",
      "available": true,
      "reason": null,
      "capabilities": ["chat", "code"],
      "tier_required": "tier1"
    },
    {
      "providerID": "anthropic",
      "modelID": "claude-opus-4-7",
      "modelName": "Claude Opus 4.7",
      "available": false,
      "reason": "plan_not_entitled",
      "reason_display": "Upgrade to Tier 2 to access this model",
      "capabilities": ["chat", "code", "reasoning"],
      "tier_required": "tier2",
      "alternatives": [
        { "providerID": "anthropic", "modelID": "claude-sonnet-4-6", "modelName": "Claude Sonnet 4.6" }
      ]
    }
  ],
  "checked_at": "2026-05-18T14:23:45.123Z",
  "ttl_seconds": 30
}
```

**And** reason codes are restricted to the canonical enum (FR29 + PRD §6.6 reason codes): `quota_exceeded`, `provider_unhealthy`, `plan_not_entitled`, `provider_disabled`, `model_deprecated`. Anything else → 500 with structured Sentry log.

**And** response NEVER contains API keys, provider raw error messages, or internal stack traces (PRD §6.6 No Secret Leakage).

**And** endpoint is gated by `combinedAuth` (Supabase JWT or apiKeyAuth) — public/anonymous access NOT allowed (the catalog leaks tier/entitlement info that should be account-scoped).

### AC2 — Web model picker honors availability state (FR27 + FR28)

**Given** AC1 endpoint exists
**When** [apps/web/src/components/session/model-selector.tsx:112](apps/web/src/components/session/model-selector.tsx#L112) renders
**Then** unavailable models are visually disabled (greyed + non-clickable) AND filtered to the bottom of each provider group with a `Tag` showing `reason_display`
**And** clicking a disabled model shows the `alternatives` list inline as a quick-switch CTA (`useMemo` over `models.filter(m => m.available)`)
**And** the picker NEVER calls `onSelect()` for an unavailable model — guardrail enforced at the click handler boundary, not just visually

**And** when the currently selected model becomes `available: false` mid-session, the picker auto-suggests the top alternative via toast and highlights it in the dropdown — user must explicitly accept the swap (no silent auto-switch)

### AC3 — Browser extension model picker honors availability state (FR27 + FR30)

**Given** AC1 endpoint exists AND extension has a model selector (currently embedded in the chat side panel)
**When** extension's model picker renders
**Then** the same availability + reason + alternatives display rules from AC2 apply identically — using the SAME `useModelStore` hook shape ([apps/web/src/hooks/opencode/use-model-store.ts](apps/web/src/hooks/opencode/use-model-store.ts#L190)) or an equivalent extension-local hook with matching contract

**And** extension polls the catalog endpoint via the existing extension fetch helper (same auth pattern as advisory endpoint cross-origin pattern from Story 6.1.0), NOT a separate auth flow

### AC4 — Cross-surface consistency target ≤30s freshness (FR30 + NFR13)

**Given** backend marks a model `available: false` (e.g. quota exhausted)
**When** UI catalogs are next polled
**Then** both web and extension MUST reflect the new state within **≤30 seconds** of the backend change (NFR13)
**And** polling cadence is `setInterval(refetch, 30_000)` via `useModelStore` OR React Query `staleTime: 30_000 + refetchInterval: 30_000` — pick whichever matches existing model-store pattern
**And** the catalog response includes `ttl_seconds: 30` so clients with React Query / SWR can honor server-driven cache window

**And** identical `availability` + `reason` for the same model + account MUST be visible across web and extension at the same wall-clock time (within polling interval). Verified by integration test: query catalog from web, then from extension within 5s, assert deep-equal response bodies.

### AC5 — Backend rejects request for unentitled model (FR29 + Server-Enforced Entitlement)

**Given** a model is marked `available: false, reason: 'plan_not_entitled'` in the catalog (or any non-`available` reason)
**When** a client sends `POST /v1/router/llm/chat/completions` with that `model` ID
**Then** the route at [apps/api/src/router/routes/llm.ts:18](apps/api/src/router/routes/llm.ts#L18) rejects with HTTP `403` (NOT 402) and response body:

```json
{
  "error": "Model not available",
  "reason": "plan_not_entitled",
  "reason_display": "Upgrade to Tier 2 to access this model",
  "alternatives": [{"providerID": "anthropic", "modelID": "claude-sonnet-4-6"}],
  "request_id": "..."
}
```

**And** the `reason` field MUST match the catalog `reason` for the same model + account at the same time (FR29 consistency)
**And** the entitlement check runs BEFORE `checkCredits` so unentitled requests don't burn the credit check path

### AC6 — Observability + failure-rate SLO (NFR14 + NFR-O5)

**Given** the guardrail is shipped to production
**When** the first 7 days of telemetry are reviewed
**Then** the metric `llm.model_selection.unavailable_failures` (sum of HTTP 403 responses from `/v1/router/llm/*` with reason in the canonical enum) stays below **0.5% / day** of total `llm.model_selection.requests_total` (NFR14)
**And** OpenTelemetry counters are exported via the existing OTLP path from Story 8.5 (`sandbox.provision.duration_ms` peer): `llm.catalog.requests_total{reason,status}` + `llm.model_selection.unavailable_failures_total{reason}` + `llm.model_selection.requests_total`

**And** a Logtail/Loki alert rule matches `event:llm.catalog.* level:error` to page on-call when the guardrail itself fails (catalog endpoint 5xx) — distinct from the per-model unavailability events which are expected operational state

## Tasks / Subtasks

### Task 1 — Backend catalog endpoint (AC1) [BLOCKED on Story 8.3]
- [ ] 1.1 Add `GET /v1/llm/catalog` route handler to [apps/api/src/router/routes/llm.ts](apps/api/src/router/routes/llm.ts) (gated by `combinedAuth`)
- [ ] 1.2 Build `getAccountModelCatalog(accountId): ModelCatalogEntry[]` service in [apps/api/src/router/services/llm.ts](apps/api/src/router/services/llm.ts) that:
  - reads the model registry from Story 8.3 backend
  - cross-references current quota state (`getSandboxMemberCapStatus` + account-level quota from billing service)
  - cross-references current provider health (Story 8.3 will own provider-health probes; consume via internal API or shared module)
  - maps each model → `{available, reason, reason_display, alternatives}`
- [ ] 1.3 Define canonical `ModelAvailabilityReason` Zod enum in [packages/shared/src/llm-catalog.ts](packages/shared/src/llm-catalog.ts) (NEW) — shared by backend + web + extension to prevent enum drift
- [ ] 1.4 Cache catalog response per-account in-memory for 30s (matches `ttl_seconds`); use `Map<accountId, {snapshot, expiresAt}>` pattern; bound to ~1000 entries with LRU eviction
- [ ] 1.5 Add `X-Request-ID` correlation header for support debugging (parity with Story 6.1.0 logging pattern)

### Task 2 — Server-side entitlement enforcement (AC5)
- [ ] 2.1 Edit `llm.post('/chat/completions')` handler [apps/api/src/router/routes/llm.ts:18](apps/api/src/router/routes/llm.ts#L18) to call `getAccountModelCatalog(accountId)` and check the requested `body.model` is `available: true` BEFORE `checkCredits`
- [ ] 2.2 On unavailable → throw `HTTPException(403, { message, cause: { reason, alternatives, request_id } })`
- [ ] 2.3 The check is opt-out via internal call header `X-Skip-Availability-Check` (used by health checks / admin debugging only — not exposed to user-facing routes)
- [ ] 2.4 Add OTLP counter `llm.model_selection.unavailable_failures_total{reason}` increment on each 403 (AC6)

### Task 3 — Web model picker UI guardrail (AC2)
- [ ] 3.1 Extend `FlatModel` type to include `available`, `reason`, `reason_display`, `alternatives` fields (matches catalog response shape from shared `packages/shared/src/llm-catalog.ts`)
- [ ] 3.2 Edit [apps/web/src/components/session/model-selector.tsx:130-160](apps/web/src/components/session/model-selector.tsx#L130) — filter unavailable models to bottom of each provider group; render with `opacity-50 cursor-not-allowed`, `Tag` showing `reason_display`
- [ ] 3.3 Edit click handler at line 164 — early-return when `!model.available`; do NOT call `onSelect`
- [ ] 3.4 Add an `AlternativesQuickSwitch` inline component that renders alternatives as clickable chips below the disabled row
- [ ] 3.5 Edit `useModelStore` hook [apps/web/src/hooks/opencode/use-model-store.ts:190](apps/web/src/hooks/opencode/use-model-store.ts#L190) to fetch `/v1/llm/catalog` every 30s via React Query (use existing query client at `apps/web/src/lib/query.ts`); update `models` prop to include availability fields
- [ ] 3.6 When `currentlySelectedModel` becomes `available: false`, fire a toast (`@/components/ui/toast` or existing equivalent) suggesting the top `alternatives` entry

### Task 4 — Extension model picker UI guardrail (AC3)
- [ ] 4.1 Locate or extract the extension's model picker component (likely embedded in side-panel chat). If missing, scaffold one mirroring web's `ModelSelector` API but using extension-local state
- [ ] 4.2 Reuse the same `packages/shared/src/llm-catalog.ts` types (extension build pipeline must resolve workspace packages — verify in `apps/extension/tsconfig.json`)
- [ ] 4.3 Implement extension fetch helper to call `/v1/llm/catalog` with the user's auth token (same pattern as how extension calls advisory endpoint per Story 6.1.0)
- [ ] 4.4 Poll cadence matches AC4 (30s `setInterval` — extension doesn't have React Query; use plain interval cleared on side-panel close)
- [ ] 4.5 Render the same disabled-model + alternatives + auto-switch-on-current-becomes-unavailable behavior as web

### Task 5 — Cross-surface consistency integration test (AC4)
- [ ] 5.1 Add Playwright spec `tests/e2e/specs/model-availability-cross-surface.spec.ts`:
  - Mutate backend to mark `claude-opus-4-7` as `available: false, reason: 'plan_not_entitled'` for the test account (via SQL update or admin endpoint)
  - Login web in one browser context, login extension in another (or stub the extension fetch helper to hit same backend)
  - Within 35s window, poll both surfaces' rendered DOM for the model's `available` state
  - Assert both surfaces show `available: false` + same `reason_display` text + same `alternatives` list (deep equal)
- [ ] 5.2 Reuse helpers from `tests/e2e/helpers/auth.ts` (loginToDashboard) and the chaos-test pattern of `sandbox-token-drift-recovery.spec.ts` for the backend mutation step
- [ ] 5.3 Gate behind `MODEL_AVAILABILITY_E2E_ENABLED=true` env so the spec doesn't run by default until backend support is fully shipped

### Task 6 — Telemetry + alerting (AC6)
- [ ] 6.1 OTLP counters via existing SDK from Story 8.5 (`sandbox.provision.duration_ms` peer)
- [ ] 6.2 Logtail/Loki alert rule definition in `docs/runbooks/model-availability-slo.md` (NEW) — copy structure from `docs/runbooks/sandbox-token-drift-drill.md`
- [ ] 6.3 Dashboard query for `unavailable_failures / requests_total < 0.5%` rolling 24h — document in runbook
- [ ] 6.4 Sentry breadcrumb on 403 (PII-safe: log `accountId hash`, NOT plain accountId; log reason; never log model API responses)

### Task 7 — Unit + integration test coverage
- [ ] 7.1 [apps/api/src/__tests__/unit/llm-catalog.test.ts](apps/api/src/__tests__/unit/llm-catalog.test.ts) (NEW) — covers `getAccountModelCatalog` happy path + each reason code path (5 reason codes × at least one test)
- [ ] 7.2 [apps/api/src/__tests__/unit/llm-entitlement-enforcement.test.ts](apps/api/src/__tests__/unit/llm-entitlement-enforcement.test.ts) (NEW) — covers 403 path with each reason code; verifies request_id correlation
- [ ] 7.3 [apps/web/src/components/session/__tests__/model-selector-availability.test.tsx](apps/web/src/components/session/__tests__/model-selector-availability.test.tsx) (NEW) — React Testing Library: disabled state, alternatives chip, auto-switch toast
- [ ] 7.4 Run isolated: `bun test apps/api/src/__tests__/unit/llm-catalog.test.ts apps/api/src/__tests__/unit/llm-entitlement-enforcement.test.ts` (subdir not in default glob — same constraint as 5.0.4 tests)

## Dev Notes

### Critical brownfield guardrails

- **DO NOT** reinvent the model registry. Story 8.3 (LLM Proxy & MaaS) owns the canonical registry source. If 8.3 hasn't shipped when this story starts, **HALT and escalate** — 6.4 cannot proceed without 8.3's catalog. (Recorded in Epic 6 intro per IR finding A4.)
- **DO NOT** add a new auth pattern for the catalog endpoint. Reuse `combinedAuth` (Supabase JWT or apiKeyAuth) — same as `/v1/router/*` routes.
- **DO NOT** leak provider error details or API keys into the catalog response. The `reason_display` field is the ONLY user-visible explanation; raw provider errors go to Sentry only (PRD §6.6 No Secret Leakage).
- **DO NOT** silently auto-switch the user's selected model when it becomes unavailable. Surface a toast suggesting alternatives but require explicit user click. Silent switches break user trust + analytics attribution.
- **DO** make the canonical reason enum a **shared** type in `packages/shared/` so backend, web, and extension cannot drift.

### Existing helpers TO REUSE (NOT reinvent)

| Helper | Path | Use for |
|---|---|---|
| `getAllModels`, `getModel` | [apps/api/src/router/services/llm.ts:144](apps/api/src/router/services/llm.ts#L144) | Reading the model registry — extend with availability metadata, don't duplicate |
| `getSandboxMemberCapStatus` | [apps/api/src/router/services/member-spend.ts](apps/api/src/router/services/member-spend.ts) | Quota status per account/sandbox — feeds the `quota_exceeded` reason code |
| `checkCredits` | [apps/api/src/router/services/billing.ts](apps/api/src/router/services/billing.ts) | Account-level credit + entitlement check — feeds the `plan_not_entitled` reason code |
| `useModelStore` | [apps/web/src/hooks/opencode/use-model-store.ts:190](apps/web/src/hooks/opencode/use-model-store.ts#L190) | Web model picker state — extend with availability fetch, don't fork |
| `combinedAuth` middleware | [apps/api/src/router/index.ts](apps/api/src/router/index.ts) | Catalog endpoint auth — same as other `/v1/router/*` routes |
| React Query client | `apps/web/src/lib/query.ts` | Catalog polling with `staleTime` + `refetchInterval` |

### Files this story will CREATE

```
packages/shared/src/llm-catalog.ts                                       (NEW — shared type + reason enum)
apps/api/src/__tests__/unit/llm-catalog.test.ts                          (NEW — Task 7.1)
apps/api/src/__tests__/unit/llm-entitlement-enforcement.test.ts          (NEW — Task 7.2)
apps/web/src/components/session/__tests__/model-selector-availability.test.tsx (NEW — Task 7.3)
tests/e2e/specs/model-availability-cross-surface.spec.ts                 (NEW — Task 5.1)
docs/runbooks/model-availability-slo.md                                  (NEW — Task 6.2)
```

### Files this story will UPDATE

| Path | What changes | Preserve |
|---|---|---|
| [apps/api/src/router/routes/llm.ts](apps/api/src/router/routes/llm.ts) | Add `GET /catalog` route; entitlement check in `POST /chat/completions` BEFORE credit check | Existing streaming behavior, billing flow, sessionId resolution, actor context |
| [apps/api/src/router/services/llm.ts](apps/api/src/router/services/llm.ts) | Add `getAccountModelCatalog` service | Existing `proxyToOpenRouter`, `extractUsage`, `calculateCost`, `getModel`, `getAllModels` |
| [apps/web/src/components/session/model-selector.tsx](apps/web/src/components/session/model-selector.tsx) | Filter/disable unavailable models; alternatives chip; auto-switch toast | Existing search, grouping by provider, `ConnectProviderDialog`, `ManageModelsDialog` |
| [apps/web/src/hooks/opencode/use-model-store.ts](apps/web/src/hooks/opencode/use-model-store.ts) | Inject availability fetch + 30s poll | Existing `ModelKey`, `Visibility`, `STORE_KEY`, hydration logic |
| [apps/extension/src/](apps/extension/src/) | Extension model picker — locate or scaffold + apply same guardrails | Existing content script, tooltip flow |
| [packages/db/](packages/db/) | (if needed) — track per-account model overrides | Existing schema additive only (AR3) |

### Previous story intelligence

- **Story 6.1.0 (Advisory Risk Endpoint)** — same anonymous + rate-limited pattern in principle, BUT 6.4 catalog is **authenticated** (per-account scope). Reuse: structured Sentry breadcrumbs, `X-Request-ID` correlation, in-memory cache pattern with LRU eviction, CORS handling for chrome-extension origin. Do NOT reuse: the anonymous gating (catalog leaks tier/entitlement → requires auth).
- **Story 6.1 (Extension Core)** — extension fetch helper pattern + side-panel mount point exist; piggyback on that wiring for the catalog fetch.
- **Story 8.5 (Production-Grade Platform Reliability)** — when shipped, will provide the OTLP SDK + Logtail rule scaffolding this story's Task 6 depends on. If 8.5 isn't fully shipped, use `console.warn(JSON.stringify(...))` structured log pattern from Story 5.0.2 (see [core/epsilon-master/src/services/epsilon-user-middleware.ts:88](core/epsilon-master/src/services/epsilon-user-middleware.ts#L88)) as a temporary substitute.

### Git intelligence

Recent commits show heavy investment in observability discipline (5.0.2 structured alerts, 5.0.4 chaos tests, 6.1.0 advisory endpoint with request_id). Follow the same patterns:
- Structured JSON logs via `console.warn(JSON.stringify({event, level, ...}))` parseable by Logtail
- Sentry-safe payloads (no API keys, no full IPs, no plain accountIds)
- 5-minute alert debounce per (account, reason) pair (mirror `RECENT_ALERTS` Map pattern from epsilon-user-middleware.ts)
- Unit tests use source-inspection pattern when full mock chain is too heavy (see 5.0.2 review test files)

### Latest technical specifics

- **Hono response shape**: throw `HTTPException(403, { message, cause })` — Hono surfaces `cause` in the response JSON when the error renderer is the default. If we need a custom shape, override at the middleware boundary (already done in apps/api for some routes).
- **React Query v5**: `staleTime` + `refetchInterval` is the canonical pattern for polling; do NOT use `setInterval` in a React effect if the project uses React Query. Verify [apps/web/src/lib/query.ts](apps/web/src/lib/query.ts) for version.
- **packages/shared workspace dep**: extension build pipeline (esbuild/vite — confirm in `apps/extension/`) must include `packages/shared` in resolve aliases. Check `apps/extension/tsconfig.json` and the build config before adding the import.

### Source Tree Components to Touch

**Modified files** (UPDATE):
- `apps/api/src/router/routes/llm.ts` — add catalog route + entitlement check
- `apps/api/src/router/services/llm.ts` — add `getAccountModelCatalog`
- `apps/web/src/components/session/model-selector.tsx` — guardrail + alternatives chip + auto-switch toast
- `apps/web/src/hooks/opencode/use-model-store.ts` — availability fetch + 30s poll
- `apps/extension/src/` — extension picker (exact path TBD during implementation)
- `CLAUDE.md` — add note linking Story 6.4 to existing model surfaces

**New files** (CREATE):
- `packages/shared/src/llm-catalog.ts`
- `apps/api/src/__tests__/unit/llm-catalog.test.ts`
- `apps/api/src/__tests__/unit/llm-entitlement-enforcement.test.ts`
- `apps/web/src/components/session/__tests__/model-selector-availability.test.tsx`
- `tests/e2e/specs/model-availability-cross-surface.spec.ts`
- `docs/runbooks/model-availability-slo.md`

### Testing Standards

- Unit: `bun test` with source-inspection pattern OR full mock chain (depending on file scope). Run isolated for files in `src/__tests__/unit/` subdir — default glob doesn't pick them up.
- Integration: Playwright spec in `tests/e2e/specs/` with `MODEL_AVAILABILITY_E2E_ENABLED=true` env gate.
- Manual smoke: open web app + extension side-panel, change account tier in admin, verify both surfaces reflect within 30s.

### Performance Budget

| Metric | Target | Notes |
|---|---|---|
| Catalog endpoint p50 | <50ms | In-memory cache hit; cold miss ~200ms |
| Catalog endpoint p99 | <500ms | Includes cross-reference with member-spend + billing |
| Web picker render delta | <16ms | No additional virtual-DOM cost vs current selector |
| Extension picker poll | <50KB/min | 30s interval × ~1KB catalog response |
| End-to-end consistency | ≤30s | NFR13 hard target |
| Unavailable selection failure rate | <0.5%/day | NFR14 SLO |

### References

- [Source: _bmad-output/planning-artifacts/epics.md#L1292](_bmad-output/planning-artifacts/epics.md#L1292) — Story 6.4 epic spec
- [Source: _bmad-output/planning-artifacts/prd.md#L180](_bmad-output/planning-artifacts/prd.md#L180) — §6.6 LLM Model Availability Boundary
- [Source: _bmad-output/planning-artifacts/prd.md#L186](_bmad-output/planning-artifacts/prd.md#L186) — §7 FR-7.1 through FR-7.5
- [Source: _bmad-output/planning-artifacts/architecture.md#L2268](_bmad-output/planning-artifacts/architecture.md#L2268) — §14 Architecture addendum
- [Source: _bmad-output/implementation-artifacts/6-1-0-advisory-risk-endpoint.md](6-1-0-advisory-risk-endpoint.md) — pattern reference for endpoint structure + observability
- [Source: _bmad-output/implementation-artifacts/8-3-llm-proxy-and-maas.md] — backend prerequisite (model registry source)
- [Source: apps/api/src/router/routes/llm.ts:18](apps/api/src/router/routes/llm.ts#L18) — `POST /chat/completions` (entitlement check insertion point)
- [Source: apps/web/src/components/session/model-selector.tsx:112](apps/web/src/components/session/model-selector.tsx#L112) — `ModelSelector` component (guardrail insertion point)
- [Source: apps/web/src/hooks/opencode/use-model-store.ts:190](apps/web/src/hooks/opencode/use-model-store.ts#L190) — `useModelStore` hook (availability fetch insertion point)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
