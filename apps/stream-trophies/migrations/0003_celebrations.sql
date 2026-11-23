CREATE TABLE celebration_rules (
  trophy TEXT PRIMARY KEY REFERENCES trophies(id) ON DELETE CASCADE,
  video TEXT NOT NULL DEFAULT '',
  starts REAL NOT NULL,
  ends REAL NOT NULL,
  phrases TEXT NOT NULL,
  description TEXT NOT NULL
);
