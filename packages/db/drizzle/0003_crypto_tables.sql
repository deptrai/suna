CREATE TABLE "epsilon"."protocol_watchlist" (
	"slug" varchar(100) PRIMARY KEY NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "epsilon"."protocol_tvl_snapshots" (
	"slug" varchar(100) PRIMARY KEY NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"tvl_usd" numeric(20, 4) NOT NULL,
	"tvl_change_24h_pct" numeric(10, 4),
	"apy_avg" numeric(10, 4),
	"chains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw_snapshot" text,
	"fetched_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_protocol_snapshots_updated" ON "epsilon"."protocol_tvl_snapshots" USING btree ("updated_at");
--> statement-breakpoint
INSERT INTO "epsilon"."protocol_watchlist" ("slug", "display_name") VALUES
  ('lido', 'Lido'),
  ('aave-v3', 'Aave V3'),
  ('eigenlayer', 'EigenLayer'),
  ('uniswap', 'Uniswap'),
  ('curve-dex', 'Curve DEX'),
  ('compound-v3', 'Compound V3'),
  ('makerdao', 'MakerDAO'),
  ('rocket-pool', 'Rocket Pool'),
  ('pendle', 'Pendle'),
  ('pancakeswap', 'PancakeSwap'),
  ('gmx', 'GMX'),
  ('balancer-v2', 'Balancer V2'),
  ('convex-finance', 'Convex Finance'),
  ('instadapp', 'Instadapp'),
  ('stargate', 'Stargate')
ON CONFLICT ("slug") DO NOTHING;
