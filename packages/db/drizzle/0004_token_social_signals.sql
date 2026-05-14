-- Story 2.2.2: Social Sentiment & Narrative Clustering
-- Adds: narrative_category enum, token_social_signals table, extends warning_level enum with 'alpha'

-- Extend warning_level enum with 'alpha' value
ALTER TYPE "epsilon"."warning_level" ADD VALUE IF NOT EXISTS 'alpha';

--> statement-breakpoint

-- Create narrative_category enum
CREATE TYPE "epsilon"."narrative_category" AS ENUM (
  'ai',
  'rwa',
  'memes',
  'depin',
  'gaming',
  'l1',
  'l2',
  'defi',
  'privacy',
  'other'
);

--> statement-breakpoint

-- Create token_social_signals table
CREATE TABLE "epsilon"."token_social_signals" (
  "slug" varchar(100) PRIMARY KEY NOT NULL,
  "symbol" varchar(20) NOT NULL,
  "narrative" "epsilon"."narrative_category" DEFAULT 'other' NOT NULL,
  "social_volume_24h" numeric(20, 4),
  "social_volume_change_24h_pct" numeric(10, 4),
  "social_dominance_pct" numeric(10, 4),
  "sentiment_score" numeric(10, 4),
  "price_usd" numeric(20, 8),
  "price_change_24h_pct" numeric(10, 4),
  "is_alpha_signal" boolean DEFAULT false NOT NULL,
  "fetched_at" timestamptz NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

--> statement-breakpoint

-- Indexes
CREATE INDEX "idx_token_social_narrative" ON "epsilon"."token_social_signals" ("narrative");

--> statement-breakpoint

CREATE INDEX "idx_token_social_alpha" ON "epsilon"."token_social_signals" ("is_alpha_signal", "social_volume_change_24h_pct" DESC)
  WHERE "is_alpha_signal" = true;

--> statement-breakpoint

-- Seed initial watchlist (~30 tokens with narrative mapping)
INSERT INTO "epsilon"."token_social_signals" (slug, symbol, narrative, fetched_at, updated_at)
VALUES
  -- L1
  ('bitcoin',          'BTC',   'l1',      now(), now()),
  ('ethereum',         'ETH',   'l1',      now(), now()),
  ('solana',           'SOL',   'l1',      now(), now()),
  ('avalanche-2',      'AVAX',  'l1',      now(), now()),
  -- L2
  ('arbitrum',         'ARB',   'l2',      now(), now()),
  ('optimism',         'OP',    'l2',      now(), now()),
  ('matic-network',    'MATIC', 'l2',      now(), now()),
  ('starknet',         'STRK',  'l2',      now(), now()),
  -- AI
  ('render-token',     'RNDR',  'ai',      now(), now()),
  ('fetch-ai',         'FET',   'ai',      now(), now()),
  ('singularitynet',   'AGIX',  'ai',      now(), now()),
  ('ocean-protocol',   'OCEAN', 'ai',      now(), now()),
  ('bittensor',        'TAO',   'ai',      now(), now()),
  -- RWA
  ('ondo-finance',     'ONDO',  'rwa',     now(), now()),
  ('maple',            'MPL',   'rwa',     now(), now()),
  ('centrifuge',       'CFG',   'rwa',     now(), now()),
  -- Memes
  ('dogecoin',         'DOGE',  'memes',   now(), now()),
  ('shiba-inu',        'SHIB',  'memes',   now(), now()),
  ('pepe',             'PEPE',  'memes',   now(), now()),
  ('bonk',             'BONK',  'memes',   now(), now()),
  ('dogwifcoin',       'WIF',   'memes',   now(), now()),
  -- DePIN
  ('helium',           'HNT',   'depin',   now(), now()),
  ('iotex',            'IOTX',  'depin',   now(), now()),
  -- Gaming
  ('beam-2',           'BEAM',  'gaming',  now(), now()),
  ('gala',             'GALA',  'gaming',  now(), now()),
  ('apecoin',          'APE',   'gaming',  now(), now()),
  -- DeFi
  ('uniswap',          'UNI',   'defi',    now(), now()),
  ('aave',             'AAVE',  'defi',    now(), now()),
  ('chainlink',        'LINK',  'defi',    now(), now()),
  -- Privacy
  ('monero',           'XMR',   'privacy', now(), now()),
  ('zcash',            'ZEC',   'privacy', now(), now())
ON CONFLICT (slug) DO NOTHING;
