-- CP Coach database schema
-- Run against PostgreSQL

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  cf_handle VARCHAR(50),
  lc_handle VARCHAR(50),
  primary_platform VARCHAR(5) DEFAULT 'cf',
  last_synced TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS problems (
  problem_id VARCHAR(60) PRIMARY KEY,
  platform VARCHAR(5),
  name TEXT,
  difficulty INTEGER,
  topics TEXT[],
  solve_count INTEGER,
  url TEXT
);

CREATE TABLE IF NOT EXISTS topic_graph (
  from_topic VARCHAR(50),
  to_topic VARCHAR(50),
  weight FLOAT DEFAULT 1.0,
  PRIMARY KEY (from_topic, to_topic)
);

CREATE TABLE IF NOT EXISTS kt_states (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  topic VARCHAR(50),
  p_mastery FLOAT,
  updated_at TIMESTAMP,
  PRIMARY KEY (user_id, topic)
);

-- Seed prerequisite graph (18 directed edges)
INSERT INTO topic_graph (from_topic, to_topic, weight) VALUES
  ('implementation', 'math', 1.0),
  ('math', 'greedy', 1.0),
  ('math', 'constructive_algorithms', 1.0),
  ('greedy', 'binary_search', 1.0),
  ('binary_search', 'data_structures', 1.0),
  ('data_structures', 'trees', 1.0),
  ('data_structures', 'graphs', 1.0),
  ('trees', 'dfs_and_similar', 1.0),
  ('graphs', 'dfs_and_similar', 1.0),
  ('dfs_and_similar', 'dp', 1.0),
  ('dp', 'dp_on_trees', 1.0),
  ('greedy', 'dp', 1.0),
  ('math', 'number_theory', 1.0),
  ('number_theory', 'combinatorics', 1.0),
  ('binary_search', 'sortings', 1.0),
  ('sortings', 'data_structures', 1.0),
  ('math', 'two_pointers', 1.0),
  ('two_pointers', 'binary_search', 1.0)
ON CONFLICT DO NOTHING;
