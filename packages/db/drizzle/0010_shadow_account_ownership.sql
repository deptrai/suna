-- Migration 0010: Shadow Account ownership map (Story 5.6)
-- TOFU (Trust-On-First-Use): first authenticated caller of a shadow_id wins.
-- Subsequent callers from a different account_id receive 403 from the proxy.
-- Backfill: not required — only forward-going shadow_ids are scoped by the proxy.

CREATE TABLE IF NOT EXISTS "epsilon"."shadow_account_ownership" (
  "shadow_id" varchar(32) PRIMARY KEY NOT NULL,
  "account_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_shadow_account_ownership_account"
  ON "epsilon"."shadow_account_ownership" ("account_id");
