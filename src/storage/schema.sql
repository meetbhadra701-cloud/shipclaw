-- ShipClaw SQLite Schema
-- Claude-primary file. Do NOT alter without logging in COMMUNICATION_LOG.md.
-- Apply via: npm run migrate

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ─── runs ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS runs (
  id                  TEXT PRIMARY KEY,
  goal                TEXT NOT NULL,
  repo                TEXT NOT NULL,
  mode                TEXT NOT NULL CHECK (mode IN ('live', 'demo', 'fallback')),
  status              TEXT NOT NULL DEFAULT 'initializing'
                        CHECK (status IN ('initializing','running','awaiting_approval','finalizing','complete','error')),
  readiness_score     REAL,          -- deterministic total 0–100
  score_band          TEXT,          -- NOT_READY | RISKY | READY
  time_to_ship_min    INTEGER,       -- minutes
  time_to_ship_max    INTEGER,       -- minutes
  final_decision      TEXT,          -- ship | hold | unknown
  confidence          REAL,          -- 0–1, from assessor
  artifact_dir        TEXT,          -- path to runs/<id>/
  error_message       TEXT,
  started_at          TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at         TEXT
);

-- ─── events ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  payload     TEXT NOT NULL,          -- JSON
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_run_created
  ON events (run_id, created_at);

-- ─── memories ────────────────────────────────────────────────────────────────
-- Persistent key-value store; updated after each run.
CREATE TABLE IF NOT EXISTS memories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (run_id, key)
);

CREATE INDEX IF NOT EXISTS idx_memories_run
  ON memories (run_id, key);

-- Global memory (cross-run; run_id = '__global__')
CREATE TABLE IF NOT EXISTS global_memory (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── approvals ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approvals (
  id                  TEXT PRIMARY KEY,
  run_id              TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  action_description  TEXT NOT NULL,
  risk_level          TEXT NOT NULL CHECK (risk_level IN ('low','medium','high','critical')),
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','rejected')),
  requested_at        TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at         TEXT,
  resolved_by         TEXT          -- 'human' | 'auto'
);

CREATE INDEX IF NOT EXISTS idx_approvals_run_status
  ON approvals (run_id, status);

-- ─── audit_logs ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  actor       TEXT NOT NULL,         -- 'agent' | 'human' | 'system'
  action      TEXT NOT NULL,
  detail      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_run
  ON audit_logs (run_id, created_at);

-- ─── external_evidence_cache ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS external_evidence_cache (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  source          TEXT NOT NULL DEFAULT 'exa',
  query           TEXT NOT NULL,
  snippet         TEXT NOT NULL,
  url             TEXT NOT NULL,
  relevance_score REAL,
  fetched_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
