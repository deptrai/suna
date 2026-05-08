# Deferred Work

Items deferred from code reviews — pre-existing issues or hard policy calls that aren't actionable in the current change.

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
