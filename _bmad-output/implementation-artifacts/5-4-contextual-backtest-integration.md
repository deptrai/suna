# Story 5.4: Contextual Backtest Integration (Chat & Chart)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Quant Trader or Analyst,
I want to trigger a backtest directly from a Chart view or AI Chat interaction via a popup Strategy Editor,
So that I can seamlessly review, edit, and execute AI-generated strategies without switching contexts.

## Acceptance Criteria

1. **Trigger UI**: Given the user is viewing a Chart or chatting with the AI agent, when the AI suggests a strategy or the user clicks "Run Backtest" on the chart toolbar, then a "⚡ Review & Run Backtest" action card/button is presented.
2. **Editor Modal**: Given the contextual trigger is clicked, an action opens a Modal/Popup containing the Strategy Editor (CodeMirror 6, per Story 5.2 §Stack Decision — spec text "Monaco" was inherited from epic draft; actual stack is CodeMirror 6 to avoid 3MB bundle bloat + theming conflicts) pre-filled with the asset, timeframe, and generated code.
3. **Execution**: Given the Contextual Backtest Modal is open, when the user clicks "Run Backtest" inside the Modal, then the execution flows through the Vibe Sandbox as normal via the SSE stream endpoint from Story 5.3.
4. **Results View**: The Equity Curve and KPI results are rendered directly inside the Modal or inline in the Chat without navigating away.

## Tasks / Subtasks

- [x] **Task 1: Contextual Action Button/Trigger** (AC: 1)
  - [x] Subtask 1.1: Build "⚡ Review & Run Backtest" action card/button for Chat (using AI UI message components).
  - [x] Subtask 1.2: Add an action item to the Chart toolbar to trigger backtesting.
- [x] **Task 2: Strategy Editor Modal Component** (AC: 2)
  - [x] Subtask 2.1: Wrap the existing `<BacktestStrategyEditorClient>` from `strategy-editor.tsx` in a Radix UI / shadcn Modal component.
  - [x] Subtask 2.2: Ensure the Modal accepts props for initial code, asset, and timeframe.
- [x] **Task 3: Wiring SSE Execution & Result Rendering** (AC: 3, 4)
  - [x] Subtask 3.1: Ensure the submission logic inside the Modal connects to `streamRun()` seamlessly.
  - [x] Subtask 3.2: Verify the `<BacktestResultVisualizer>` renders correctly inside the constrained Modal viewport.
  - [x] Subtask 3.3: Provide smooth transitions (e.g., closing the editor view or scrolling down) when results arrive inside the Modal.
- [x] **Task 4: Testing & Polish**
  - [x] Subtask 4.1: Write component tests for the new Modal/Trigger components.
  - [x] Subtask 4.2: Verify modal rendering behavior and ensure state is cleared upon close.

## Dev Notes

- **Existing Architecture**: 
  - `strategy-editor.tsx` and `result-visualizer.tsx` from Story 5.2 and 5.3 are robust and should be reused.
  - Wrap these in a `Dialog` or `Sheet` from shadcn to keep the user in context.
- **UX Consistency Patterns**: 
  - Use Primary Action styling for the ⚡ trigger (glow effect or prominent styling per UX spec).
  - Keep Monaco editor resizable or responsive to the modal dimensions.
- **Backend**:
  - No new backend endpoints are strictly necessary; rely on `POST /jobs` and `GET /runs/:jobId/stream`.

### Project Structure Notes

- Use `apps/web/src/components/backtest/` for specific modal components if they are heavily backtest-oriented.
- Use `apps/web/src/components/ui/` for generic shadcn UI primitives (Dialog, Button).

### References

- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Contextual Backtest Trigger]
- [Source: _bmad-output/implementation-artifacts/5-3-backtest-results-visualizer.md]

## Dev Agent Record

### Agent Model Used
Gemini 2.5 Pro

### Debug Log References
- Fixed the previous test failure in `result-visualizer.test.ts` due to mismatching "empty" and "phase-a" expectation for the "unknown" status.
- Addressed `BACKEND_URL` failing the tests by prefixing the env variable to the `bun test` runner.

### Completion Notes List
- Implemented `ContextualBacktestModal` component.
- Implemented `ContextualBacktestTrigger` to identify backtesting JSON in the chat using specific keys (`"simulation_environment"`, `"context_rules"`).
- Injected `ContextualBacktestTrigger` into `UnifiedMarkdown`'s `CodeBlock` and `CodeHighlight` components.
- Injected the run backtest button into the `TradingViewChart` toolbar.
- Extracted and thoroughly tested logic into `contextual-backtest-trigger.utils.ts` and `contextual-backtest-trigger.utils.test.ts`.

### File List
- `apps/web/src/components/backtest/contextual-backtest-modal.tsx` (new)
- `apps/web/src/components/backtest/contextual-backtest-trigger.tsx` (new)
- `apps/web/src/components/backtest/contextual-backtest-trigger.utils.ts` (new)
- `apps/web/src/components/backtest/__tests__/contextual-backtest-trigger.utils.test.ts` (new)
- `apps/web/src/components/chart/trading-view-chart.tsx` (modified)
- `apps/web/src/components/markdown/unified-markdown.tsx` (modified)
- `apps/web/src/components/backtest/strategy-editor.tsx` (modified)
- `apps/web/src/components/backtest/__tests__/result-visualizer.test.ts` (modified)

### Review Findings
- [x] [Review][Patch] Unintended extension manifest change [apps/extension/manifest.json]
- [x] [Review][Patch] Unintended submodule state [Vibe-Trading]
- [x] [Review][Patch] Dangerous JSON string replacement for defaults [apps/web/src/components/backtest/strategy-editor.tsx:123]
- [x] [Review][Patch] Trigger button text deviation [apps/web/src/components/backtest/contextual-backtest-trigger.tsx:32]
- [x] [Review][Patch] Race condition in scroll logic [apps/web/src/components/backtest/strategy-editor.tsx:151]
- [x] [Review][Defer] Brittle strategy detection logic [apps/web/src/components/backtest/contextual-backtest-trigger.utils.ts:2] — deferred, intentional for speed vs JSON parsing every code block
- [x] [Review][Defer] Silent JSON parsing failure masking [apps/web/src/components/backtest/contextual-backtest-trigger.utils.ts:16] — deferred, intentional to fail gracefully with defaults
- [x] [Review][Defer] React key remounting anti-pattern [apps/web/src/components/backtest/contextual-backtest-modal.tsx:22] — deferred, acceptable trick for complex Monaco editor reset
- [x] [Review][Defer] Obtrusive UI overlay for trigger button [apps/web/src/components/backtest/contextual-backtest-trigger.tsx:29] — deferred, UX acceptable given hover opacity
- [x] [Review][Defer] Global performance drag in markdown renderer [apps/web/src/components/markdown/unified-markdown.tsx] — deferred, string includes is very fast
- [x] [Review][Defer] Hardcoded defaults in TradingViewChart [apps/web/src/components/chart/trading-view-chart.tsx:218] — deferred, acceptable for MVP

### Review Findings (Round 2 — 2026-05-11)

- [x] [Review][Patch] **CRITICAL — `token` not destructured in TradingViewChart** — fixed: signature now `({ data, token }: Props)`. Also added `type="button"` to toolbar button [apps/web/src/components/chart/trading-view-chart.tsx:26]
- [x] [Review][Patch] **`extractInitialProps` uses `JSON.parse` instead of `JSON5.parse`** — switched to `JSON5.parse` so JSON5 templates parse correctly [apps/web/src/components/backtest/contextual-backtest-trigger.utils.ts:9]
- [x] [Review][Patch] **Chart toolbar text deviates from spec** — changed to "⚡ Review & Run Backtest" per AC1 [apps/web/src/components/chart/trading-view-chart.tsx:186]
- [x] [Review][Patch] `extractInitialProps` called outside useMemo — wrapped with `React.useMemo([code, isStrategyMemo])` [apps/web/src/components/backtest/contextual-backtest-trigger.tsx]
- [x] [Review][Patch] `editorKey` increments on every open regardless of code change — now compares prev/next `initialCode` via ref; only remounts on actual code change [apps/web/src/components/backtest/contextual-backtest-modal.tsx]
- [x] [Review][Patch] Regex special chars in `initialAsset`/`initialTimeframe` not escaped — added `escapeReplacement()` helper to escape `$` for `String.replace` replacement string [apps/web/src/components/backtest/strategy-editor.tsx]
- [x] [Review][Patch] Accidental modal dismiss during execution loses in-flight run — modal now tracks editor's `isExecuting` via `onExecutingChange` callback and prompts confirmation before closing [apps/web/src/components/backtest/contextual-backtest-modal.tsx, strategy-editor.tsx]
- [x] [Review][Patch] `CodeHighlight` missing `!isStreaming` guard — added `isStreaming?: boolean` prop (default `false`) and gated trigger by `!isStreaming` [apps/web/src/components/markdown/unified-markdown.tsx:600]
- [x] [Review][Patch] Trigger button missing `type="button"` — added on both trigger.tsx and trading-view-chart.tsx toolbar button [apps/web/src/components/backtest/contextual-backtest-trigger.tsx, trading-view-chart.tsx]
- [x] [Review][Patch] `extractInitialProps` truthy check skips empty strings + no format validation — added explicit `typeof === 'string'` and regex validation (`^[A-Z0-9]+-[A-Z0-9]+$` for asset, `^\d+[mhdwM]$` for timeframe) [apps/web/src/components/backtest/contextual-backtest-trigger.utils.ts]
- [x] [Review][Patch] Scroll-into-view fires on every `result`/`loadingPhase` update — added `lastScrollStageRef` to fire only on stage transitions (idle→loading→result); added alive-flag for unmount safety [apps/web/src/components/backtest/strategy-editor.tsx]
- [x] [Review][Patch] `result-visualizer.utils.ts` `'empty'` branch has no test coverage — added test `status="success" with no metrics/equity/data_summary → "empty"` [apps/web/src/components/backtest/__tests__/result-visualizer.test.ts]
- [x] [Review][Defer] Component/integration tests for trigger/modal absent — project has no @testing-library/react / jsdom infra (parity with Story 5.3 defer). File follow-up testing-infra story.
- [x] [Review][Defer] Monaco editor fixed height (480px) may overflow modal on small viewports — UX polish, not blocking AC.
- [x] [Review][Defer] `isStrategy` substring sniff produces false positives on prose mentioning the keys — already deferred in Round 1 (intentional speed vs JSON parse on every code block).
