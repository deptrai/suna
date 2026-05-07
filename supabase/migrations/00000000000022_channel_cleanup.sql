-- Channel schema cleanup
-- Remove dead session_strategy and rename system_prompt -> instructions.

ALTER TABLE IF EXISTS epsilon.channel_configs
  DROP COLUMN IF EXISTS session_strategy;

DO $$ BEGIN
  IF to_regclass('epsilon.channel_configs') IS NOT NULL THEN
    ALTER TABLE epsilon.channel_configs
      RENAME COLUMN system_prompt TO instructions;
  END IF;
EXCEPTION
  WHEN undefined_column THEN NULL;
END $$;

DROP TYPE IF EXISTS epsilon.session_strategy;
