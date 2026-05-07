ALTER TABLE "epsilon"."sandbox_invites"
  ADD COLUMN IF NOT EXISTS "initial_role" "epsilon"."account_role";

UPDATE "epsilon"."sandbox_invites"
SET "initial_role" = 'member'
WHERE "initial_role" IS NULL;

ALTER TABLE "epsilon"."sandbox_invites"
  ALTER COLUMN "initial_role" SET DEFAULT 'member';

ALTER TABLE "epsilon"."sandbox_invites"
  ALTER COLUMN "initial_role" SET NOT NULL;
