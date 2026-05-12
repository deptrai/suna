# Implementation Readiness Assessment Report

**Date:** 2026-05-12
**Project:** chainlens
**Assessor:** Winston (System Architect) — bmad-check-implementation-readiness skill
**Scope:** Stories 5.5, 5.6, 5.7, 5.8 (Vibe-Trading integration expansion)
**Excluded:** Stories 5.0–5.4 (already done)

---

## Document Inventory

**Planning documents:**
- `_bmad-output/planning-artifacts/prd.md` (198 lines) — narrative, uses epics.md for FR numbering
- `_bmad-output/planning-artifacts/architecture.md` (1200 lines)
- `_bmad-output/planning-artifacts/epics.md` (1168 lines) — updated 2026-05-12 with 5.5-5.8 breakdown
- `_bmad-output/planning-artifacts/ux-design-specification-v1.md` (14KB)

**Stories under review:**
- `5-5-vibe-trading-research-tools-p0.md` — ready-for-dev
- `5-6-shadow-account-trade-journal-ui.md` — ready-for-dev
- `5-7-web-file-tools-and-swarm-readonly.md` — backlog
- `5-8-llm-key-management-and-swarm-run.md` — backlog

**Issues:** None — no duplicates, all required docs present.

---

## PRD Analysis

### Functional Requirements (from epics.md FR Coverage Map)

Relevant to Stories 5.5–5.8:
- **FR3**: Tích hợp Vibe Trading API & Sandbox cho Tier 2 backtest cơ bản → Epic 5
- **FR11**: Backtest Sandbox Visualizer — Monaco + KPI + Equity Curve → Epic 5
- **FR8**: Data Integrations — DeFiLlama/Nansen/Dune/Perplexity → Epic 1 primary, 5.5 extends with 6 sources
- **FR16**: BYOK & Proof of Contribution — dùng API key cá nhân → Story 5.8
- **FR21**: Security & Hallucination Mitigation → Story 5.7 SSRF/path hardening extends

### Non-Functional Requirements

- **NFR3**: Sandbox init <1s; timeout cứng 30s per backtest — **critical cho 5.5 factor_analysis 15s timeout**
- **NFR8**: Atomic Credit Deduction — partial deduction forbidden — **critical cho ALL 4 stories**
- **NFR10**: Sandbox Isolation — no outbound, only VT API internal — **critical: drove HTTP extension architecture decision**
- **NFR12**: Non-custodial — no private key storage — relevant Story 5.8 (encrypted user keys at rest)

### Additional Requirements (Architecture constraints)

- **AR3**: Drizzle additive-only — Story 5.8 `user_ai_keys` table compliant
- **AR5**: AI tools = tool files in core/ OR MCP servers — HTTP extension pattern valid under AR5
- **AR6**: Billing proxy at apps/api/src/router/routes/ — pattern followed

### PRD Completeness Assessment

**Gaps:**
1. PRD không mention "Shadow Account" (VT flagship) — Stories 5.6 expands beyond PRD FR3. Needs product signoff.
2. PRD không mention 72 finance skills, 29 swarm teams — Stories 5.5/5.7/5.8 expand scope.
3. NFR3 says "MicroVM/Firecracker" but implementation is Docker container (Story 5.0 documented divergence).
4. PRD không có pricing table — Stories 5.5-5.8 tự quyết ($0.02–$1.00).

---

## Epic Coverage Validation

### FR Coverage Matrix (Stories 5.5–5.8 scope)

| FR | PRD Requirement | Story Coverage | Status |
|---|---|---|---|
| FR3 | Vibe Trading API & Sandbox | 5.0+5.1 (done) + 5.5/5.6/5.7/5.8 | ✅ Covered (expanded) |
| FR11 | Backtest Visualizer | 5.2+5.3+5.4 (done) | ✅ Covered |
| FR8 | Data Integrations | Epic 1 + 5.5 extends | ⚠️ Partial overlap |
| FR16 | BYOK | 5.8 Key Mgmt | ⚠️ Partial (PoC deferred) |
| FR21 | Security | Story 1.3 + 5.7 SSRF/path | ✅ Covered |

### NFR Coverage Matrix

| NFR | Coverage in 5.5–5.8 | Status |
|---|---|---|
| NFR3 | factor_analysis 15s timeout within 30s budget | ✅ Compliant |
| NFR8 | `deductToolCredits` await before response across all stories | ✅ Compliant |
| NFR10 | Sandbox egress UNCHANGED; HTTP extension pattern preserves | ✅ Compliant (architecture decision cites NFR10) |

### Coverage Statistics

- **Epic 5 stories reviewed**: 4 (5.5, 5.6, 5.7, 5.8)
- **Relevant FRs covered**: 5/5
- **Relevant NFRs addressed**: 3/3 core
- **Coverage percentage**: 100% within review scope

### Gaps

- **Gap 1** (scope expansion): Stories 5.5-5.8 extend Epic 5 beyond PRD FR3 — needs product signoff
- **Gap 2** (pricing): No PRD anchor for tool pricing; document in `pricing-schedule.md` recommended
- **Gap 3** (dependency chain): 6-story linear chain (5.0→5.1→5.5→5.6→5.7→5.8); 5.7 could ship parallel to 5.6

---

## Epic Quality Review

### Story 5.5 — Vibe-Trading Research Tools (P0) — **GOOD**

**Strengths:**
- User-centric title + outcome
- 6 ACs in BDD format
- Code templates provided in Dev Notes
- Verified assumptions table with source refs

**🟡 Minor concerns:**
1. `factor_analysis` timeout exceed behavior unspecified (retry? abort? error message format?)
2. `pattern_recognition` prior-state requirement (needs `run_dir` with OHLCV CSV) not in agent system prompt task
3. `vibe_trading_market_data.ts` 5s hardcoded timeout — 730-day window may exceed. Recommend 10s or configurable.

### Story 5.6 — Shadow Account (P1) — **NEEDS WORK**

**Strengths:**
- Flagship feature with complete 5-step user loop
- Dashboard page + AI Chat integration
- Clear tier gate

**🔴 Critical:**
1. **Task 1 mixes Story 5.0 scope** — docker-compose.yml volume updates for shadow reports should be Story 5.0.1 hotfix, not Story 5.6 task. Block until volume prereq clear.

**🟠 Major:**
1. AC4 iframe report delivery — "same-origin after epsilon-api proxy rewrite" referenced but no Task item for adding `GET /v1/router/vibe-trading/shadow-reports/:id` passthrough route to epsilon-api

**🟡 Minor:**
1. Antivirus deferral comment misleading ("internal users only") — Tier 2 is PUBLIC users, not internal
2. AC1 `render_shadow_report` synchronous 5-15s — risk hitting NFR3 30s budget if combined with backtest chain

### Story 5.7 — Web/File Tools + Swarm Read-Only (P2) — **NEEDS WORK**

**Strengths:**
- Security hardening properly scoped (url-guard, path-guard as separate services)
- Good tool selection disambiguation with existing `web_search`/`deep_research`

**🟠 Major:**
1. **AC6 is not a testable AC** — "optional open question" about Tier 1 access. Move to Product Decisions section.
2. **AC5 security tests** — 6 scenarios listed but no task file path. Task 2 creates guard services but Task 6 "security hardening" is generic. Recommend explicit test file `apps/api/src/__tests__/unit/url-guard.test.ts` listed as Task 6 subtask.
3. **Task 4 incomplete** — Agent prompt body update (tool disambiguation) referenced in AC4 but not in Task 4 (only frontmatter permissions there)

**🟡 Minor:**
1. `read_document` 30s timeout — may hit NFR3 global 30s timeout. Recommend 25s to leave margin.

### Story 5.8 — LLM Key Management + Swarm Run UI (P3) — **NOT READY**

**Strengths:**
- Clear architectural scope
- Encryption approach (libsodium sealed box) sound
- Risk register included

**🔴 Critical:**
1. **Task breakdown deferred** — "Too early to write specific task list without design phase". Ready-for-spec but not ready-for-dev. Status = backlog is correct, but need explicit "Design phase required before dev start" flag.
2. **Bundled two distinct features** — LLM Key Management (generic primitive) + Swarm Run UI (specific feature). Spec itself acknowledges ("Consider splitting 5.8a + 5.8b"). Should split NOW into Story 5.8 (Key Mgmt) + Story 5.9 (Swarm UI) before promoting from backlog.
3. **AC4 regression risk** — Pool env injector changes touch existing `pool-env-injection.test.ts` (Story 5.0 tests). Story 5.8 must explicitly call out regression testing, not just add new tests.

**🟠 Major:**
1. **AC3 tier gate conflicts với FR16** — BYOK is for ALL tiers per PRD section 4.2. Story 5.8 tier-gates Settings → AI Keys to Tier 2 only. Needs product clarification.
2. **AC7 pricing model conflicts NFR8 interpretation** — "LLM tokens billed by OpenAI directly" means Chainlens bypasses atomic credit deduction for LLM usage. Is that NFR8 violation or scope carve-out? Needs product decision.

**🟡 Minor:**
1. DB migration rollback procedure not documented (simple DROP TABLE, but document)
2. `/v1/ai-keys/:keyType/test` SSRF hardening should reuse Story 5.7 url-guard — not called out in tasks
3. `AI_KEYS_MASTER_KEY` generation procedure for `.env.example` not specified (should document `openssl rand -base64 32`)

### Cross-Story Dependency Analysis

```
5.5 (3-4d) ──► 5.6 (1w) ──► 5.7 (4-5d) ──► 5.8 (2-3w, split recommended)
```

- ✅ No forward references found
- ⚠️ 5.7 could ship parallel to 5.6 (different endpoints, different UI) — consider parallelizing
- ⚠️ 5.8 size (2-3 weeks) is outlier — stories 5.5-5.7 are 1-week scale

### Best Practices Compliance Checklist

| Check | Status |
|---|---|
| Epic delivers user value | ✅ |
| Epic can function independently | ✅ |
| Stories appropriately sized | ⚠️ 5.8 oversized |
| No forward dependencies | ✅ |
| Database tables created when needed | ✅ |
| Clear acceptance criteria | ⚠️ 5.7 AC6 not testable; 5.8 task list missing |
| Traceability to FRs maintained | ✅ |

---

## Severity Summary

| Severity | Count | Breakdown |
|---|---|---|
| 🔴 Critical | 3 | 5.6 infra scope mixing; 5.8 task breakdown deferred; 5.8 bundled features |
| 🟠 Major | 5 | 5.6 iframe route missing from tasks; 5.7 AC6 not testable; 5.7 AC5 test file path; 5.7 Task 4 agent prompt body; 5.8 tier gate conflict; 5.8 NFR8 pricing model conflict |
| 🟡 Minor | 8 | See per-story sections above |

---

## Summary and Recommendations

### Overall Readiness Status

**NEEDS WORK** — Stories 5.5 is ready-for-dev with only minor fixes. Stories 5.6, 5.7 need
task list revisions before starting dev. Story 5.8 needs design phase + split before promoting
from backlog.

### Critical Issues Requiring Immediate Action

1. **[Story 5.6 blocker]** Extract docker-compose.yml volume update for shadow reports into
   Story 5.0.1 hotfix or explicitly mark as Story 5.6 prerequisite. Cannot start 5.6 until
   `vibe-trading-shadow-reports` + `vibe-trading-shadow-accounts` volumes exist.

2. **[Story 5.8 split]** Split Story 5.8 into:
   - **Story 5.8** — LLM Key Management core (DB schema + API + Settings UI + pool injector)
   - **Story 5.9** — Swarm Run UI (3 tools + Swarm Teams page, depends on 5.8)

3. **[Story 5.8 product decisions needed]**:
   - Tier gate on Settings → AI Keys: Tier 2-only or all tiers per FR16?
   - Pricing model: Swarm orchestration fee only vs atomic credit deduction for LLM tokens per NFR8?

### Recommended Next Steps

1. **Fix Story 5.6 Task 1** (15 min): Move volume updates out, add as explicit prerequisite section
2. **Fix Story 5.6 AC4** (15 min): Add epsilon-api passthrough route for shadow-reports to Task 2
3. **Fix Story 5.7 AC6** (5 min): Remove from ACs, move to "Product Decisions" section
4. **Fix Story 5.7 Task 4 + Task 6** (15 min): Add agent prompt body update subtask; add url-guard test file path
5. **Fix Story 5.5 code template** (5 min): Make `vibe_trading_market_data` timeout configurable via arg or bump to 10s
6. **Split Story 5.8** (1 hour): Rewrite into 5.8 + 5.9, resolve tier gate + pricing questions with product
7. **Product signoff needed**: Scope expansion beyond PRD FR3 for Shadow Account + Swarm Teams

### Positive Notes

- ✅ Architecture decision (HTTP extension over MCP stdio) properly documented with NFR8/NFR10
  rationale in Story 5.5 — this is the single most important decision and it's sound
- ✅ Pattern repetition strategy (reuse proven 15× OpenCode tool template) reduces risk
- ✅ No forward dependencies between stories
- ✅ Code templates + Dev Notes reduce ambiguity for developers
- ✅ Test standards explicit (Bun test, gated integration, TypeScript clean)
- ✅ Pricing tiers reflect actual compute cost

### Final Note

This assessment identified **3 critical**, **5 major**, and **8 minor** issues across Stories
5.5–5.8. Story 5.5 is substantively ready — minor fixes only. Story 5.6 needs 30 minutes of
revisions before starting dev. Story 5.7 needs 30 minutes of revisions. Story 5.8 needs a
design phase and split before it can move out of backlog.

Recommend starting Story 5.5 implementation NOW in parallel with fixing 5.6/5.7 specs. Story
5.8 should stay in backlog until design phase complete.

**Total estimated effort after fixes**: 5.5 (3-4 days) → 5.6 (1 week) → 5.7 (4-5 days, can
parallelize with 5.6) → 5.8+5.9 split (3+2 weeks sequential after design).

Overall Epic 5 timeline: ~6-8 weeks from today.
