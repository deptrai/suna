CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS epsilon.account_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES epsilon.accounts(account_id) ON DELETE CASCADE,
  created_by_user_id uuid,
  category varchar(32) NOT NULL,
  content text NOT NULL,
  confidence numeric(3,2) NOT NULL DEFAULT 1.00,
  source_session_id varchar(128),
  invalidated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_memories_account_active ON epsilon.account_memories(account_id, invalidated_at);
CREATE INDEX IF NOT EXISTS idx_account_memories_account_category ON epsilon.account_memories(account_id, category);
-- F6: partial unique only over active rows so re-extracting a soft-deleted fact
-- doesn't 500 on a unique constraint collision. The extraction code can still
-- handle the active-row case via dedup; soft-deleted rows are audit trail.
CREATE UNIQUE INDEX IF NOT EXISTS uq_account_memories_account_category_content
  ON epsilon.account_memories(account_id, category, content)
  WHERE invalidated_at IS NULL;

CREATE TABLE IF NOT EXISTS epsilon.account_memory_vectors (
  memory_id uuid PRIMARY KEY REFERENCES epsilon.account_memories(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES epsilon.accounts(account_id) ON DELETE CASCADE,
  embedding vector(8) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_memory_vectors_account ON epsilon.account_memory_vectors(account_id);
-- F11: Layer 2 (semantic recall via pgvector) is DEFERRED per spec v2.1. We keep
-- the table+column so a future story can ship real embeddings without another
-- migration, but the ivfflat index is dropped: lists=100 on 8-dim pseudo-hashes
-- is semantically meaningless and may fail on pgvector < 0.5 with empty table.
-- When real embeddings ship, re-create with appropriate dimension + list count.
DROP INDEX IF EXISTS epsilon.idx_account_memory_vectors_ivfflat;

-- F7: GRANT statements. Migration may run as a different role (e.g.
-- supabase_admin) than the application role (postgres/authenticated/service_role)
-- — without these grants the app gets 42501 insufficient_privilege at runtime.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    EXECUTE 'GRANT ALL ON epsilon.account_memories TO postgres';
    EXECUTE 'GRANT ALL ON epsilon.account_memory_vectors TO postgres';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON epsilon.account_memories TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON epsilon.account_memory_vectors TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT ALL ON epsilon.account_memories TO service_role';
    EXECUTE 'GRANT ALL ON epsilon.account_memory_vectors TO service_role';
  END IF;
END $$;
