-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  Drop legacy channel_configs table and channel_type enum.               ║
-- ║  Channels v2 uses sandbox-local SQLite managed by kchannel CLI.         ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

DROP TABLE IF EXISTS epsilon.channel_configs CASCADE;
DROP TYPE IF EXISTS epsilon.channel_type CASCADE;
