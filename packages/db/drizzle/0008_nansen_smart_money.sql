-- Migration 0008: Nansen Smart Money Flows + Token God Mode Cache (Story 2.3.1)
-- Additive-only — no existing tables modified.

CREATE TABLE IF NOT EXISTS "epsilon"."nansen_smart_money_flows" (
  "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "chain"                 varchar(32) NOT NULL,
  "token_address"         varchar(128) NOT NULL,
  "token_symbol"          varchar(64),
  "metric_type"           varchar(64) NOT NULL,
  "time_window"           varchar(32) NOT NULL,
  "direction"             varchar(32),
  "amount_usd"            numeric(24, 4),
  "net_flow_usd"          numeric(24, 4),
  "wallet_count"          integer,
  "trader_count"          integer,
  "top_wallets"           jsonb NOT NULL DEFAULT '[]',
  "flow_breakdown"        jsonb NOT NULL DEFAULT '{}',
  "risk_factors"          jsonb NOT NULL DEFAULT '[]',
  "source"                varchar(32) NOT NULL DEFAULT 'nansen',
  "provider_credit_cost"  integer,
  "cache_expires_at"      timestamptz NOT NULL,
  "fetched_at"            timestamptz NOT NULL DEFAULT now(),
  "created_at"            timestamptz NOT NULL DEFAULT now(),
  "updated_at"            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_nansen_flows_token_time"
  ON "epsilon"."nansen_smart_money_flows" ("chain", "token_address", "metric_type", "fetched_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_nansen_flows_expires"
  ON "epsilon"."nansen_smart_money_flows" ("cache_expires_at");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_nansen_flows_chain_token_metric_window_source"
  ON "epsilon"."nansen_smart_money_flows" ("chain", "token_address", "metric_type", "time_window", "source");

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "epsilon"."nansen_token_god_mode_cache" (
  "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "chain"                 varchar(32) NOT NULL,
  "token_address"         varchar(128) NOT NULL,
  "token_symbol"          varchar(64),
  "summary"               jsonb NOT NULL DEFAULT '{}',
  "top_buyers"            jsonb NOT NULL DEFAULT '[]',
  "top_sellers"           jsonb NOT NULL DEFAULT '[]',
  "smart_money_flows"     jsonb NOT NULL DEFAULT '{}',
  "exchange_flows"        jsonb NOT NULL DEFAULT '{}',
  "status"                varchar(32) NOT NULL DEFAULT 'complete',
  "source"                varchar(32) NOT NULL DEFAULT 'nansen',
  "provider_credit_cost"  integer,
  "cache_expires_at"      timestamptz NOT NULL,
  "fetched_at"            timestamptz NOT NULL DEFAULT now(),
  "created_at"            timestamptz NOT NULL DEFAULT now(),
  "updated_at"            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_nansen_tgm_token"
  ON "epsilon"."nansen_token_god_mode_cache" ("chain", "token_address");

CREATE INDEX IF NOT EXISTS "idx_nansen_tgm_expires"
  ON "epsilon"."nansen_token_god_mode_cache" ("cache_expires_at");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_nansen_tgm_chain_token_source"
  ON "epsilon"."nansen_token_god_mode_cache" ("chain", "token_address", "source");
