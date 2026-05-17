# OpenCode Custom Tools

Custom tools for the Epsilon OpenCode plugin. Each `.ts` file is auto-discovered and registered as a tool.

All tools call the epsilon-api proxy (`EPSILON_API_URL/v1/router/{tool}`) — they do NOT call external APIs directly.

## vibe_trading_backtest

**Tier**: Tier 2 only (`chainlens-tier2.md` — `vibe_trading_backtest: allow`)

Submits a backtest job to Vibe-Trading and polls for completion within a 30-second budget.

### Phases

| Phase | Condition | Returns |
|-------|-----------|---------|
| A (current) | `status="unknown"` + `data_summary` present (2-poll confirmation) | `phase:"A"`, `status:"data_loaded"`, `data_summary` |
| B (after VT Epic 2.3) | `status="success"` + `metrics.sharpe` populated | `phase:"B"`, `metrics`, `equity_curve`, `trade_log` |

Phase A confirms data load from Binance/exchange. Phase B returns full backtest results.

### Key constraints (mirrored from Pydantic)

- `instrument_type`: `"SPOT"` or `"PERPETUAL"` — NOT `"FUTURES"`
- `historical_range`: 1–3650 days
- `timeframe`: regex `/^\d+[mhdwM]$/` — e.g. `"1m"`, `"4h"`, `"1d"`, `"1w"`, `"1M"`
- SPOT + `leverage > 1.0` → rejected

### Timeout behavior

Job continues in background after the 30-second budget. The tool returns `{ success: false, run_id, error: "...timeout...job_id..." }` so the agent can retry via `run_id`.

### Backend route

`POST /v1/router/vibe-trading/jobs` → `GET /v1/router/vibe-trading/runs/:jobId`

Billing: 1.00 credit per job submission (`vibe_trading_backtest` in `TOOL_PRICING`).

## mempool_alerts

**Tier**: Tier 2 only (`chainlens-tier2.md` — `mempool_alerts: allow`, Tier 1 denied)

Reads pre-indexed mempool alert data from the internal route.

### Backend route

`GET /v1/router/mempool-alerts`

Query parameters: `chain` (string), `alert_type` (enum: `large_swap`/`sandwich_suspect`/`frontrun_suspect`/`unknown_large_tx`), `min_value_usd` (number, finite), `limit` (1–100, default 50), `since_minutes` (1–1440, default 60).

### Billing

0.05 credit baseline per query (`mempool_alerts` in `TOOL_PRICING`). Billing is `combinedAuth` + atomic `checkCredits` → `deductToolCredits` (NFR8 parity with `token-info`/`token-holders`).

### Default behaviour

If the tool omits `since_minutes`, the route default of 60 minutes applies. The tool currently only forwards `since_minutes` when the LLM provides a numeric value — adjust both ends if defaults are ever tightened.

### Key constraints

- Tool only queries epsilon-api/DB cache (no upstream WebSocket).
- Tool does not connect to QuickNode/Blocknative or open any mempool WebSocket.
- Continuous sniffing is handled by the background worker (`mempool-worker`) only.
