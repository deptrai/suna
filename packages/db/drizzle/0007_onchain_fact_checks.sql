CREATE TABLE "epsilon"."project_wallet_watchlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain" varchar(32) NOT NULL,
	"token_address" varchar(128) NOT NULL,
	"token_symbol" varchar(32),
	"project_slug" varchar(128),
	"wallet_address" varchar(128) NOT NULL,
	"wallet_role" varchar(32) DEFAULT 'unknown' NOT NULL,
	"label" text,
	"source" varchar(64) DEFAULT 'manual' NOT NULL,
	"confidence" numeric(5, 4),
	"active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_project_wallet_watchlist_chain_token_wallet" ON "epsilon"."project_wallet_watchlist" USING btree ("chain","token_address","wallet_address");
--> statement-breakpoint
CREATE INDEX "idx_project_wallet_watchlist_chain_token_active" ON "epsilon"."project_wallet_watchlist" USING btree ("chain","token_address","active");
--> statement-breakpoint
CREATE INDEX "idx_project_wallet_watchlist_wallet_address" ON "epsilon"."project_wallet_watchlist" USING btree ("wallet_address");
--> statement-breakpoint
CREATE TABLE "epsilon"."onchain_fact_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discover_feed_id" uuid,
	"chain" varchar(32) NOT NULL,
	"token_address" varchar(128) NOT NULL,
	"token_symbol" varchar(32),
	"article_title" text,
	"article_sentiment" varchar(32) DEFAULT 'unknown' NOT NULL,
	"status" varchar(32) DEFAULT 'skipped' NOT NULL,
	"wallets_checked" integer DEFAULT 0 NOT NULL,
	"net_outflow_pct" numeric(10, 4),
	"largest_wallet_outflow_pct" numeric(10, 4),
	"transfer_count" integer DEFAULT 0 NOT NULL,
	"risk_level" "epsilon"."warning_level" DEFAULT 'none' NOT NULL,
	"risk_factors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_onchain_fact_checks_chain_token_checked" ON "epsilon"."onchain_fact_checks" USING btree ("chain","token_address","checked_at");
--> statement-breakpoint
CREATE INDEX "idx_onchain_fact_checks_status_checked" ON "epsilon"."onchain_fact_checks" USING btree ("status","checked_at");
--> statement-breakpoint
CREATE INDEX "idx_onchain_fact_checks_risk_checked" ON "epsilon"."onchain_fact_checks" USING btree ("risk_level","checked_at");
