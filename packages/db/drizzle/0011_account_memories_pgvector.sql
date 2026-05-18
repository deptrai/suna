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
CREATE UNIQUE INDEX IF NOT EXISTS uq_account_memories_account_category_content ON epsilon.account_memories(account_id, category, content);

CREATE TABLE IF NOT EXISTS epsilon.account_memory_vectors (
  memory_id uuid PRIMARY KEY REFERENCES epsilon.account_memories(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES epsilon.accounts(account_id) ON DELETE CASCADE,
  embedding vector(8) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_memory_vectors_account ON epsilon.account_memory_vectors(account_id);
CREATE INDEX IF NOT EXISTS idx_account_memory_vectors_ivfflat ON epsilon.account_memory_vectors USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
