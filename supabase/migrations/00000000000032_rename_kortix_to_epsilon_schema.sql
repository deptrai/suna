-- Rename kortix schema to epsilon (applies when upgrading existing DB that still has 'kortix' schema)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'kortix')
     AND NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'epsilon') THEN
    EXECUTE 'ALTER SCHEMA kortix RENAME TO epsilon';
  END IF;
END $$;
