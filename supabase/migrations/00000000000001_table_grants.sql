-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  Table Grants (post drizzle-kit push)                                      ║
-- ║                                                                             ║
-- ║  Grants table-level access to Supabase roles for the epsilon schema.        ║
-- ║  No RLS — access control is handled at the API layer.                      ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- Future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA epsilon GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA epsilon GRANT SELECT, INSERT, UPDATE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA epsilon GRANT SELECT ON TABLES TO anon;

-- Existing tables
GRANT ALL ON ALL TABLES IN SCHEMA epsilon TO service_role;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA epsilon TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA epsilon TO anon;
