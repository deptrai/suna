-- Migration 0009: Token Terminal fundamentals cache + valuation snapshots (Story 2.3.2)

CREATE TABLE IF NOT EXISTS "epsilon"."token_terminal_projects" (
  "project_id" varchar(128) PRIMARY KEY NOT NULL,
  "project_name" varchar(255) NOT NULL,
  "symbol" varchar(64),
  "market_sector" varchar(128),
  "website_url" text,
  "token_addresses" jsonb NOT NULL DEFAULT '[]',
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "source" varchar(32) NOT NULL DEFAULT 'token_terminal',
  "fetched_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "epsilon"."token_terminal_metrics" (
  "metric_id" varchar(128) PRIMARY KEY NOT NULL,
  "metric_name" varchar(255) NOT NULL,
  "description" text,
  "url" text,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "source" varchar(32) NOT NULL DEFAULT 'token_terminal',
  "fetched_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "epsilon"."token_terminal_project_metrics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" varchar(128) NOT NULL,
  "project_name" varchar(255),
  "metric_id" varchar(128) NOT NULL,
  "metric_name" varchar(255),
  "timestamp" timestamptz NOT NULL,
  "value" numeric(30,8),
  "raw_value" text,
  "source" varchar(32) NOT NULL DEFAULT 'token_terminal',
  "fetched_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_token_terminal_project_metrics_p_m_t_s"
  ON "epsilon"."token_terminal_project_metrics" ("project_id", "metric_id", "timestamp", "source");
CREATE INDEX IF NOT EXISTS "idx_token_terminal_project_metrics_pm_ts"
  ON "epsilon"."token_terminal_project_metrics" ("project_id", "metric_id", "timestamp" DESC);
CREATE INDEX IF NOT EXISTS "idx_token_terminal_project_metrics_m_ts"
  ON "epsilon"."token_terminal_project_metrics" ("metric_id", "timestamp" DESC);

CREATE TABLE IF NOT EXISTS "epsilon"."token_terminal_valuation_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" varchar(128) NOT NULL,
  "project_name" varchar(255),
  "symbol" varchar(64),
  "sector" varchar(128),
  "fees_annualized_usd" numeric(30,4),
  "revenue_annualized_usd" numeric(30,4),
  "earnings_annualized_usd" numeric(30,4),
  "market_cap_fully_diluted_usd" numeric(30,4),
  "market_cap_circulating_usd" numeric(30,4),
  "ps_ratio_fully_diluted" numeric(20,6),
  "ps_ratio_circulating" numeric(20,6),
  "pf_ratio_fully_diluted" numeric(20,6),
  "pf_ratio_circulating" numeric(20,6),
  "pe_ratio" numeric(20,6),
  "user_dau" integer,
  "active_developers" integer,
  "code_commits" integer,
  "valuation_signal" varchar(32) NOT NULL DEFAULT 'unknown',
  "peer_percentiles" jsonb NOT NULL DEFAULT '{}',
  "risk_factors" jsonb NOT NULL DEFAULT '[]',
  "source" varchar(32) NOT NULL DEFAULT 'token_terminal',
  "period_start" timestamptz,
  "period_end" timestamptz,
  "fetched_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_token_terminal_valuation_snapshots_p_pe_s"
  ON "epsilon"."token_terminal_valuation_snapshots" ("project_id", "period_end", "source");
CREATE INDEX IF NOT EXISTS "idx_token_terminal_valuation_snapshots_sector_period"
  ON "epsilon"."token_terminal_valuation_snapshots" ("sector", "period_end" DESC);
CREATE INDEX IF NOT EXISTS "idx_token_terminal_valuation_snapshots_signal_period"
  ON "epsilon"."token_terminal_valuation_snapshots" ("valuation_signal", "period_end" DESC);
CREATE INDEX IF NOT EXISTS "idx_token_terminal_valuation_snapshots_ps_fd"
  ON "epsilon"."token_terminal_valuation_snapshots" ("ps_ratio_fully_diluted");
CREATE INDEX IF NOT EXISTS "idx_token_terminal_valuation_snapshots_user_dau"
  ON "epsilon"."token_terminal_valuation_snapshots" ("user_dau");
