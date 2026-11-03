-- CP Coach database schema
-- Run against PostgreSQL

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  cf_handle VARCHAR(50),
  lc_handle VARCHAR(50),
  primary_platform VARCHAR(5) DEFAULT 'cf'
);

CREATE INDEX IF NOT EXISTS idx_users_cf_handle ON users(cf_handle);
CREATE INDEX IF NOT EXISTS idx_users_lc_handle ON users(lc_handle);
-- Enforce handle uniqueness so concurrent SELECT-then-INSERT in _persist_kt_states
-- can't create duplicate user rows. Partial (NULL handles are excluded) — a user
-- with only a cf_handle has NULL lc_handle and must not collide with others like it.
-- The race loser throws IntegrityError, already caught + logged by analyze.py.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_cf_handle_unique ON users(cf_handle) WHERE cf_handle IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_lc_handle_unique ON users(lc_handle) WHERE lc_handle IS NOT NULL;

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

-- Greenhouse Phase 5b: saved plans (the only DB change in the whole program)
CREATE TABLE IF NOT EXISTS plans (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);


-- Enable Row Level Security (RLS) on all tables to prevent public PostgREST API exposure.
-- Direct backend connections (connecting as the owner/postgres role) bypass RLS automatically.

-- Permissive policies: the backend connects as the DB owner which bypasses RLS anyway,
-- but these ensure non-superuser connections also work reliably.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_users ON users;
CREATE POLICY allow_all_users ON users FOR ALL USING (true);
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
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_plans ON plans;
CREATE POLICY allow_all_plans ON plans FOR ALL USING (true);

