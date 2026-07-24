-- ─────────────────────────────────────────────────────────────
--  Top5 — D1 Database Schema (SQLite-compatible)
-- ─────────────────────────────────────────────────────────────

-- Main entities table
CREATE TABLE IF NOT EXISTS entities (
    entity_id      TEXT PRIMARY KEY,
    entity_name    TEXT NOT NULL,
    entity_name_en TEXT,
    category       TEXT NOT NULL,           -- intent type: geo, web3, dev, etc.
    description    TEXT,
    image_url      TEXT,
    external_url   TEXT,
    -- Geo-specific
    latitude       REAL,
    longitude      REAL,
    address        TEXT,
    -- External scores
    global_score   REAL DEFAULT 0,          -- 0-100 from external APIs
    -- Community
    upvotes        INTEGER DEFAULT 0,
    -- Metadata
    w5h            TEXT,                    -- JSON string for Who, What, Where, When, Why
    -- Creator metadata
    created_by_user_id  TEXT,
    created_by_username TEXT,
    -- Timestamps
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_voted_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_entities_category    ON entities(category);
CREATE INDEX IF NOT EXISTS idx_entities_location    ON entities(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_entities_upvotes     ON entities(upvotes DESC);
CREATE INDEX IF NOT EXISTS idx_entities_creator     ON entities(created_by_user_id);

-- Vote log for spam prevention (1 vote per IP per entity per 24h)
CREATE TABLE IF NOT EXISTS vote_logs (
    id              TEXT PRIMARY KEY,
    entity_id       TEXT NOT NULL,
    user_identifier TEXT NOT NULL,          -- hashed IP or wallet address
    voted_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(entity_id) REFERENCES entities(entity_id)
);

CREATE INDEX IF NOT EXISTS idx_vote_logs_entity  ON vote_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_vote_logs_user    ON vote_logs(user_identifier, voted_at);

-- Trending query log (non-blocking write, summarized every 24h)
CREATE TABLE IF NOT EXISTS query_logs (
    id         TEXT PRIMARY KEY,
    query      TEXT NOT NULL,
    intent     TEXT NOT NULL,
    searched_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_query_logs_query  ON query_logs(query, searched_at);

-- Users table
CREATE TABLE IF NOT EXISTS users (
    user_id       TEXT PRIMARY KEY,
    username      TEXT UNIQUE NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt          TEXT NOT NULL,
    role          TEXT DEFAULT 'user',      -- 'user' or 'admin'
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- User Sessions table
CREATE TABLE IF NOT EXISTS user_sessions (
    token         TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL,
    expires_at    DATETIME NOT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);

-- Activity Audit Logs table
CREATE TABLE IF NOT EXISTS activity_logs (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL,
    username     TEXT NOT NULL,
    action       TEXT NOT NULL,              -- 'CREATE_ENTITY', 'UPDATE_ENTITY', 'DELETE_ENTITY', 'VOTE'
    entity_id    TEXT,
    entity_name  TEXT,
    details      TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);



-- ══════════════════════════════════════════════════════════════
--  FTS5 Full-Text Search
-- ══════════════════════════════════════════════════════════════
CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts USING fts5(
    entity_id UNINDEXED,
    entity_name,
    entity_name_en,
    description,
    content='entities',
    content_rowid='rowid'
);

-- Triggers to keep entities_fts in sync with entities table
CREATE TRIGGER IF NOT EXISTS entities_ai AFTER INSERT ON entities BEGIN
  INSERT INTO entities_fts(rowid, entity_id, entity_name, entity_name_en, description)
  VALUES (new.rowid, new.entity_id, new.entity_name, new.entity_name_en, new.description);
END;

CREATE TRIGGER IF NOT EXISTS entities_ad AFTER DELETE ON entities BEGIN
  INSERT INTO entities_fts(entities_fts, rowid, entity_id, entity_name, entity_name_en, description)
  VALUES('delete', old.rowid, old.entity_id, old.entity_name, old.entity_name_en, old.description);
END;

CREATE TRIGGER IF NOT EXISTS entities_au AFTER UPDATE ON entities BEGIN
  INSERT INTO entities_fts(entities_fts, rowid, entity_id, entity_name, entity_name_en, description)
  VALUES('delete', old.rowid, old.entity_id, old.entity_name, old.entity_name_en, old.description);
  INSERT INTO entities_fts(rowid, entity_id, entity_name, entity_name_en, description)
  VALUES (new.rowid, new.entity_id, new.entity_name, new.entity_name_en, new.description);
END;
