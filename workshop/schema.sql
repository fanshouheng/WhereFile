CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  provenance TEXT NOT NULL,
  license TEXT NOT NULL CHECK (license = 'personal-use'),
  config_json TEXT NOT NULL,
  background_type TEXT NOT NULL,
  background_size INTEGER NOT NULL,
  sprite_size INTEGER NOT NULL,
  receipt_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  published_at TEXT
);
CREATE INDEX IF NOT EXISTS submissions_status_date ON submissions(status, created_at DESC);

CREATE TABLE IF NOT EXISTS limits (
  key TEXT PRIMARY KEY,
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  theme_id TEXT NOT NULL REFERENCES submissions(id),
  reason TEXT NOT NULL,
  contact TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reports_theme_date ON reports(theme_id, created_at DESC);

CREATE TABLE IF NOT EXISTS storage_quota (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  bytes INTEGER NOT NULL CHECK (bytes >= 0)
);
INSERT OR IGNORE INTO storage_quota (id, bytes)
  SELECT 1, COALESCE(SUM(background_size + sprite_size), 0) FROM submissions;
