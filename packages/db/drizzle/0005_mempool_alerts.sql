CREATE TABLE "epsilon"."mempool_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain" varchar(32) NOT NULL,
	"provider" varchar(50) NOT NULL,
	"tx_hash" varchar(100) NOT NULL,
	"from_address" varchar(100),
	"to_address" varchar(100),
	"router_address" varchar(100),
	"method_selector" varchar(10),
	"alert_type" varchar(50) NOT NULL,
	"estimated_value_usd" numeric(20, 4),
	"native_value_wei" text,
	"token_in" varchar(100),
	"token_out" varchar(100),
	"gas_limit" varchar(100),
	"chain_id" varchar(20),
	"gas_price_wei" text,
	"raw_tx" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mempool_alerts_chain_tx_hash" ON "epsilon"."mempool_alerts" USING btree ("chain","tx_hash");
--> statement-breakpoint
CREATE INDEX "idx_mempool_alerts_detected_at" ON "epsilon"."mempool_alerts" USING btree ("detected_at");
--> statement-breakpoint
CREATE INDEX "idx_mempool_alerts_chain_detected" ON "epsilon"."mempool_alerts" USING btree ("chain","detected_at");
--> statement-breakpoint
CREATE INDEX "idx_mempool_alerts_alert_type" ON "epsilon"."mempool_alerts" USING btree ("alert_type");
--> statement-breakpoint
CREATE INDEX "idx_mempool_alerts_pending" ON "epsilon"."mempool_alerts" USING btree ("status") WHERE "status" = 'pending';
