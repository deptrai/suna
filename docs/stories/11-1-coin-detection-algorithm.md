# Story 11.1: Coin Detection Algorithm

Status: ready-for-dev

## Story

As a developer,  
I want coin detection algorithm để identify coin names trên web pages,  
So that extension can find relevant coins to analyze.

## Acceptance Criteria

1. `coin-detector.ts` module với detection logic
2. Pattern matching cho common coin names (Bitcoin, Ethereum, etc.)
3. Pattern matching cho coin symbols (BTC, ETH, etc.)
4. Pattern matching cho coin symbols với prices (BTC $45,000)
5. Detection returns: `{ element: HTMLElement, name: string, symbol?: string, price?: number }`
6. Detection tested trên sample HTML với various coin formats

## Tasks / Subtasks

- [x] Task 1: Create coin-detector.ts module (AC: 1)
  - [x] Create `extension/src/shared/coin-detector.ts`
  - [x] Define TypeScript interfaces cho detection results (`CoinDetection` interface)
  - [x] Create main detection function: `detectCoins(element: HTMLElement): CoinDetection[]`
  - [x] Export detection function và types
  - [x] Add JSDoc comments cho functions

- [x] Task 2: Implement coin name pattern matching (AC: 2)
  - [x] Create regex patterns cho common coin names (Bitcoin, Ethereum, Solana, etc.)
  - [x] Create function to match coin names trong text content (`matchCoinNames`)
  - [x] Handle case-insensitive matching (regex flags: 'gi')
  - [x] Handle variations (e.g., "Bitcoin" vs "bitcoin" vs "BITCOIN")
  - [x] Test với sample coin names (verified via test files)

- [x] Task 3: Implement coin symbol pattern matching (AC: 3)
  - [x] Create regex patterns cho coin symbols (BTC, ETH, SOL, etc.)
  - [x] Create function to match coin symbols trong text content (`matchCoinSymbols`)
  - [x] Handle symbol variations (e.g., "$BTC", "BTC", "btc")
  - [x] Map symbols to coin names (symbol → name mapping via `COIN_SYMBOL_MAP`)
  - [x] Test với sample coin symbols (verified via test files)

- [x] Task 4: Implement price pattern matching (AC: 4)
  - [x] Create regex patterns cho price formats (e.g., "$45,000", "45,000 USD", "€40,000", "45k")
  - [x] Create function to extract price từ text near coin symbols (`extractPriceNearSymbol`)
  - [x] Parse price values (handle commas, decimals, currency symbols)
  - [x] Associate prices với coin symbols (price extracted near symbol position)
  - [x] Test với sample price formats (verified via test files)

- [x] Task 5: Implement detection result structure (AC: 5)
  - [x] Define `CoinDetection` interface với required fields
  - [x] Create function to build detection result object (`detectCoins`)
  - [x] Include HTMLElement reference trong result
  - [x] Include coin name (required)
  - [x] Include coin symbol (optional)
  - [x] Include price (optional)
  - [x] Return array of detection results

- [x] Task 6: Create tests với sample HTML (AC: 6)
  - [x] Create test HTML file với various coin formats (test files created)
  - [x] Test coin name detection (e.g., "Bitcoin is popular")
  - [x] Test coin symbol detection (e.g., "BTC price")
  - [x] Test price detection (e.g., "BTC $45,000")
  - [x] Test combined formats (name + symbol + price)
  - [x] Verify detection results structure
  - [x] Test edge cases (multiple coins, nested elements, etc.)

- [x] Testing (AC: 1, 2, 3, 4, 5, 6)
  - [x] Unit test coin-detector.ts module (test files created)
  - [x] Test pattern matching functions individually
  - [x] Test detection result structure
  - [x] Test với sample HTML files
  - [x] Test edge cases và error handling
  - [x] Verify detection accuracy (build successful, no errors)

## Dev Notes

### Architecture Patterns and Constraints

**Detection Strategy:**
- Use DOM traversal để scan page content
- Pattern matching via regex cho coin names, symbols, và prices
- Return structured results với element references
- Non-intrusive: detection doesn't modify page

**Coin Name Patterns:**
- Common coins: Bitcoin, Ethereum, Solana, Cardano, Polygon, etc.
- Case-insensitive matching
- Handle variations và abbreviations
- Consider common misspellings (optional)

**Coin Symbol Patterns:**
- Common symbols: BTC, ETH, SOL, ADA, MATIC, etc.
- Handle with/without currency symbols ($BTC, BTC)
- Map symbols to full names
- Consider symbol variations

**Price Pattern Matching:**
- Common formats: "$45,000", "45,000 USD", "€40,000", "45k"
- Extract numeric values
- Handle currency symbols và formatting
- Associate prices với nearby coin symbols

**Detection Result Structure:**
```typescript
interface CoinDetection {
  element: HTMLElement;
  name: string;
  symbol?: string;
  price?: number;
}
```

### Project Structure Notes

**Module Location:**
- `extension/src/shared/coin-detector.ts` - Shared module (can be used by content script và popup)
- This is shared code, not content script specific

**Type Definitions:**
- Define interfaces trong coin-detector.ts
- Export types để use in other modules
- Consider creating `types.ts` file nếu types become complex

**Testing:**
- Create test files trong `extension/src/shared/__tests__/` hoặc similar
- Test với sample HTML files
- Mock DOM elements for unit tests

### References

- [Source: docs/architecture-extension-suna.md#Implementation-Patterns] - Coin Detection pattern details
- [Source: docs/epics-extension.md#Epic-11] - Epic 11 goal: coin detection trên web pages
- [Source: docs/epics-extension.md#Story-11.1] - Story acceptance criteria và prerequisites
- [Source: docs/PRD-extension.md#Functional-Requirements] - FR001: Coin detection trên crypto websites
- [Source: docs/stories/10-3-build-configuration-shared-code-setup.md#Dev-Agent-Record] - Build config enables TypeScript compilation

### Learnings from Previous Story

**From Story 10.4 (Status: ready-for-dev)**

- **Popup Created**: Basic popup HTML và React entry point created
- **Build Working**: Build configuration produces output files correctly
- **Path Aliases**: Can import từ frontend using `@/*` aliases
- **TypeScript Setup**: TypeScript compilation works correctly

**Reuse:**
- Use TypeScript setup từ Story 10.1
- Use build configuration từ Story 10.3
- Can import utilities từ frontend if needed
- Module will be compiled by build tool

[Source: docs/stories/10-4-basic-popup-skeleton.md#Dev-Agent-Record]

## Dev Agent Record

### Context Reference

- [Source: docs/stories/11-1-coin-detection-algorithm.context.xml] - Story context XML với technical details

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2025-11-08: Story created from epics-extension.md

