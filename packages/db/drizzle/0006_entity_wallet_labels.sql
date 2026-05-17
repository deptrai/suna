CREATE TABLE "epsilon"."entity_wallet_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain" varchar(32) NOT NULL,
	"address" varchar(128) NOT NULL,
	"entity_id" varchar(255),
	"entity_name" varchar(255),
	"entity_type" varchar(100),
	"label" varchar(255),
	"tags" jsonb DEFAULT '[]'::jsonb,
	"confidence" numeric(6, 4),
	"risk_category" varchar(64),
	"risk_score" integer,
	"source" varchar(50) DEFAULT 'arkham' NOT NULL,
	"raw_response" jsonb,
	"fetched_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_entity_wallet_labels_chain_addr_src" ON "epsilon"."entity_wallet_labels" USING btree ("chain","address","source");
--> statement-breakpoint
CREATE INDEX "idx_entity_wallet_labels_address" ON "epsilon"."entity_wallet_labels" USING btree ("address");
--> statement-breakpoint
CREATE INDEX "idx_entity_wallet_labels_entity" ON "epsilon"."entity_wallet_labels" USING btree ("entity_id");
--> statement-breakpoint
CREATE INDEX "idx_entity_wallet_labels_risk" ON "epsilon"."entity_wallet_labels" USING btree ("risk_category");
--> statement-breakpoint
CREATE INDEX "idx_entity_wallet_labels_updated" ON "epsilon"."entity_wallet_labels" USING btree ("updated_at");
--> statement-breakpoint
CREATE TABLE "epsilon"."token_holder_entity_risks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain" varchar(32) NOT NULL,
	"token_address" varchar(128) NOT NULL,
	"holder_count" integer,
	"labeled_holder_count" integer,
	"risky_holder_count" integer,
	"top_entities" jsonb DEFAULT '[]'::jsonb,
	"risk_factors" jsonb DEFAULT '[]'::jsonb,
	"risk_score" integer,
	"risk_level" varchar(32),
	"source" varchar(50) DEFAULT 'arkham' NOT NULL,
	"analysis_status" varchar(32) DEFAULT 'complete' NOT NULL,
	"raw_summary" jsonb,
	"fetched_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_token_holder_entity_risks_chain_token_src" ON "epsilon"."token_holder_entity_risks" USING btree ("chain","token_address","source");
--> statement-breakpoint
CREATE INDEX "idx_token_holder_entity_risks_token" ON "epsilon"."token_holder_entity_risks" USING btree ("token_address");
--> statement-breakpoint
CREATE INDEX "idx_token_holder_entity_risks_risk" ON "epsilon"."token_holder_entity_risks" USING btree ("risk_level");
--> statement-breakpoint
CREATE INDEX "idx_token_holder_entity_risks_updated" ON "epsilon"."token_holder_entity_risks" USING btree ("updated_at");
--> statement-breakpoint
CREATE TABLE "epsilon"."entity_wallet_watchlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain" varchar(32) NOT NULL,
	"address" varchar(128) NOT NULL,
	"label" varchar(255),
	"notes" text,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_entity_wallet_watchlist_chain_addr" ON "epsilon"."entity_wallet_watchlist" USING btree ("chain","address");
--> statement-breakpoint
CREATE INDEX "idx_entity_wallet_watchlist_address" ON "epsilon"."entity_wallet_watchlist" USING btree ("address");
