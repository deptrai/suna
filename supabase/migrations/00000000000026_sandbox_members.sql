CREATE TABLE IF NOT EXISTS "epsilon"."sandbox_members" (
    "sandbox_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "added_by" uuid,
    "added_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "epsilon"."sandbox_members"
    ADD CONSTRAINT "sandbox_members_sandbox_id_sandboxes_sandbox_id_fk"
    FOREIGN KEY ("sandbox_id") REFERENCES "epsilon"."sandboxes"("sandbox_id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_sandbox_members_unique"
  ON "epsilon"."sandbox_members" ("sandbox_id", "user_id");
CREATE INDEX IF NOT EXISTS "idx_sandbox_members_user"
  ON "epsilon"."sandbox_members" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_sandbox_members_sandbox"
  ON "epsilon"."sandbox_members" ("sandbox_id");

INSERT INTO "epsilon"."sandbox_members" ("sandbox_id", "user_id", "added_by")
SELECT s."sandbox_id", am."user_id", NULL
FROM "epsilon"."sandboxes" s
JOIN "epsilon"."account_members" am
  ON am."account_id" = s."account_id"
WHERE am."account_role" = 'member'
ON CONFLICT ("sandbox_id", "user_id") DO NOTHING;
