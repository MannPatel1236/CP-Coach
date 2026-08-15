-- CP Coach database schema
-- Run against PostgreSQL

-- Required extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  cf_handle VARCHAR(50),
  lc_handle VARCHAR(50),
  primary_platform VARCHAR(5) DEFAULT 'cf',
  last_synced TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_cf_handle ON users(cf_handle);
CREATE INDEX IF NOT EXISTS idx_users_lc_handle ON users(lc_handle);
-- Enforce handle uniqueness so concurrent SELECT-then-INSERT in _persist_kt_states
-- can't create duplicate user rows. Partial (NULL handles are excluded) — a user
-- with only a cf_handle has NULL lc_handle and must not collide with others like it.
-- The race loser throws IntegrityError, already caught + logged by analyze.py.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_cf_handle_unique ON users(cf_handle) WHERE cf_handle IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_lc_handle_unique ON users(lc_handle) WHERE lc_handle IS NOT NULL;

CREATE TABLE IF NOT EXISTS submissions (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(5) NOT NULL,
  problem_id VARCHAR(60) NOT NULL,
  verdict VARCHAR(20),
  topics TEXT[],
  difficulty INTEGER,
  submitted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_submissions_user ON submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_user_platform ON submissions(user_id, platform);
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_at ON submissions(submitted_at);
CREATE INDEX IF NOT EXISTS idx_submissions_user_at ON submissions(user_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS problems (
  problem_id VARCHAR(60) PRIMARY KEY,
  platform VARCHAR(5),
  name TEXT,
  difficulty INTEGER,
  topics TEXT[],
  solve_count INTEGER,
  url TEXT
);

CREATE INDEX IF NOT EXISTS idx_problems_platform ON problems(platform);
CREATE INDEX IF NOT EXISTS idx_problems_difficulty ON problems(difficulty);
CREATE INDEX IF NOT EXISTS idx_problems_name_trgm ON problems USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_problems_topics ON problems USING GIN (topics);

CREATE TABLE IF NOT EXISTS topic_graph (
  from_topic VARCHAR(50),
  to_topic VARCHAR(50),
  weight FLOAT DEFAULT 1.0,
  PRIMARY KEY (from_topic, to_topic)
);

CREATE TABLE IF NOT EXISTS kt_states (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  topic VARCHAR(50),
  p_mastery FLOAT NOT NULL DEFAULT 0.0,
  updated_at TIMESTAMP,
  PRIMARY KEY (user_id, topic)
);

CREATE INDEX IF NOT EXISTS idx_kt_states_user ON kt_states(user_id);

-- Greenhouse Phase 4: rating trajectory cache (per-handle, TTL checked in code)
CREATE TABLE IF NOT EXISTS rating_trajectory (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(5) NOT NULL DEFAULT 'cf',
  payload JSONB NOT NULL,
  fetched_at TIMESTAMP DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rating_trajectory_user ON rating_trajectory(user_id);

-- Greenhouse Phase 4: mastery history snapshots (K=8 checkpoints per analyze)
CREATE TABLE IF NOT EXISTS mastery_history (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  topic VARCHAR(50),
  checkpoint_idx INTEGER,
  ts BIGINT,
  p_mastery FLOAT NOT NULL DEFAULT 0.0,
  updated_at TIMESTAMP,
  PRIMARY KEY (user_id, topic, checkpoint_idx)
);
CREATE INDEX IF NOT EXISTS idx_mastery_history_user ON mastery_history(user_id);

-- Greenhouse Phase 4: per-week activity buckets (heatmap + streak derivation)
CREATE TABLE IF NOT EXISTS activity_weeks (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  week VARCHAR(10),
  solved INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  active_days INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP,
  PRIMARY KEY (user_id, week)
);

-- Seed prerequisite graph (39 directed edges)
INSERT INTO topic_graph (from_topic, to_topic, weight) VALUES
  -- Root
  ('implementation', 'math', 1.0),
  ('implementation', 'sortings', 1.0),
  ('implementation', 'strings', 1.0),
  ('implementation', 'brute_force', 1.0),
  ('implementation', 'prefix_sum', 1.0),
  -- Math cluster
  ('math', 'greedy', 1.0),
  ('math', 'number_theory', 1.0),
  ('math', 'geometry', 1.0),
  ('math', 'constructive_algorithms', 1.0),
  ('math', 'bitmasks', 1.0),
  -- Sortings cluster
  ('sortings', 'binary_search', 1.0),
  ('sortings', 'two_pointers', 1.0),
  ('sortings', 'data_structures', 1.0),
  ('sortings', 'greedy', 1.0),
  -- Strings
  ('strings', 'hashing', 1.0),
  -- Sequence techniques
  ('two_pointers', 'sliding_window', 1.0),
  ('binary_search', 'data_structures', 1.0),
  ('binary_search', 'divide_and_conquer', 1.0),
  -- Number theory
  ('number_theory', 'combinatorics', 1.0),
  -- Data structures → graph family
  ('data_structures', 'graphs', 1.0),
  ('data_structures', 'trees', 1.0),
  ('data_structures', 'dsu', 1.0),
  ('data_structures', 'shortest_paths', 1.0),
  -- Graph family
  ('graphs', 'dfs_and_similar', 1.0),
  ('graphs', 'shortest_paths', 1.0),
  ('graphs', 'flows', 1.0),
  ('graphs', 'dsu', 1.0),
  -- Trees
  ('trees', 'dfs_and_similar', 1.0),
  ('trees', 'dp_on_trees', 1.0),
  -- DFS/BFS → advanced
  ('dfs_and_similar', 'dp', 1.0),
  ('dfs_and_similar', 'backtracking', 1.0),
  ('dfs_and_similar', 'dp_on_trees', 1.0),
  ('dfs_and_similar', 'flows', 1.0),
  -- DP cluster
  ('greedy', 'dp', 1.0),
  ('dp', 'dp_on_trees', 1.0),
  ('dp', 'string_algorithms', 1.0),
  ('dp', 'matrices', 1.0),
  -- String algorithms
  ('hashing', 'string_algorithms', 1.0),
  -- Backtracking
  ('brute_force', 'backtracking', 1.0)
ON CONFLICT DO NOTHING;

-- Enable Row Level Security (RLS) on all tables to prevent public PostgREST API exposure.
-- Direct backend connections (connecting as the owner/postgres role) bypass RLS automatically.

-- Permissive policies: the backend connects as the DB owner which bypasses RLS anyway,
-- but these ensure non-superuser connections also work reliably.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_users ON users;
CREATE POLICY allow_all_users ON users FOR ALL USING (true);
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_submissions ON submissions;
CREATE POLICY allow_all_submissions ON submissions FOR ALL USING (true);
ALTER TABLE problems ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_problems ON problems;
CREATE POLICY allow_all_problems ON problems FOR ALL USING (true);
ALTER TABLE topic_graph ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_topic_graph ON topic_graph;
CREATE POLICY allow_all_topic_graph ON topic_graph FOR ALL USING (true);
ALTER TABLE kt_states ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_kt_states ON kt_states;
CREATE POLICY allow_all_kt_states ON kt_states FOR ALL USING (true);
ALTER TABLE rating_trajectory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_rating_trajectory ON rating_trajectory;
CREATE POLICY allow_all_rating_trajectory ON rating_trajectory FOR ALL USING (true);
ALTER TABLE mastery_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_mastery_history ON mastery_history;
CREATE POLICY allow_all_mastery_history ON mastery_history FOR ALL USING (true);
ALTER TABLE activity_weeks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_activity_weeks ON activity_weeks;
CREATE POLICY allow_all_activity_weeks ON activity_weeks FOR ALL USING (true);

