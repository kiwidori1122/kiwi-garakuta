-- Existing chat / extension records remain keyed by the same YouTube channel ID.
ALTER TABLE viewers ADD COLUMN subscribed INTEGER;
ALTER TABLE viewers ADD COLUMN subscription_checked REAL;
CREATE TABLE web_sessions (
  token TEXT PRIMARY KEY,
  viewer TEXT NOT NULL REFERENCES viewers(id) ON DELETE CASCADE,
  expires REAL NOT NULL
);
CREATE INDEX web_sessions_expires ON web_sessions(expires);
CREATE TABLE web_oauth (
  state TEXT PRIMARY KEY,
  verifier TEXT NOT NULL,
  viewer TEXT,
  expires REAL NOT NULL
);
