# Story 6.1.1: Domain-Specific Token Detection for DexScreener & CoinMarketCap

Status: blocked-on-6.1.0

> **Hard dependency**: Story 6.1.0 (Advisory Risk Endpoint) must ship first. AC#4 of this story ("tooltip fetches and displays Risk Tooltip via the API as implemented in Story 6.1") cannot pass until the missing `/v1/advisory/risk` endpoint exists — verified during Implementation Readiness Review 2026-05-11. See [_bmad-output/planning-artifacts/implementation-readiness-report-2026-05-11-story-6-1-1.md](_bmad-output/planning-artifacts/implementation-readiness-report-2026-05-11-story-6-1-1.md).

## Story

As a crypto trader and user of the Chainlens Vigilant Companion,
I want the extension to automatically recognize token symbols and addresses specifically on DexScreener and CoinMarketCap without requiring a `$` prefix,
so that I can seamlessly view risk analysis tooltips on trading platforms where tokens are usually listed without cashtags.

## Acceptance Criteria

1. On DexScreener (`dexscreener.com`) and CoinMarketCap (`coinmarketcap.com`), the content script specifically targets header or token name elements to detect token symbols even if they lack a `$` prefix.
2. **Dispatch boundary**: On supported domains (DexScreener, CoinMarketCap), the generic `TreeWalker` + regex path is **bypassed entirely** and replaced by the `DomainParser`. The generic regex path remains active only on non-supported domains (X, Facebook, CoinGecko). This prevents double-highlighting and false positives from the un-`$`-anchored ticker pattern.
3. Highlighting logic wraps the identified token strings in a `.chainlens-token-highlight` span on these specific pages without breaking the site's layout.
4. Hovering over the highlighted symbol correctly fetches and displays the Risk Tooltip via the API as implemented in Story 6.1.
5. **`DomainParser` contract** (see Dev Notes for full interface) is implemented as a typed module with a registry array, so future platforms (CoinGecko, etc.) only require adding a new parser file + registry entry — no changes to dispatch logic.
6. **SPA navigation handling**: Parser re-runs on `history.pushState`, `history.replaceState`, and `popstate` events so that route changes within DexScreener (e.g. `/ethereum/0xabc...` → `/solana/Foo...`) and CoinMarketCap (e.g. `/currencies/bitcoin/` → `/currencies/ethereum/`) re-detect tokens without requiring full page reload.
7. **Token validation for non-`$` tickers**: Ticker symbols extracted from page chrome (headers, titles) must be cross-checked against the URL slug before being wrapped. If the page URL contains a recognizable token slug or contract address, that becomes the trusted token identity; otherwise the ticker is skipped. Contract addresses (extracted from URL or DOM) are always trusted.

## Tasks / Subtasks

- [ ] **Task 0: Prerequisite Refactor — Extract `wrapHighlight` helper**
  - [ ] Subtask 0.1: Move the highlight-span creation logic currently inlined inside `highlightNodes` ([apps/extension/src/content/index.ts:201-208](apps/extension/src/content/index.ts#L201-L208)) into a new module `apps/extension/src/content/highlight.ts`.
  - [ ] Subtask 0.2: Export `wrapHighlight(target: Text | HTMLElement, token: string, handlers: { onMouseEnter, onMouseLeave }): HTMLSpanElement` so both the generic regex path and the new `DomainParser` path reuse the same span shape and event binding.
- [ ] Task 1: Create the `DomainParser` Module
  - [ ] Subtask 1.1: Create `apps/extension/src/content/parsers/types.ts` exporting the `DomainParser` interface (see Dev Notes).
  - [ ] Subtask 1.2: Create `apps/extension/src/content/parsers/registry.ts` exporting `PARSERS: DomainParser[]` and `getActiveParser(): DomainParser | null` (hostname match via `window.location.hostname.includes(...)`).
  - [ ] Subtask 1.3: Update `apps/extension/src/content/index.ts` `init()` so that if `getActiveParser()` returns a parser, the generic `TreeWalker` + `MutationObserver` on `document.body` is skipped and the parser's `extract()` + scoped observer runs instead.
- [ ] Task 2: Implement DexScreener Parser
  - [ ] Subtask 2.1: Create `apps/extension/src/content/parsers/dexscreener.ts`. **Selector priority order** (most stable → most fragile, document fallback chain in code comments):
    1. URL extraction — `/(ethereum|solana|bsc|...)/(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{43,44})` (always trusted, source = `'url'`).
    2. ARIA / semantic — `[aria-label*="token"]`, `[role="heading"]` within main content.
    3. `data-*` attributes — DexScreener exposes some `data-cy="..."` hooks for their own tests.
    4. *(Last resort)* hashed CSS class fuzzy match — log warning via `console.warn('[chainlens] dexscreener parser falling back to fragile selector')` so production breakage is visible.
  - [ ] Subtask 2.2: Implement `extract()` returning `{ element, token, source }[]` and inject highlight spans via the shared `wrapHighlight` helper.
  - [ ] Subtask 2.3: Implement `observeTarget()` returning the narrowest stable subtree (e.g. main content container), NOT `document.body`, to avoid re-scanning on every price tick.
- [ ] Task 3: Implement CoinMarketCap Parser
  - [ ] Subtask 3.1: Create `apps/extension/src/content/parsers/coinmarketcap.ts` following the same selector priority order as DexScreener. URL slug extraction (`/currencies/{slug}/`) is the trusted ground truth for the ticker.
  - [ ] Subtask 3.2: Cross-check header ticker text against URL slug → ticker mapping (e.g. `bitcoin → BTC`). If mismatch, skip wrap.
  - [ ] Subtask 3.3: Implement `observeTarget()` scoped to the token header section, not the live price ticker region (CMC fires 5-10 mutations/sec on price updates).
- [ ] Task 4: SPA Navigation Handling
  - [ ] Subtask 4.1: Create `apps/extension/src/content/spa-nav.ts` exporting `onRouteChange(callback)` that monkey-patches `history.pushState`/`history.replaceState` and listens for `popstate`.
  - [ ] Subtask 4.2: Wire `onRouteChange` in `index.ts` to re-invoke the active parser when URL changes on supported domains.
- [ ] Task 5: Integrate with Existing Tooltip Logic
  - [ ] Subtask 5.1: Confirm that spans created by `DomainParser` via the shared `wrapHighlight` helper inherit the existing `mouseenter`/`mouseleave` listeners feeding into `showTooltip`. No changes to `showTooltip` itself.
- [ ] Task 6: Testing
  - [ ] Subtask 6.1: Extend E2E Playwright tests to mock a DexScreener HTML structure (representative of pair detail page) and verify detection + tooltip trigger.
  - [ ] Subtask 6.2: Add a parallel CoinMarketCap fixture (representative of currency detail page) with the same assertion shape.
  - [ ] Subtask 6.3: **Idempotency test** — invoke parser `extract()` twice on the same DOM and assert no duplicate `.chainlens-token-highlight` spans are produced. Verifies that re-runs on SPA navigation or MutationObserver re-fire are safe.

## Dev Notes

### Existing implementation context

- The current implementation in [apps/extension/src/content/index.ts](apps/extension/src/content/index.ts) relies on a global `TreeWalker` and a general regex (`TOKEN_REGEX` at line 4) that requires `$` for tickers but accepts bare addresses.
- The shadow-host dedup guard at [index.ts:24](apps/extension/src/content/index.ts#L24) prevents multiple `init()` runs but does NOT cover SPA route changes — that's why Task 4 is required.
- The current `MutationObserver` watches all of `document.body` ([index.ts:250](apps/extension/src/content/index.ts#L250)). On CMC this would fire constantly due to the live price ticker. Parsers MUST narrow `observeTarget`.
- The `chainlens-token-highlight` class check in the TreeWalker filter ([index.ts:174](apps/extension/src/content/index.ts#L174)) is the idempotency mechanism for the generic path. The `DomainParser` path must implement equivalent: skip elements whose nearest ancestor already has the class.

### `DomainParser` contract

```ts
// apps/extension/src/content/parsers/types.ts

export type TokenSource = 'url' | 'aria' | 'data-attr' | 'selector';

export interface ExtractedToken {
  /** The element whose text content should be wrapped. Parser is responsible
   *  for picking an element whose direct text is the token string (e.g. an
   *  inner <span>, not the whole <h1>). */
  element: HTMLElement;
  /** The token string — contract address (preferred) or ticker symbol. */
  token: string;
  /** Where the token was sourced. Used for debugging + fragility logging. */
  source: TokenSource;
}

export interface DomainParser {
  /** Hostname substrings — matched via window.location.hostname.includes(...) */
  hostnames: string[];

  /** Find tokens on the current page. Must be idempotent: calling extract()
   *  on a DOM where spans are already injected MUST NOT produce duplicates.
   *  Implementations should skip elements that already have an ancestor
   *  with class `chainlens-token-highlight`. */
  extract(root: HTMLElement): ExtractedToken[];

  /** Returns the narrowest stable subtree to observe for mutations.
   *  If null/undefined, defaults to document.body — AVOID this on heavy SPAs. */
  observeTarget?: () => HTMLElement | null;
}
```

### Registry pattern

```ts
// apps/extension/src/content/parsers/registry.ts
import { dexScreenerParser } from './dexscreener';
import { coinMarketCapParser } from './coinmarketcap';

export const PARSERS: DomainParser[] = [
  dexScreenerParser,
  coinMarketCapParser,
];

export function getActiveParser(): DomainParser | null {
  const host = window.location.hostname;
  return PARSERS.find(p => p.hostnames.some(h => host.includes(h))) ?? null;
}
```

### Dispatch in `init()`

```ts
const parser = getActiveParser();
if (parser) {
  runDomainParser(parser);   // parser.extract() + scoped MutationObserver + SPA nav hook
} else {
  scanAndHighlightTokens();  // existing generic TreeWalker path
}
```

### Selector fragility — why the priority chain matters

DexScreener and CoinMarketCap deploy frequently and ship CSS modules with hashed class names (e.g. `.sc-aef7b723-0`, `.style__TokenName-...`). Hard-coded class selectors WILL break within weeks. The fallback chain (URL → ARIA → data-attr → CSS class) means we degrade gracefully and log when we're on a fragile path. URL-based extraction is preferred wherever possible because URLs are the most stable contract these sites expose.

### Token validation rationale

The generic regex requires `$BTC` because `[A-Za-z0-9]{2,10}` would false-positive on `API`, `USD`, `ETH` in plain prose. On supported domains, the parser bypasses this by trusting *position* (token name in page header is a token, not prose). To stay safe, the parser cross-references the ticker with the URL slug as ground truth — e.g. CMC page at `/currencies/bitcoin/` with header `BTC` is trusted; if the header somehow said `USD` it would be skipped.

### Hydration & dynamic DOM

- Both sites are React-based SPAs. Initial render may be skeleton; real content arrives after hydration.
- `observeTarget` scoped to the main content container handles hydration arrival without re-scanning the whole page.
- `spa-nav.ts` covers in-app route changes (no full page reload).
- The shadow-DOM tooltip rendering inside `#chainlens-shadow-host` is already isolated and unaffected.

### Project Structure Notes

Final layout after this story:

```
apps/extension/src/content/
├── index.ts                    # Dispatch logic (parser vs TreeWalker), shadow host init
├── highlight.ts                # NEW: wrapHighlight helper (extracted in Task 0)
├── spa-nav.ts                  # NEW: pushState/popstate hooks (Task 4)
├── index.test.ts               # Existing regex tests, unchanged
└── parsers/                    # NEW
    ├── types.ts                # DomainParser interface
    ├── registry.ts             # PARSERS array + getActiveParser()
    ├── dexscreener.ts
    └── coinmarketcap.ts
```

### Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Selector fragility — DexScreener/CMC ship hashed CSS class names that change between deploys | High | Fallback chain in `extract()`: URL → ARIA → data-attr → CSS class, with `console.warn` on fragile-path use |
| MutationObserver perf on CMC live price ticker | Medium | `observeTarget` scoped to header section, NOT `document.body` |
| SPA navigation breaks detection after first page | Medium | `spa-nav.ts` history API hook + parser re-run |
| Silent breakage when site updates DOM | Medium | `console.warn` on fallback-path entry. Production monitoring (Sentry) deferred but a future story should pick this up |

### References

- **Prerequisite Story 6.1.0**: [6-1-0-advisory-risk-endpoint.md](6-1-0-advisory-risk-endpoint.md) — builds the missing `/v1/advisory/risk` endpoint that this story's AC#4 depends on. Must ship before this story can pass AC#4.
- **Traces to**: PRD §4.1 FR1 (Browser Extension), UX §2.1 (AI Ghost Tooltip with token detection on DexScreener + CoinMarketCap).
- Refer to the implementation in Story 6.1 (commit `a198cb67b`) for the Tooltip integration logic.
- Existing token-detection regex: [apps/extension/src/content/index.ts:4](apps/extension/src/content/index.ts#L4)
- Existing highlight injection: [apps/extension/src/content/index.ts:201-208](apps/extension/src/content/index.ts#L201-L208) (to be extracted in Task 0)
- Existing MutationObserver: [apps/extension/src/content/index.ts:231-250](apps/extension/src/content/index.ts#L231-L250) (to be bypassed when active parser is present)
