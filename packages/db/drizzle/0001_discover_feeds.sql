CREATE TYPE "epsilon"."warning_level" AS ENUM('none', 'low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TABLE "epsilon"."discover_feeds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(500) NOT NULL,
	"summary" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"is_anomaly" boolean DEFAULT false NOT NULL,
	"warning_level" "epsilon"."warning_level" DEFAULT 'none' NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_discover_feeds_timestamp" ON "epsilon"."discover_feeds" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_discover_feeds_anomaly" ON "epsilon"."discover_feeds" USING btree ("timestamp") WHERE is_anomaly = true;
