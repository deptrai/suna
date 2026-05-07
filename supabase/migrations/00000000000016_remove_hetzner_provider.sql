DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'epsilon'
      AND t.typname = 'sandbox_provider'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM epsilon.sandboxes
      WHERE provider::text = 'hetzner'
    ) THEN
      RAISE EXCEPTION 'Cannot remove hetzner sandbox provider enum while Hetzner sandboxes still exist';
    END IF;

    ALTER TYPE epsilon.sandbox_provider RENAME TO sandbox_provider_old;
    CREATE TYPE epsilon.sandbox_provider AS ENUM ('daytona', 'local_docker', 'justavps');

    ALTER TABLE epsilon.sandboxes
      ALTER COLUMN provider DROP DEFAULT;

    ALTER TABLE epsilon.sandboxes
      ALTER COLUMN provider TYPE epsilon.sandbox_provider
      USING provider::text::epsilon.sandbox_provider;

    ALTER TABLE epsilon.sandboxes
      ALTER COLUMN provider SET DEFAULT 'daytona';

    ALTER TABLE epsilon.server_entries
      ALTER COLUMN provider TYPE epsilon.sandbox_provider
      USING provider::text::epsilon.sandbox_provider;

    ALTER TABLE epsilon.pool_resources
      ALTER COLUMN provider TYPE epsilon.sandbox_provider
      USING provider::text::epsilon.sandbox_provider;

    ALTER TABLE epsilon.pool_sandboxes
      ALTER COLUMN provider TYPE epsilon.sandbox_provider
      USING provider::text::epsilon.sandbox_provider;

    DROP TYPE epsilon.sandbox_provider_old;
  END IF;
END $$;
