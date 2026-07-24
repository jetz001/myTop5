-- Migration script for Admin, Role, and Activity Logs
ALTER TABLE entities ADD COLUMN created_by_user_id TEXT;
ALTER TABLE entities ADD COLUMN created_by_username TEXT;
ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';

CREATE INDEX IF NOT EXISTS idx_entities_creator ON entities(created_by_user_id);

CREATE TABLE IF NOT EXISTS activity_logs (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL,
    username     TEXT NOT NULL,
    action       TEXT NOT NULL,
    entity_id    TEXT,
    entity_name  TEXT,
    details      TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);
