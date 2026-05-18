---
date: 2026-05-18
project: chainlens
project_key: NOKEY
report_type: implementation-readiness
sprint_status_source: _bmad-output/implementation-artifacts/sprint-status.yaml
stepsCompleted:
  - step-01-document-discovery
includedDocs:
  - planning-artifacts/prd.md
  - planning-artifacts/architecture.md
  - planning-artifacts/epics.md
  - planning-artifacts/ux-design-specification-v1.md
  - planning-artifacts/architecture-notes-token-sync-2026-05-18.md
  - implementation-artifacts/sprint-status.yaml
  - implementation-artifacts/* (44 story files)
---

# Implementation Readiness Assessment Report

**Date:** 2026-05-18
**Project:** Chainlens (Epsilon monorepo — Phase 1 MVP + Phase 2 Tokenomics/Enterprise + Phase 3 MMOMarket)

## Document Inventory

| Document | Path | Size | Last modified | Format |
|---|---|---|---|---|
| PRD | `planning-artifacts/prd.md` | 41 KB | 2026-05-18 | Whole |
| Architecture | `planning-artifacts/architecture.md` | 119 KB | 2026-05-18 | Whole |
| Epics | `planning-artifacts/epics.md` | 104 KB | 2026-05-18 | Whole |
| UX spec v1 | `planning-artifacts/ux-design-specification-v1.md` | 13 KB | 2026-05-15 | Whole |
| Architecture supplement | `planning-artifacts/architecture-notes-token-sync-2026-05-18.md` | 6 KB | 2026-05-18 | Whole |
| PRD validation report | `planning-artifacts/validation-report-prd-2026-05-18.md` | 14 KB | 2026-05-18 | Whole |

**Stories**: 44 story specs in `implementation-artifacts/`, tracked via `sprint-status.yaml`.

## Issues Identified at Discovery

- ✅ No duplicate whole/sharded versions
- ✅ All 4 core planning documents present
- ⚠️ UX spec is v1 (2026-05-15) — predates ~3 months of feature evolution; may need refresh in later step

## PRD Analysis

### Project Classification
- **Loại**: SaaS B2B / Enterprise / Blockchain Web3 (AI Advisory, Code Gen & Backtesting)
- **Domain**: Fintech (Crypto Intelligence & Algorithmic Strategy Validation)
- **Context**: Brownfield (refactor existing web codebase, 3-tier architecture)
- **Complexity**: Medium-High

### Functional Requirements (explicit FR-X.Y enumeration)

PRD has a dedicated "Functional Requirements" section (§7) containing only **5 explicit FRs**, all focused on the Model Availability boundary feature:

| FR | Domain | Requirement |
|---|---|---|
| FR-7.1 | LLM Catalog | Model list shows per-account `available`/`unavailable` + reason code |
| FR-7.2 | UI Guardrail | User cannot select `unavailable` model — picker must disable/hide |
| FR-7.3 | Fallback UX | When current model becomes unavailable, suggest ≥1 equivalent alternative |
| FR-7.4 | Backend Enforcement | Backend rejects request for unentitled model with consistent reason code |
| FR-7.5 | Cross-Surface | Web app + browser extension show identical availability state per account/time |

**Coverage assessment of FR-7.x**: NOT YET mapped to an Epic story. Epic 8 ("Enterprise & Privacy") includes BYOK + LLM proxy (Stories 8.1, 8.3, 8.3.1) but NO story exists for FR-7.1–7.5 model availability signaling. **GAP — see Epic Coverage section below.**

### Implicit Functional Requirements (derived from §4 MVP scope + §6 domain rules)

The bulk of the FR surface is in §4 Product Scope (MVP) and §6 Domain Requirements rather than the explicit `FR-X.Y` section. Synthesized list:

- Browser Extension auto-detect token/contract on X/Facebook/Dexscreener/CMC → Epic 6
- AI-Generated News & Discover Page → Epic 2 (Story 2.2)
- Web3 Authentication (MetaMask/WalletConnect/Phantom + SIWE) → Epic 4
- Generative AI Chat Widgets (Token Info / Risk Badge / Tx Simulation) → Epic 3 (Story 3.3)
- DeFi & Market Dashboards (TVL, Yields, Smart Money Flow) → Epic 3 (Story 3.1)
- TradingView OHLCV + overlay drawing → Epic 3 (Story 3.2)
- Token Detail Page → Epic 3 (Story 3.4)
- Backtest Sandbox Visualizer (Monaco Editor + Sharpe/Drawdown/Equity) → Epic 5 (Stories 5.0–5.3)
- Vibe-Trading Research Toolkit (21 MCP tools + Shadow Account Loop) → Epic 5 (Stories 5.4–5.6)
- Background Data Workers (DeFiLlama public/pro/selfhost/hybrid, Nansen, Dune, Token Terminal, QuickNode RPC/WSS, Arkham, mempool MEV, fact-check) → Epic 2 (Stories 2.0.1, 2.1, 2.1.1, 2.1.2, 2.2.1, 2.2.2, 2.3, 2.3.1, 2.3.2, 2.4–2.7)
- Crypto Data Provider Boundary (stable tool contract, provider ownership, self-host scope discipline) → Epic 1 + Epic 2 architecture
- JIT Data Snapshot — agent fills RAG gaps in <1.5s before LLM call → Epic 1 (Story 1.2)
- AI Code Validation Layer (smart-contract / bot reentrancy scan) → Epic 1 (Story 1.3)
- Zero-Data-Leakage outbound-block for Tier 3 → Epic 8 (Story 8.4)
- Per-User Persistent Memory (account-scoped, pgvector deferred to L2) → Epic 5 (Story 5.8)
- Shadow Account + Swarm Teams UI → Epic 5 (Story 5.6)
- Sandbox Token Sync chain (reactive auto-reconcile + chaos tests + DB-canonical migration) → Epic 5 (Stories 5.0.1 / 5.0.2 / 5.0.3 / 5.0.4)
- Tokenomics (Internal Credits + $CLENS + Buy-back/Burn + Affiliate/Airdrop) → Epic 7 (Stories 7.1–7.3)
- MMOMarket Agent Marketplace integration (One-Click Publish, SSO, Webhook, Escrow) → Epic 9 (Stories 9.1, 9.2, 9.3)
- Autonomous AI Agents Suite (Deep Research, Data Analyst, Smart Ops, Auto-Dev, 24/7 Market Monitor, Multi-Agent Swarm) → Epic 10 (Stories 10.1–10.6)
- Frontend Performance upgrade (Next.js 16 + React 19 + Bundle splitting + React Compiler) → Epic 11 (Stories 11.1–11.4)
- Advisory Risk endpoint (extension-driven public no-auth route) → Epic 6 (Story 6.1.0)

### Non-Functional Requirements

Structured + numbered NFR groups in §7 (Performance, Scalability, Reliability, Security, FE Performance, Observability):

| NFR | Group | Requirement | Target |
|---|---|---|---|
| §7.1 | Performance | TTFB AI Chat | <2s |
| §7.1 | Performance | JIT RAG Sync latency | <1.5s |
| §7.1 | Performance | Sandbox MicroVM init | <1s; 30s hard timeout |
| §7.2 | Scalability | Concurrent Users (MVP) | ≥1,000 CCU |
| §7.2 | Scalability | Data Worker auto-scaling | Per-project count |
| §7.3 | Reliability | LLM Provider fallback | <1s switch |
| §7.3 | Reliability | DeFiLlama hybrid fallback | 2-3s timeout, log latency/cache/reason |
| §7.3 | Reliability | High Availability | 99.9% uptime core |
| NFR-R1 | Reliability | Session Data Durability (Litestream) | <1s lag, RTO ~seconds → Story 8.5 |
| NFR-R2 | Reliability | Sandbox Wake Verification | /epsilon/health 200 before return → Story 8.5 |
| NFR-R3 | Reliability | Provisioning Retry Backoff | exponential [2s,15s,60s] → Story 8.5 |
| §7.4 | Security | Atomic Credit Deduction (NFR8) | PostgreSQL function, no TOCTOU |
| NFR-S1 | Security | No fire-and-forget billing | await all deductToolCredits → Story 8.5 |
| NFR-S2 | Security | Rate limiting | 3/h provision, 100/min LLM → Story 8.5 |
| NFR-S3 | Security | Secrets encryption at rest | pgcrypto sym encrypt → Story 8.5 |
| NFR-S4 | Security | No token-in-URL | first-message WS auth → Story 8.5 |
| NFR10 | Security | Sandbox isolation / egress | deny-by-default outbound |
| NFR-FE1 | FE Perf | FCP | <1.5s → Epic 11 |
| NFR-FE2 | FE Perf | TTI | <3s → Epic 11 |
| NFR-FE3 | FE Perf | Initial JS bundle | ≤800KB → Story 11.2 |
| NFR-FE4 | FE Perf | Dev server startup | ≥50% faster → Story 11.1 |
| NFR-FE5 | FE Perf | Zero regression | bun test passes; no blank screen → Story 11.3 |
| NFR-O1 | Observability | OTLP traces + key metrics | Story 8.5 |
| NFR-O2 | Observability | Stable named Cloudflare Tunnel URL | Story 8.5 |
| NFR-O3 | Observability | Multi-replica safe dedup | Postgres advisory lock → Story 8.5 |
| NFR-O4 | Observability | Model availability freshness | ≤30s UI sync |
| NFR-O5 | Observability | Unavailable selection failure rate | <0.5%/day |

### Domain Requirements (§6 — high-level constraints)

- **§6.1 JIT Data Sync**: no hard SLA; per-request snapshot fills gaps from real-time sources before LLM call
- **§6.2 Multi-chain Agnostic**: rely on LLM intrinsic chain awareness (EVM/Solana/Move) — no per-chain hard-coding
- **§6.3 Code Validation Layer**: every AI-generated contract/bot must pass scan + sandbox test
- **§6.4 Zero-Data-Leakage (Tier 3)**: inbound-only RAG sync, outbound telemetry blocked
- **§6.5 Crypto Data Provider Boundary**: stable tool contract; backend owns auth/billing/cache/fallback; self-host scope discipline
- **§6.6 LLM Model Availability Boundary**: backend authoritative; reason codes; no secret leakage to client

### Out-of-Scope (§9)

1. Non-Custodial only — no private key storage, no on-behalf trading
2. No internal Fiat on/off-ramp (3rd-party gateways: Stripe/MoonPay/Binance Pay)
3. No proprietary L1/L2
4. No "Buy/Sell" financial advice — always disclaimers

### Roadmap (§10)

| Phase | Goal | Epics |
|---|---|---|
| Phase 1 — MVP | Multi-Agent Tier 1+2, Data Workers, Vibe Trading sandbox | 1, 2, 3, 4, 5, 6, 11 |
| Phase 2 — Tokenomics/Enterprise + Autonomous | $CLENS launch, Burn/Buy-back, Tier 3 packaging, MMOMarket, Autonomous Suite | 7, 8, 10, 9 |
| Phase 3 — MaaS | Crypto-specific LLM training, API for 3rd-party DApps | (not yet decomposed into epics) |

### PRD Completeness Assessment

**Strengths:**
- Clear 3-tier model + 7 user journeys (Minh / Alex / Sarah / Đạt / Kevin / David / Ryan) provide concrete personas
- §7 NFRs are heavily numbered/tracked with explicit story pointers (NFR-R1→8.5, NFR-S2→8.5, etc.)
- §6 domain requirements act as architectural guardrails (provider boundary, JIT sync, no outbound for Tier 3)
- Out-of-scope (§9) is explicit (no custodial wallet, no Fiat ramp, no L1/L2, no buy-sell advice)

**Gaps:**
- ⚠️ §7 "Functional Requirements" is sparse (5 FRs only — all model availability). Most product surface lives in §4 MVP scope text and §6 domain rules. A numbered FR enumeration covering all features would improve traceability.
- ⚠️ FR-7.1–7.5 (Model Availability) NOT yet assigned to a story. No `epic-X-model-availability` line in sprint-status.yaml.
- ⚠️ Phase 3 (MaaS) not yet decomposed into epics — backlog placeholder only.
- ⚠️ Tier 3 Team Workspace mentioned in §3.1 but no story exists yet.
- ⚠️ Some §7.3 reliability targets (HA 99.9%, LLM fallback <1s) lack a verification path (no monitoring story).

## Epic Coverage Validation

### Coverage Source

The epics file (`planning-artifacts/epics.md` §FR Coverage Map, lines 95-128) provides a comprehensive **30-FR enumeration** (FR1–FR30) that supersedes the PRD's sparse §7 list (FR-7.1–7.5 only). The epics file's FR list IS the authoritative FR catalog for traceability — the PRD §7 enumeration is a narrow Model Availability subset and should be deprecated in favor of the epics enumeration.

### FR Coverage Matrix (30 FRs total)

| FR | Description | Epic | Story status |
|---|---|---|---|
| FR1 | Multi-Agent Core (Tier 1/2 refactor) | Epic 1 | Story 1.4 done |
| FR2 | Background Workers crawl/index DeFiLlama, Dune, Nansen | Epic 2 | Stories 2.1–2.3.2 done; 2.4–2.7 backlog |
| FR3 | Vibe Trading platform (backtest + 21 MCP tools) | Epic 5 | Stories 5.0–5.5 done; 5.6 review |
| FR4 | Browser Extension auto-detect tokens | Epic 6 | Story 6.1 done; 6.1.1 review; 6.1.2/6.1.3 backlog |
| FR5 | AI-Generated News & Discover Page | Epic 2 | Story 2.2 done |
| FR6 | Web3 Authentication Module | Epic 4 | Stories 4.1–4.3 backlog |
| FR7 | Generative AI Chat Widgets | Epic 3 | Story 3.3 done |
| FR8 | Data Integrations / Deep Research | Epic 1 | Story 1.1 done |
| FR9 | DeFi & Market Dashboards | Epic 3 | Story 3.1 done |
| FR10 | Advanced Charting (TradingView) | Epic 3 | Story 3.2 done |
| FR11 | Backtest Sandbox Visualizer | Epic 5 | Stories 5.2, 5.3 done |
| FR12 | Internal Credits System | Epic 7 | Story 7.1 backlog |
| FR13 | $CLENS Token Smart Contract | Epic 7 | Story 7.2 backlog |
| FR14 | Affiliate / Airdrop System | Epic 7 | Story 7.3 backlog |
| FR15 | On-premise Enterprise packaging (Tier 3) | Epic 8 | Story 8.4 (Zero-Data-Leakage) backlog |
| FR16 | BYOK & Proof of Contribution | Epic 8 | Story 8.1 backlog |
| FR17 | Local Compute / Ollama | Epic 8 | Story 8.2 backlog |
| FR18 | LLM Proxy & MaaS | Epic 8 | Story 8.3 backlog; 8.3.1 ready-for-dev |
| FR19 | JIT Data Sync | Epic 1 | Story 1.2 done |
| FR20 | Agnostic Multi-chain Support | Epic 4 | (no dedicated story — relies on LLM intrinsic capability per §6.2) |
| FR21 | Security & Hallucination Mitigation | Epic 1 | Story 1.3 done |
| FR22 | Zero-Data-Leakage (Tier 3) | Epic 8 | Story 8.4 backlog |
| FR23 | MMOMarket Account Linking (SSO) | Epic 9 | Story 9.1 backlog |
| FR24 | One-Click Publish | Epic 9 | Story 9.1 backlog |
| FR25 | Webhook Order Lifecycle | Epic 9 | Story 9.2 backlog; 9.3 ready-for-dev |
| FR26 | Model Availability State | Epic 6 | **Story 6.4 in epics.md BUT NOT in sprint-status.yaml — GAP** |
| FR27 | Selection Guardrail | Epic 6 | **Story 6.4 — GAP** |
| FR28 | Fallback Guidance | Epic 6 | **Story 6.4 — GAP** |
| FR29 | Server-Enforced Entitlement | Epic 6 | **Story 6.4 — GAP** |
| FR30 | Cross-Surface Consistency | Epic 6 | **Story 6.4 — GAP** |

### NFR Coverage Matrix (14 NFRs cross-cutting)

| NFR | Description | Story(s) |
|---|---|---|
| NFR1 | TTFB AI Chat <2s | — (cross-cutting; no dedicated story; verify in 8.5) |
| NFR2 | JIT RAG Sync latency <1.5s | Story 1.2 (JIT) |
| NFR3 | Sandbox MicroVM <1s init / 30s hard timeout | Story 5.0 (foundation) |
| NFR4 | ≥1,000 CCU (MVP) | — (no load-test story) |
| NFR5 | Worker auto-scaling | — (cross-cutting; no story) |
| NFR6 | LLM provider fallback <1s | Story 8.3.1 (bidirectional fallback) ready-for-dev |
| NFR7 | HA 99.9% core | Story 8.5 (Production-Grade Platform Reliability) ready-for-dev |
| NFR8 | Atomic credit deduction | Story 7.1 backlog + Story 8.5 audit |
| NFR9 | Rate limiting Tier 1 (IP+Account) | Story 8.5 (NFR-S2 sub-task) |
| NFR10 | Sandbox isolation / no outbound | Story 5.0 (egress whitelist done) |
| NFR11 | AI Report & Code Accuracy >80% | — (no dedicated benchmark story) |
| NFR12 | Non-custodial (no PK storage) | Architectural constraint — enforced by §9 out-of-scope, no story |
| NFR13 | Model availability freshness ≤30s | **Story 6.4 — GAP** |
| NFR14 | Unavailable selection failure <0.5%/day | **Story 6.4 — GAP** |

### Missing Coverage (CRITICAL gaps)

**Gap G1 — FR26–30 + NFR13–14 (Model Availability): Story 6.4 exists in epics.md but NOT tracked in sprint-status.yaml**

- **Impact (HIGH)**: 5 FRs + 2 NFRs unallocated. Backend already has model registry infrastructure (LLM proxy in 8.3) but no UI guardrail. Users will continue to encounter `quota_exceeded` / `plan_not_entitled` failures with no preventive UI.
- **Action**: Add `6-4-model-availability-quota-guardrail: backlog` to sprint-status.yaml. Reference: [epics.md:1305-1326](_bmad-output/planning-artifacts/epics.md#L1305).
- **Dependency**: requires LLM Proxy backend (Story 8.3) for the availability API source. Order: 8.3 → 6.4.

**Gap G2 — Deep-Dive stories in epics.md NOT in sprint-status**

- 3.1.1 (Multi-dimensional Narrative Screener) — duplicate heading in epics.md lines 643 + 658, likely a doc bug
- 3.2.1 (On-chain Data Chart Overlays)
- 3.3.1 (Contract Audit Decompiler & Yield Simulator Widgets)
- 3.3.2 (Sub-Agent Activity & Tool Execution Drawer)
- 3.4.1 (Tokenomics Vesting & Holder Gini Coefficient)
- **Impact (MED)**: 5 deep-dive enhancements scoped in epics but not tracked. Likely intentional deferral (post-MVP enhancements) but should be explicit. Either add as `backlog` lines OR delete from epics.md to reflect actual scope.

**Gap G3 — Epic 2 DeFiLlama / Yields / Pro tools NOT in sprint-status**

- Story 2.4 (DeFiLlama Full Crawler Worker)
- Story 2.5 (Token Price Lookup Tool)
- Story 2.6 (Yields APY Lookup Tool)
- Story 2.7 (DeFiLlama Pro Data Tools)
- **Impact (MED)**: FR2 marked covered but 4 sub-stories that operationalize it aren't tracked. Sprint-status only has 2.1–2.3.2.
- **Action**: Add `2-4-defillama-full-crawler-worker: backlog`, `2-5-token-price-lookup-tool: backlog`, `2-6-yields-apy-lookup-tool: backlog`, `2-7-defillama-pro-data-tools: backlog`.

**Gap G4 — NFR4 (1,000 CCU) + NFR1 (TTFB <2s) + NFR11 (Accuracy >80%) have NO dedicated verification story**

- **Impact (MED-LOW)**: These are runtime/quality targets without a dedicated benchmark/load-test story. Story 8.5 covers some reliability NFRs but not load testing.
- **Action**: Either fold into 8.5 sub-task OR create separate Story 8.6 "Load testing + accuracy benchmark suite".

**Gap G5 — Tier 3 Team Workspace mentioned in §3.1 + FR15 but no dedicated story exists**

- **Impact (LOW)**: §3.1 mentions "team collaboration" for Tier 3. Story 8.4 only covers Zero-Data-Leakage, not team workspace.
- **Action**: Deferred to post-MVP or expand Story 8.4 scope.

### Coverage Statistics

- **Total FRs in epics catalog**: 30
- **FRs fully tracked in sprint-status**: 24 (FR1–25 minus 6.4 cluster, plus some backlog)
- **FRs missing from sprint-status (Story 6.4 cluster)**: 5 (FR26–30)
- **NFRs covered in stories**: 9/14 (NFR2, 3, 6, 7, 8, 9, 10 + NFR-R1–R3, NFR-S1–S4, NFR-O1–O3 via Story 8.5; plus NFR13/14 via missing 6.4)
- **NFRs with no verification path**: 4 (NFR1 TTFB, NFR4 CCU, NFR5 auto-scaling, NFR11 accuracy)
- **Coverage percentage**: ~83% FRs + ~64% NFRs have a dedicated tracked story

## UX Alignment Assessment

### UX Document Status

**Found** — [ux-design-specification-v1.md](_bmad-output/planning-artifacts/ux-design-specification-v1.md) (13 KB, last modified 2026-05-15, 9 sections).

Sections covered: Personas (2), Core Experience (4 surfaces), Integration with Architecture, Visual Design Foundation ("Liquid Glass macOS 26 Tahoe Style"), Design Direction (Adaptive Liquid Glass: Ambient + Alert mode), User Journey Flows, Component Strategy, UX Consistency Patterns, Responsive & Accessibility.

### UX ↔ PRD Alignment

| UX element | PRD anchor | Status |
|---|---|---|
| §1.1 Degen Explorer persona | PRD §5.1 Minh persona (different framing — UX uses behavior personas, PRD uses tier personas) | ⚠️ Persona model divergence — UX has 2 behavior types, PRD has 7 tier/journey personas. Acceptable since UX focuses on UI surfaces. |
| §1.2 Crypto Researcher persona | PRD §5.2 Alex (Tier 2 Quant Trader) | ✅ Conceptually aligned |
| §2.1 Vigilant Companion Extension (tooltip with Trust Score) | PRD §4.1 Browser Extension + FR4 + FR26-30 | ✅ Covered |
| §2.2 Chainlens Pulse (AI News Feed) | PRD §4.1 AI-Generated News & Discover + FR5 | ✅ Covered (Story 2.2 done) |
| §2.3 Interactive Audit Panel (Chat + Data Viz + Code Sandbox) | PRD §4.1 Generative AI Chat Widgets + FR7 + FR11 | ✅ Covered (Stories 3.3, 5.2, 5.3 done) |
| §4 Visual Design "Liquid Glass" | Not in PRD | ⚠️ UX-only decision — not referenced in PRD. Acceptable (PRD focuses on behavior, UX owns aesthetics) but worth noting in PR review when stories ship. |
| §6 User Journey Flows | PRD §5.1–5.7 | ✅ Aligned |

### UX ↔ Architecture Alignment

UX §3 explicitly references architecture:
- **Vercel AI SDK** for streaming + generated UI — ⚠️ Stack note in CLAUDE.md indicates project moved to **`@opencode-ai/sdk` v1.x**, NOT Vercel AI SDK. UX spec section §3 is OUTDATED. **Action: refresh UX spec or annotate stack drift.**
- **`apps/api` (Epsilon API) REST + async workers** — ✅ Matches actual architecture
- **Fault isolation** — ✅ Matches (Vibe-Trading isolated container, MCP proxy pattern in Story 5.5)

### Architectural support for UX requirements

| UX requirement | Architecture support | Status |
|---|---|---|
| §2.1 Tooltip <100ms response | Story 6.1 done + advisory endpoint 6.1.0 in progress | ✅ |
| §2.1 Glassmorphic UI overlay on 3rd-party sites | Apps/extension content-script (apps/extension/src/content/index.ts) | ✅ |
| §2.2 AI News Feed real-time | Story 2.2 + 2.2.1 + 2.2.2 done (BullMQ workers + indexing) | ✅ |
| §2.3 Code Sandbox (Premium) | Vibe-Trading sandbox (Story 5.0 foundation + 5.0.1/5.0.2 hardening done) | ✅ |
| §4.2 Aurora gradient + heavy backdrop-blur | Frontend perf budget (NFR-FE3 800KB bundle cap) — heavy CSS effects + GPU compositing may stress mobile devices | ⚠️ Needs perf validation in Epic 11 |
| §9 Responsive & Accessibility (a11y) | No dedicated accessibility story tracked | ⚠️ **No story covers a11y testing** |

### UX Warnings

- ⚠️ **W-UX1 — Stack drift**: UX §3 lists Vercel AI SDK; codebase uses `@opencode-ai/sdk` v1.x. Tooltips/widgets render via post-hoc parser (`ToolRegistry`), not Vercel `streamUI`. Refresh UX spec OR document the gap.
- ⚠️ **W-UX2 — Persona model divergence**: UX has 2 behavior personas; PRD has 7 tier-based journey personas. Not a blocker but reviewers may need both files open.
- ⚠️ **W-UX3 — No a11y story tracked**: §9 mentions Responsive Design & Accessibility, but no story enforces WCAG conformance / keyboard nav / screen reader testing. Recommend adding to Epic 11 (FE Performance) or new story under Epic 3.
- ⚠️ **W-UX4 — Stale doc date**: UX is v1 (2026-05-15) and predates 4 Epic 5 stories (5.0.1, 5.0.2, 5.0.3, 5.0.4) and Epic 6 advisory work. Refresh recommended before Phase 2 launch.

## Epic Quality Review

### Method

Sampled the structure of all 11 epics in `epics.md` (Epic 1–10 + Epic 11) and spot-read AC depth on 8 representative stories across phases. The full 70+ stories were not individually re-validated; this section focuses on structural and dependency patterns.

### Epic Structure Validation

| Epic | Title | User Value | Independence | Verdict |
|---|---|---|---|---|
| Epic 1 | AI Crypto Research Tools | ✅ Direct user value (deep research, JIT data, code validation) | ✅ Self-contained (Tier 1+2 capabilities only) | PASS |
| Epic 2 | Crypto Data Infrastructure | ⚠️ Infra-flavored title but stories deliver user-visible features (Discover feed, smart-money labels) | ✅ Independent (consumes nothing from Epic 3+) | PASS with caveat |
| Epic 3 | Crypto Native Trading UI | ✅ UI surfaces (dashboards, charts, widgets, token detail) | ⚠️ Depends on Epic 2 data workers being shipped — but Epic 2 stories are mostly done | PASS |
| Epic 4 | Web3 Identity | ✅ Wallet connect + multi-chain | ⚠️ Depends on Epic 1 base — acceptable | PASS |
| Epic 5 | Backtesting Sandbox | ✅ Tier 2 sandbox + Vibe-Trading + Shadow Account + Memory | ✅ Independent (Vibe-Trading isolated container) | PASS |
| Epic 6 | Browser Intelligence Extension | ✅ Vigilant Companion extension surface | ⚠️ Depends on Epic 2 (data) + Epic 3 (web app for Expand button) | PASS |
| Epic 7 | Credit Economy & Tokenomics | ✅ Internal Credits + $CLENS + Affiliate | ⚠️ Depends on Epic 5 (need usage tracking) | PASS |
| Epic 8 | Enterprise & Privacy | ✅ Tier 3 packaging + BYOK + LLM proxy + Zero-Data-Leakage | ⚠️ Depends on Epic 5/6 infra | PASS |
| Epic 9 | Agent Marketplace Integration | ✅ MMOMarket publish/buy flow | ⚠️ Heavy external dependency on MMOMarket platform | PASS |
| Epic 10 | Autonomous AI Agents | ✅ Manus-clone capabilities (web scraper, data analyst, auto-dev, market monitor) | ⚠️ Depends on Epic 5 sandbox + Epic 6 extension + Epic 8 BYOK | PASS — biggest dependency cluster |
| Epic 11 | FE Performance & Platform Upgrade | ⚠️ Pure technical upgrade (Next.js 16 / React 19 / bundle splitting) — no direct user value | ✅ Independent | **VIOLATION — technical epic** but justified as cross-cutting perf hygiene per NFR-FE1–5 |

### Critical Violations (🔴)

- **🔴 V1 — Epic 11 is a "Technical Epic"** (Next.js upgrade, React Compiler, bundle splitting). Strictly per best-practice, this should be folded into Epic 3 / Epic 5 stories OR justified as a cross-cutting platform hygiene initiative. The PRD §7.5 (NFR-FE1–5) does treat FE performance as a numbered requirement set with measurable targets, which provides justification. **Accept as platform hygiene epic** but mark for explicit user-value mapping (e.g., "users experience <1.5s FCP on dashboards") in the epic intro.

### Major Issues (🟠)

- **🟠 M1 — Story 6.4 missing from tracking**: Already documented as Gap G1 in Epic Coverage section. Severity bumps to Major here because the entire 5-FR cluster (FR26–30 + NFR13–14) is unscheduled.
- **🟠 M2 — Duplicate Story 3.1.1 heading in epics.md**: Lines 643 + 658 both labeled "Story 3.1.1: Multi-dimensional Narrative Screener (Deep Dive)". Doc bug — one should be deleted or renumbered.
- **🟠 M3 — 5 Deep-Dive stories scoped in epics but not in sprint-status** (Gap G2). Either explicit `backlog` entries or removal needed.
- **🟠 M4 — Epic 2 Stories 2.4–2.7 (DeFiLlama Full Crawler, Price Lookup, Yields APY, Pro Data Tools) tracked in epics but not in sprint-status** (Gap G3). FR2 nominally covered, but the operationalization is incomplete.
- **🟠 M5 — Forward dependency on Epic 8.3 from Epic 6.4**: Story 6.4 (Model Availability) needs LLM Proxy backend (8.3) for the availability API source, but 6.4 is in Epic 6 and 8.3 is later. Either move 6.4 to Epic 8 OR sequence delivery 8.3 → 6.4 explicitly in the sprint plan.

### Minor Concerns (🟡)

- **🟡 m1 — Story 5.0.x naming convention**: Hotfix stories (5.0.1, 5.0.2, 5.0.3, 5.0.4, 5.0.5) cluster under "Story 5.0 — Vibe-Trading Platform Foundation". The naming is consistent but the count (5 hotfixes for 1 foundation story) signals the foundation story was undersized initially. Consider retrospective on whether `5-0` should have been decomposed earlier.
- **🟡 m2 — Tier 3 Team Workspace gap (Gap G5)**: Mentioned in §3.1 PRD but no dedicated story. Should be either scheduled or explicitly de-scoped.
- **🟡 m3 — A11y story missing (W-UX3)**: §9 UX spec mentions accessibility but no story enforces WCAG.
- **🟡 m4 — Stale UX spec (W-UX4)**: v1 from 2026-05-15, predates 4 Epic 5 stories. Refresh recommended.
- **🟡 m5 — UX stack drift (W-UX1)**: UX spec mentions Vercel AI SDK; actual stack is `@opencode-ai/sdk` v1.x.
- **🟡 m6 — Phase 3 (MaaS) not decomposed into epics**: PRD §10 outlines Phase 3 but `epics.md` has no Epic 12+. Acceptable since Phase 3 is post-Phase-2.

### Best-Practices Compliance Checklist

| Check | Status | Notes |
|---|---|---|
| Each epic delivers user value | ⚠️ | 10/11 deliver direct user value; Epic 11 is platform hygiene (justified by NFR-FE) |
| Each epic can function independently | ⚠️ | Epics 3/4/6/7/8/9/10 have soft dependencies on earlier epics (acceptable — DAG ordering, not circular) |
| Stories sized appropriately | ✅ | All sampled stories sized 1 day or less |
| No forward dependencies | ⚠️ | Story 6.4 needs Story 8.3 (M5) |
| Database tables created when needed | ✅ | Per AR3 (Drizzle additive-only) — stories declare their own schema additions |
| Clear acceptance criteria (BDD G/W/T) | ✅ | All sampled stories use Given/When/Then |
| Traceability to FRs maintained | ⚠️ | Stories 6.4 / 2.4 / 2.5 / 2.6 / 2.7 break the chain because they're not tracked |

## Summary and Recommendations

### Overall Readiness Status

**🟢 READY FOR PHASE 1 CONTINUATION — with 1 Critical action + 5 Major actions before Phase 2 launch.**

Phase 1 (MVP — Epics 1–6, 11) is in healthy progress: Epic 1 done (4/4), Epic 2 mostly done (8 of 11 stories shipped), Epic 3 mostly done (4 of 5), Epic 5 nearly done (10 of 14 — 4 in review + 5.7/5.8 backlog), Epic 6 active (1 done, 2 in flight, 4 backlog), Epic 4 entirely backlog, Epic 11 entirely backlog. Phase 2 / Phase 3 epics are still planning artifacts (no implementation started except Epic 8.5 backlog).

The reactive sandbox token-sync chain (Stories 5.0.1 / 5.0.2 / 5.0.4) is the most material recent achievement: 16 commits this session, 5+11 code-review patches applied, 57 unit tests + 2 E2E chaos specs + runbook. This closes the user-attributable persistent memory loop (Story 5.8) which had been silently degrading to anonymous.

### Critical Issues Requiring Immediate Action (🔴)

**🔴 C1 — Story 6.4 (Model Availability & Quota Guardrail) is unscheduled despite being a 5-FR + 2-NFR cluster.**

- **Evidence**: FR26–30 + NFR13–14 in epics.md §FR Coverage Map point to Story 6.4 (epics.md:1305-1326), but `sprint-status.yaml` has no `6-4-*` line and no story file exists in `implementation-artifacts/`.
- **User impact**: Users continue to hit `quota_exceeded` / `plan_not_entitled` errors at the model selection moment — exactly the failure mode the FR26-30 cluster was scoped to prevent.
- **Action**: Run `/bmad-create-story 6.4` to generate the story spec from the epic, then add `6-4-model-availability-quota-guardrail: backlog` to sprint-status.yaml. Sequence after Story 8.3 (LLM Proxy) which provides the availability API source.

### Major Actions Before Phase 2 Launch (🟠)

**🟠 A1 — Track Epic 2 sub-stories 2.4 / 2.5 / 2.6 / 2.7 in sprint-status** (Gap G3). 4 backlog lines needed. FR2 is nominally covered but operationalization is fragmented.

**🟠 A2 — Add explicit `backlog` lines for 5 Deep-Dive stories in sprint-status** (Gap G2): 3.1.1 (dedupe heading first), 3.2.1, 3.3.1, 3.3.2, 3.4.1. Or delete from epics.md if intentionally out-of-MVP.

**🟠 A3 — Dedupe Story 3.1.1 heading in epics.md** (Quality issue M2). Lines 643 + 658 are duplicate "Story 3.1.1: Multi-dimensional Narrative Screener (Deep Dive)" — keep one, delete the other.

**🟠 A4 — Document Story 8.3 → Story 6.4 sequencing** (Quality issue M5 forward-dependency). Add note in epics.md Epic 6 intro that Story 6.4 cannot start until Story 8.3 LLM Proxy ships.

**🟠 A5 — Run `/bmad-create-story 5.7` and `/bmad-create-story 5.8` follow-ups** — these are marked backlog/done but Phase 2 BYOK + memory iteration depends on them.

### Minor Cleanup (🟡)

- 🟡 m1 — Refresh UX spec (currently v1 from 2026-05-15; predates 4 Epic 5 stories + advisory work). Recommend `ux-design-specification-v2.md`.
- 🟡 m2 — UX spec §3 mentions Vercel AI SDK — replace with `@opencode-ai/sdk` v1.x + `ToolRegistry` pattern note (matches CLAUDE.md stack record).
- 🟡 m3 — Add a11y story under Epic 11 or Epic 3 for WCAG conformance.
- 🟡 m4 — File Tier 3 Team Workspace story (Gap G5) — either schedule or explicitly defer to Phase 3.
- 🟡 m5 — Add load-test / accuracy-benchmark verification path for NFR1, NFR4, NFR5, NFR11 (Gap G4). Fold into 8.5 sub-task or new Story 8.6.
- 🟡 m6 — Decompose Phase 3 (MaaS) into epics when ready — currently only PRD §10 roadmap mention.

### Implementation Velocity Snapshot

- **This session**: 16 commits, 5 stories closed (5.0.1, 5.0.2, 5.6 audit fixes, 5.0.4, 5.0.5 filed)
- **Sprint 1 Phase 1 closure**: Stories 5.0.1 + 5.0.2 + 5.0.4 done unlocks 5.0.3 (DB-canonical migration — Layer A/B/C/D drift elimination)
- **Test coverage added**: 57 unit tests + 2 E2E chaos specs + 1 runbook + 11 code patches across 4 production files + 1 submodule patch (Vibe-Trading Dockerfile)
- **Sprint 2 ready-for-dev**: 5.0.3, 5.0.4 (now done), 5.0.5 (CI scaffolding), 8.3.1 (LLM proxy fallback), 8.5 (Production-Grade Platform Reliability), 9.3 (Shared Pool Routing), 10.1 (Autonomous Web Scraper)

### Recommended Next Steps (executable today)

1. **Run `/bmad-create-story 6.4`** to generate Story 6.4 Model Availability & Quota Guardrail spec from the epic. Add to sprint-status.yaml as `backlog`.
2. **Patch sprint-status.yaml** to add lines for Stories 2.4, 2.5, 2.6, 2.7 (Epic 2 DeFiLlama sub-stories) + 3.1.1, 3.2.1, 3.3.1, 3.3.2, 3.4.1 (Deep-Dive variants) — all `backlog`.
3. **Edit epics.md line 643/658** to remove the duplicate Story 3.1.1 heading.
4. **Pick the next story to develop** — best candidates from `ready-for-dev`: Story 5.0.3 (Token Lifecycle DB-Canonical), Story 8.3.1 (LLM Proxy Bidirectional Fallback), Story 8.5 (Production-Grade Platform Reliability), Story 5.0.5 (CI scaffolding — unblocks chaos test CI gating). Recommended order: **8.5 → 8.3.1 → 6.4 → 5.0.3**. Rationale: 8.5 reliability covers many cross-cutting NFRs; 8.3.1 unblocks 6.4; 5.0.3 is week-long phased rollout best done after Sprint 1 stabilization.
5. **Schedule UX spec v2 refresh** — add `ux-design-specification-v2.md` task to next sprint planning to reflect actual stack (`@opencode-ai/sdk`) + the 4 Epic 5 hardening stories.

### Final Note

This assessment identified **1 critical (C1) + 5 major (A1–A5) + 6 minor (m1–m6) actionable items** across 4 categories (FR coverage, story tracking, doc freshness, dependency sequencing). The implementation is **READY to continue Phase 1 work** — the critical item (Story 6.4) and majors are paperwork / sprint-status edits, not engineering blockers. Address C1 before Phase 2 (Tokenomics + Enterprise + Autonomous Agents) launch since model availability gating is required for the LLM Proxy + BYOK + MaaS revenue paths.

**Phase 1 → Phase 2 transition gate**: All "done" status verified, Stories 5.0.3 + 8.5 shipped, Story 6.4 filed and in progress.

---

## Resolution Log (post-IR cleanup, 2026-05-18)

Same-day follow-up actions taken against the 12 findings above:

| Finding | Status | Resolution |
|---|---|---|
| C1 — Story 6.4 untracked | ✅ RESOLVED | `a7423d33ef` (planning artifacts: PRD §6.6/§7 + Architecture §14 + Epics Story 6.4 spec) + `312c095d84` (sprint-status backlog line) + `d407c44cd4` (full Story 6.4 spec file in implementation-artifacts/, status=ready-for-dev) |
| A1 — Epic 2 sub-stories 2.4-2.7 untracked | ✅ RESOLVED | `312c095d84` (4 backlog lines added: defillama-full-crawler, token-price-lookup, yields-apy-lookup, defillama-pro-data-tools) |
| A2 — 5 Deep-Dive variants untracked (3.1.1/3.2.1/3.3.1/3.3.2/3.4.1) | ✅ RESOLVED | `312c095d84` (5 backlog lines added under Epic 3) |
| A3 — Duplicate Story 3.1.1 heading in epics.md (lines 643+658) | ✅ RESOLVED | `312c095d84` (second copy deleted) |
| A4 — Story 8.3 → 6.4 forward-dependency sequencing undocumented | ✅ RESOLVED | `312c095d84` (Epic 6 intro note added) |
| A5 — Run `/bmad-create-story 5.7` follow-up | ⏸️ DEFERRED | 5.7 (User LLM Key Management) still backlog; file when sprint actually picks it up |
| m1 — UX spec v1 stale | ⏸️ DEFERRED | User to decide if v2 refresh is worth it now |
| m2 — UX §3 Vercel AI SDK stack drift | ⏸️ DEFERRED | Tied to m1 — refresh v2 in one go |
| m3 — No a11y story | ⏸️ DEFERRED | User to schedule |
| m4 — Tier 3 Team Workspace gap | ⏸️ DEFERRED | Post-MVP scope decision |
| m5 — NFR1/4/5/11 verification path | ⏸️ DEFERRED | Either fold into 8.5 or new Story 8.6 — needs PM decision |
| m6 — Phase 3 (MaaS) epics undecomposed | ⏸️ DEFERRED | Natural at this stage; address when Phase 2 ships |

**Bonus housekeeping** (not in original IR scope but completed same session):
- Vibe-Trading submodule: removed tracked `frontend/frontend_startup.log` runtime artifact + added `frontend/*.log` to .gitignore; submodule pointer bumped (`aa8cee50d4`). Clears long-standing dirty submodule warning.

**Net result**: 1 CRITICAL + 4 MAJOR resolved same-day (5 of 6 majors closed). 6 MINOR + 1 MAJOR (A5) deferred for sprint planning. Working tree clean; branch ahead of remote by all session commits on `feat/rename-chainlens-epsilon`.

**Phase 1 → Phase 2 gate updated**: All paperwork blockers closed except A5 (5.7 spec). Engineering blockers remain only Story 8.3 (LLM Proxy) which is required prerequisite for both 5.7 (BYOK infra) and 6.4 (Model Availability UI). Recommended sequence unchanged: **8.5 → 8.3.1 → 6.4 → 5.0.3**.

---

*Report generated by `/bmad-check-implementation-readiness` skill on 2026-05-18 by Claude Opus 4.7 (1M context). Inputs: 4 core planning docs (prd.md / architecture.md / epics.md / ux-design-specification-v1.md) + 44 story files + sprint-status.yaml + 1 supplemental architecture note. Method: file inventory → PRD extraction → epic coverage matrix → UX alignment → epic quality review → summary → same-day resolution log.*
