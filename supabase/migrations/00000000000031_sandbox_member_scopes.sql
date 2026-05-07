DO $$ BEGIN
  CREATE TYPE "epsilon"."scope_effect" AS ENUM ('grant', 'revoke');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "epsilon"."sandbox_member_scopes" (
    "sandbox_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "scope" text NOT NULL,
    "effect" "epsilon"."scope_effect" NOT NULL,
    "granted_by" uuid,
    "granted_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "epsilon"."sandbox_member_scopes"
    ADD CONSTRAINT "sandbox_member_scopes_sandbox_id_fk"
    FOREIGN KEY ("sandbox_id") REFERENCES "epsilon"."sandboxes"("sandbox_id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_sandbox_member_scopes_unique"
  ON "epsilon"."sandbox_member_scopes" ("sandbox_id", "user_id", "scope");

CREATE INDEX IF NOT EXISTS "idx_sandbox_member_scopes_lookup"
  ON "epsilon"."sandbox_member_scopes" ("sandbox_id", "user_id");
