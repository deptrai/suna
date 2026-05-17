---
validationTarget: '_bmad-output/planning-artifacts/prd.md'
validationDate: '2026-05-18'
inputDocuments:
  - docs/config-degradation-visual-handover.md
  - docs/opencode-config-failsafe-spec.md
  - docs/justavps-restart-hardening-spec.md
  - docs/epsilon-agent-os-framework-cloud-spec.md
  - docs/instance-three-layer-health-and-actions-spec.md
  - docs/index.md
  - docs/development-release-guide.md
  - docs/project-overview.md
  - docs/admin-panel-handoff.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/research/technical-self-host-defillama-chainlens-research-2026-05-18.md
additionalReferenceDocuments: []
validationStepsCompleted:
  - step-v-01-discovery
  - step-v-02-format-detection
  - step-v-03-density-validation
  - step-v-04-brief-coverage-validation
  - step-v-05-measurability-validation
  - step-v-06-traceability-validation
  - step-v-07-implementation-leakage-validation
  - step-v-08-domain-compliance-validation
  - step-v-09-project-type-validation
validationStatus: IN_PROGRESS
---

# PRD Validation Report

**PRD Being Validated:** `_bmad-output/planning-artifacts/prd.md`
**Validation Date:** 2026-05-18

## Input Documents

- `docs/config-degradation-visual-handover.md`
- `docs/opencode-config-failsafe-spec.md`
- `docs/justavps-restart-hardening-spec.md`
- `docs/epsilon-agent-os-framework-cloud-spec.md`
- `docs/instance-three-layer-health-and-actions-spec.md`
- `docs/index.md`
- `docs/development-release-guide.md`
- `docs/project-overview.md`
- `docs/admin-panel-handoff.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/planning-artifacts/research/technical-self-host-defillama-chainlens-research-2026-05-18.md`

## Discovery Summary

- PRD: loaded from `_bmad-output/planning-artifacts/prd.md`.
- Product Brief: none found in PRD frontmatter.
- Research Documents: 1 loaded from PRD frontmatter.
- Additional References: 10 project/architecture documents loaded from PRD frontmatter.
- Additional user-provided references outside frontmatter: none.

## Validation Findings

[Findings will be appended as validation progresses]

## Format Detection

**PRD Structure:**

- `## 1. Project Classification`
- `## 2. Product Vision & Moat (Lợi thế cạnh tranh)`
- `## 3. Success Criteria`
- `## 4. Product Scope`
- `## 5. User Journeys (Hành trình Người dùng)`
- `## 6. Domain Requirements (Yêu cầu Đặc thù Ngành)`
- `## 7. Non-Functional Requirements (Yêu cầu Phi chức năng)`
- `## 8. Out of Scope (Ngoài Phạm vi Dự án)`
- `## 9. Roadmap & Milestones (Lộ trình Phát hành)`

**BMAD Core Sections Present:**

- Executive Summary: Missing
- Success Criteria: Present
- Product Scope: Present
- User Journeys: Present
- Functional Requirements: Missing
- Non-Functional Requirements: Present

**Format Classification:** BMAD Variant
**Core Sections Present:** 4/6

**Routing Decision:** Proceed to systematic validation checks. A parity check is not required because the PRD is a BMAD Variant rather than a Non-Standard PRD.

## Information Density Validation

**Anti-Pattern Violations:**

**Conversational Filler:** 0 occurrences

**Wordy Phrases:** 0 occurrences

**Redundant Phrases:** 0 occurrences

**Total Violations:** 0

**Severity Assessment:** Pass

**Recommendation:** PRD demonstrates good information density with minimal violations.

## Product Brief Coverage

**Status:** N/A - No Product Brief was provided as input

## Measurability Validation

### Functional Requirements

**Total FRs Analyzed:** 14

**Format Violations:** 14
- PRD chưa định nghĩa FR theo mẫu `[Actor] can [capability]`, thay vào đó là feature bullets ở [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:84), [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:91), [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:99), [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:172)

**Subjective Adjectives Found:** 0

**Vague Quantifiers Found:** 1
- "nhiều nguồn" tại [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:85)

**Implementation Leakage:** 8
- Công nghệ/implementation xuất hiện trực tiếp trong yêu cầu: `Vercel AI SDK`, `TradingView`, `Monaco Editor`, `QuickNode WSS`, `QuickNode HTTP RPC`, `PostgreSQL`, `HTTP API`, `MCP JSON-RPC` tại [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:87), [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:89), [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:90), [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:99), [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:175)

**FR Violations Total:** 23

### Non-Functional Requirements

**Total NFRs Analyzed:** 25

**Missing Metrics:** 3
- Worker auto-scaling thiếu ngưỡng đo rõ ràng tại [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:186)
- Sandbox isolation chưa có chỉ số kiểm chứng runtime isolation tại [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:202)
- Stable tunnel URL thiếu tiêu chí kiểm thử định lượng (SLO/SLI) tại [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:214)

**Incomplete Template:** 2
- Một số NFR trình bày theo policy/implementation nhưng thiếu measurement method chuẩn hóa, ví dụ [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:202), [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:214)

**Missing Context:** 1
- NFR-O2 mô tả cấu hình mong muốn nhưng thiếu business impact rõ ràng khi vi phạm tại [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:214)

**NFR Violations Total:** 6

### Overall Assessment

**Total Requirements:** 39
**Total Violations:** 29

**Severity:** Critical

**Recommendation:** Many requirements are not measurable or testable. Requirements must be revised to be testable for downstream work.

## Traceability Validation

### Chain Validation

**Executive Summary → Success Criteria:** Gaps Identified
- Không có section Executive Summary riêng để trace trực tiếp vision/objectives xuống Success Criteria; currently phải suy luận từ `Product Vision & Moat` tại [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:52).

**Success Criteria → User Journeys:** Intact (Partial)
- User success/business success nhìn chung có journey hỗ trợ tại section 5, nhưng technical success về data divergence (TVL/fees/revenue) chưa có journey vận hành cụ thể.

**User Journeys → Functional Requirements:** Gaps Identified
- Các journey 5.1-5.7 có narrative tốt nhưng FR chưa được chuẩn hóa thành requirement IDs nên khó map 1:1 tới capability implementable.

**Scope → FR Alignment:** Misaligned
- Scope chứa nhiều capability chi tiết ở section 4.1 nhưng chưa có FR formal để chứng minh coverage testable cho từng item.

### Orphan Elements

**Orphan Functional Requirements:** 8
- Các requirement kỹ thuật trong 6.1-6.5 chưa có mapping rõ sang user journeys, ví dụ JIT sync, provider ownership, data isolation tại [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:157), [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:173), [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:175).

**Unsupported Success Criteria:** 1
- Technical success cho self-host shadow validation/divergence thresholds chưa được map sang user journey hoặc acceptance flow riêng tại [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:76).

**User Journeys Without FRs:** 3
- Journey 5.4 (Admin burn ops), 5.5 (Seller publish flow), 5.6 (Buyer rent/dispute flow) thiếu FR formal tương ứng để test end-to-end.

### Traceability Matrix

- Business Vision (`Section 2`) → Success Criteria (`Section 3`) → Journeys (`Section 5`) : Partial
- Product Scope (`Section 4`) → Domain Requirements (`Section 6`) → NFR (`Section 7`) : Partial
- Journey-to-FR-ID mapping (`Section 5` → explicit FR list) : Missing

**Total Traceability Issues:** 13

**Severity:** Critical

**Recommendation:** Orphan requirements exist - every FR must trace back to a user need or business objective.

## Implementation Leakage Validation

### Leakage by Category

**Frontend Frameworks:** 3 violations
- `Vercel AI SDK`, `next/dynamic`, `React.lazy()` xuất hiện trong requirement text tại [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:87), [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:208)

**Backend Frameworks:** 1 violations
- `hono-rate-limiter` middleware được ràng buộc trực tiếp ở NFR tại [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:199)

**Databases:** 3 violations
- `PostgreSQL`, `Supabase Storage S3`, `pgcrypto` xuất hiện trực tiếp trong yêu cầu thay vì để architecture quyết định tại [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:175), [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:192), [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:200)

**Cloud Platforms:** 3 violations
- `QuickNode`, `Cloudflare Tunnel`, `Vercel` được chỉ định cụ thể trong PRD requirements tại [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:99), [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:214), [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:87)

**Infrastructure:** 3 violations
- `Litestream WAL replication`, `JSON-RPC intercept`, `first-message authentication` mô tả implementation-level behavior tại [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:192), [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:98), [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:201)

**Libraries:** 4 violations
- `TradingView`, `Monaco Editor`, `mermaid/three.js/pdfjs/syncfusion/sql.js/ag-grid`, `Celery-backed` được đưa thẳng vào requirements tại [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:89), [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:90), [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:94), [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:208)

**Other Implementation Details:** 4 violations
- `HTTP + SSE streaming`, `WebSocket/WSS`, `CSV format specifics`, `atomic_use_credits function` ở requirement level tại [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:94), [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:99), [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:96), [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:197)

### Summary

**Total Implementation Leakage Violations:** 21

**Severity:** Critical

**Recommendation:** Extensive implementation leakage found. Requirements specify HOW instead of WHAT. Remove all implementation details - these belong in architecture, not PRD.

**Note:** API/provider terms that define product capability boundaries (e.g., provider fallback behavior) are acceptable when they specify required behavior rather than concrete implementation choices.

## Domain Compliance Validation

**Domain:** general (derived from missing `classification.domain` in frontmatter)
**Complexity:** Low (general/standard)
**Assessment:** N/A - No special domain compliance requirements

**Note:** PRD body describes fintech/crypto context, but frontmatter does not include a machine-readable `classification.domain` field, so workflow applied low-complexity path.

## Project-Type Compliance Validation

**Project Type:** web_app (assumed default because `classification.projectType` is missing in frontmatter)

### Required Sections

**browser_matrix:** Missing
- Chưa có ma trận browser support rõ ràng (Chrome/Safari/Firefox/Edge + minimum versions).

**responsive_design:** Present
- Có định hướng responsive ở frontend scope và extension/web integration, nhưng chưa có breakpoint matrix formal.

**performance_targets:** Present
- Có target rõ trong NFR-FE1..FE5 tại [prd.md](/Users/luisphan/Documents/GitHub/chainlens/_bmad-output/planning-artifacts/prd.md:206).

**seo_strategy:** Missing
- Chưa có mục SEO/indexing/crawl strategy cho web app.

**accessibility_level:** Missing
- Chưa có WCAG level hoặc accessibility acceptance criteria.

### Excluded Sections (Should Not Be Present)

**native_features:** Absent ✓

**cli_commands:** Absent ✓

### Compliance Summary

**Required Sections:** 2/5 present
**Excluded Sections Present:** 0 (should be 0)
**Compliance Score:** 40%

**Severity:** Critical

**Recommendation:** PRD is missing required sections for web_app. Add missing sections to properly specify this type of project.
