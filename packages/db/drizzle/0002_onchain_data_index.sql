CREATE TYPE "epsilon"."onchain_source" AS ENUM('dune', 'nansen');--> statement-breakpoint
CREATE TABLE "epsilon"."onchain_data_index" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "epsilon"."onchain_source" NOT NULL,
	"wallet_address" varchar(512),
	"token_address" varchar(512),
	"metric_name" varchar(255) NOT NULL,
	"metric_value" jsonb NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_onchain_data_source_ts" ON "epsilon"."onchain_data_index" USING btree ("source","timestamp");--> statement-breakpoint
CREATE INDEX "idx_onchain_data_timestamp" ON "epsilon"."onchain_data_index" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_onchain_data_wallet" ON "epsilon"."onchain_data_index" USING btree ("wallet_address") WHERE wallet_address IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_onchain_data_token" ON "epsilon"."onchain_data_index" USING btree ("token_address") WHERE token_address IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_onchain_natural" ON "epsilon"."onchain_data_index" USING btree ("source","metric_name","timestamp","wallet_address","token_address");
