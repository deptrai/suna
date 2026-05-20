# Story 5.9.1: Backtest Discoverability — Navigation, Command Palette & Chat CTA

Status: ready-for-dev

**Epic:** 5 — Backtesting Sandbox
**Type:** P3 polish — discoverability/UX uplift (deferred from Story 5.9 AC7)
**Created:** 2026-05-21
**Depends on:** Story 5.9 done (`POST /v1/router/vibe-trading/backtest-multi`, `ComparisonVisualizer`, `MultiBacktestStrategyEditorClient`, `ContextualBacktestModal` with single↔multi toggle)
**Blocks:** Nothing — pure surface enhancement
**FRs:** N/A. **NFRs:** none.
**Estimated effort:** 0.5-1 day. **Owner:** TBD.

## Context — why this exists

Story 5.9 shipped the multi-strategy backtest backend coordinator + UI but Task 9 (discoverability) was deferred per `/bmad-code-review` (2026-05-21). The feature exists at `/dashboard/backtest` and inside the contextual chat modal, but a user who doesn't already know the URL has no entry point: there is no left-sidebar item, the command palette entries [exist in registry but may not be wired](apps/web/src/lib/menu-registry.ts#L418-L438), and chat has no quick-action CTA.

This story closes the loop: every user surface (nav, palette, chat) gets a clear "Run Backtest" / "Run Multi Backtest" affordance, and any stale "configure your own API key" copy that misleads users about backtest setup is removed.

## Story

As a Tier 2 trader who has just landed in Chainlens,
I want clear entry points to Backtest from the main navigation, command palette, and chat,
so that I can discover the multi-strategy backtest feature without being told the URL or hunting through code blocks.

## Existing state — verify before patching

The following entries ALREADY exist in [apps/web/src/lib/menu-registry.ts:418-438](apps/web/src/lib/menu-registry.ts#L418-L438) (added during Story 5.9 work):

```ts
{ id: 'backtest', label: 'Backtest', href: '/dashboard/backtest',
  showIn: ['commandPalette', 'rightSidebar'], keywords: 'backtest strategy compare multi strategy vibe trading' },
{ id: 'multi-backtest', label: 'Multi Backtest', href: '/dashboard/backtest',
  showIn: ['commandPalette'], keywords: 'run all multi strategy backtest comparison' },
```

**Before writing code**, verify with `mcp__chrome-devtools__puppeteer` or Playwright:
1. Does ⌘K command palette actually show "Backtest" and "Multi Backtest"? If yes → patches focus on deeplink params + multi-mode preselect.
2. Does the right sidebar render the `Backtest` entry? (Story 5.9 added `showIn: ['rightSidebar']` but maybe the sidebar consumer doesn't read it.)
3. Is there an existing chat quick-action surface (e.g. slash menu, suggestion chip)?

## Acceptance Criteria

### AC1 — Multi Backtest deeplink preselects multi mode

**Given** user lands on `/dashboard/backtest?mode=multi` (e.g., from command palette "Multi Backtest" entry)
**When** the page mounts

**Then** the multi-strategy editor is the active editor (not single), without an extra click.
- Single-strategy default UX must remain on `/dashboard/backtest` (no `mode` param) — regression-critical per Story 5.2 expectations.
- The mode-toggle button reflects the active mode visually (`Multi Strategy` highlighted when `?mode=multi`).
- URL also accepts `?mode=single` explicitly for symmetry.

### AC2 — Sidebar nav surface

**Given** the user is logged in and on any `/dashboard/*` route
**When** the right sidebar renders nav items from menu-registry

**Then** the `Backtest` entry from menu-registry surfaces as a clickable nav item (icon + label), pointing to `/dashboard/backtest`.
- If the right sidebar consumer doesn't currently filter by `showIn: ['rightSidebar']`, wire it up.
- If a left-sidebar nav surface is more idiomatic in Chainlens UX, use that — coordinate with existing nav patterns (`Triggers`, `Files`, etc. — see other registry entries with `rightSidebar`).
- Icon: `BarChart3` (already in registry).

### AC3 — Chat quick-action CTA

**Given** the user is in a chat/session view
**When** the user opens a session input or quick-actions menu

**Then** there is a discoverable affordance to launch backtest WITHOUT first writing a JSON5 code block.
- Acceptable surfaces (pick one, simplest first):
  - A `Run Backtest` / `Run Multi Backtest` chip in the session-input quick-actions area
  - A slash command (`/backtest`, `/multi-backtest`) that opens `ContextualBacktestModal` with single/multi mode preselected
  - A "Try a backtest" suggestion card on empty chat state
- Clicking the affordance opens `ContextualBacktestModal` with sensible defaults (no `initialCode` needed; modal uses its template).

### AC4 — Stale LLM-key copy audit + removal

**Given** the feature is system-managed (Chainlens proxies all VT calls through the platform — see [apps/api/src/router/routes/vibe-trading.ts](apps/api/src/router/routes/vibe-trading.ts))
**When** a user explores backtest UI surfaces

**Then** there are NO instructions or hints telling the user to:
- Add their own Anthropic / OpenAI / xAI API key
- Configure LLM credentials before running backtest
- Set `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` in their environment
- "Bring your own keys" / BYOK messaging in backtest context

**And** any such copy found is either removed or rewritten to reflect system-managed model policy.

**Scope clarification:** This applies to backtest-adjacent UI (`/dashboard/backtest`, `ContextualBacktestModal`, any docs link from the backtest page). Global settings / API-key UI elsewhere is OUT of scope.

### AC5 — Tests

**Unit (frontend):**
- New test in [apps/web/src/app/(dashboard)/dashboard/backtest/__tests__/page.test.tsx](apps/web/src/app/(dashboard)/dashboard/backtest/__tests__/page.test.tsx) or extend existing:
  - `?mode=multi` URL param renders multi editor as active mode
  - No `mode` param renders single editor (default, regression)
  - `?mode=single` renders single editor explicitly

**E2E (Playwright):** Add to [tests/e2e/specs/multi-strategy-backtest.spec.ts](tests/e2e/specs/multi-strategy-backtest.spec.ts) (gated by `BACKTEST_E2E_ENABLED=true`):
- Open command palette (`⌘K`), type "multi", see "Multi Backtest" entry, click → lands on `/dashboard/backtest?mode=multi` with multi editor active
- If sidebar nav implemented: click `Backtest` from sidebar → navigates to `/dashboard/backtest` with single editor active

## Tasks / Subtasks

- [ ] **Task 1: Audit existing UI surfaces** (AC1 + AC2 verify-before-patching)
  - [ ] 1.1 Run preview server, manually inspect ⌘K command palette and right sidebar. Document what's actually wired vs registry-only.
  - [ ] 1.2 Identify which file consumes `menu-registry` for the right sidebar.
  - [ ] 1.3 Search backtest UI for stale LLM-key copy (`grep -r "ANTHROPIC_API_KEY\|API key\|BYOK\|configure.*key" apps/web/src/components/backtest apps/web/src/app/\(dashboard\)/dashboard/backtest`).

- [ ] **Task 2: Multi mode deeplink** (AC1)
  - [ ] 2.1 Update `/dashboard/backtest/page.tsx` to read `?mode=` from URL params (Next.js App Router `searchParams`).
  - [ ] 2.2 Pass initial mode to the consuming component; ensure default (no param) = single.
  - [ ] 2.3 Update `multi-backtest` registry entry: `href: '/dashboard/backtest?mode=multi'`.

- [ ] **Task 3: Sidebar nav surface** (AC2)
  - [ ] 3.1 Verify the right sidebar nav consumer filters `menu-registry` by `showIn: 'rightSidebar'`. If not, wire it.
  - [ ] 3.2 If decision is left-sidebar instead, update `showIn` to match the chosen surface.
  - [ ] 3.3 Smoke-test in browser: nav item visible, clickable, navigates correctly.

- [ ] **Task 4: Chat quick-action CTA** (AC3)
  - [ ] 4.1 Identify the chat surface most appropriate for the CTA (slash menu, quick-actions chip, suggestion card).
  - [ ] 4.2 Wire the CTA to open `ContextualBacktestModal` with the right mode (single by default, multi if explicitly invoked).
  - [ ] 4.3 Ensure existing single-strategy chat flow (code block → contextual button) is unaffected.

- [ ] **Task 5: Remove stale LLM-key copy** (AC4)
  - [ ] 5.1 Apply findings from Task 1.3 — remove or rewrite each instance.
  - [ ] 5.2 Cross-check docs/links from backtest page; remove any "BYOK" guidance specific to backtest.

- [ ] **Task 6: Tests** (AC5)
  - [ ] 6.1 Add unit tests for `?mode=` deeplink behavior.
  - [ ] 6.2 Extend Playwright spec with command-palette + sidebar discoverability assertions (gated `BACKTEST_E2E_ENABLED=true`).

- [ ] **Task 7: Docs**
  - [ ] 7.1 Brief note in epic 5 retrospective: discoverability shipped via 5.9.1.

## Dev Notes

### Critical guardrails (carry over from Story 5.9)

- **DO NOT** touch the backtest backend route, `ComparisonVisualizer`, or `MultiBacktestStrategyEditorClient` core logic — discoverability is pure surface work.
- **DO NOT** change the default behavior of `/dashboard/backtest` without a `mode` param — must remain single-strategy for Story 5.2 regression safety.
- **DO NOT** break the existing chat code-block → contextual modal flow tested by `multi-strategy-backtest.spec.ts`.
- **DO** reuse existing menu-registry entries; only add `?mode=multi` to the multi entry's `href`.

### Existing helpers to reuse

- `menu-registry.ts` registry pattern — single source of truth for nav items
- `ContextualBacktestModal` already accepts `initialCode`, `initialAsset`, `initialTimeframe` (patched 2026-05-21 to forward to multi child)
- Existing slash/command surfaces in [apps/web/src/components/session/](apps/web/src/components/session/) — investigate for chat CTA wiring

### Out of scope

- Onboarding tooltips or guided product tours
- Marketing copy on `/landing` or marketing pages (this story is in-app only)
- Sidebar redesign — only adding/wiring entries, not restructuring nav

## References

- [Source: Story 5.9 spec line 189-198] — original AC7 specification
- [Source: apps/web/src/lib/menu-registry.ts:418-438] — existing partial scaffolding
- [Source: apps/web/src/components/command-palette.tsx:1224-1260] — Navigation CommandGroup
- [Source: apps/web/src/components/backtest/contextual-backtest-modal.tsx] — modal already supports single/multi toggle (Story 5.9)
- [Source: _bmad-output/implementation-artifacts/5-9-multi-strategy-backtest-comparison.md] — parent story; AC7 deferred 2026-05-21

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
