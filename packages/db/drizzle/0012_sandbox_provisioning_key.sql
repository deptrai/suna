ALTER TABLE "epsilon"."sandboxes"
ADD COLUMN IF NOT EXISTS "provisioning_key" varchar(128);
