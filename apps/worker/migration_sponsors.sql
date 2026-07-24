-- Migration script for Sponsors table
CREATE TABLE IF NOT EXISTS sponsors (
    sponsor_id     TEXT PRIMARY KEY,
    sponsor_name   TEXT NOT NULL,
    target_keyword TEXT NOT NULL,
    title          TEXT NOT NULL,
    description    TEXT,
    image_url      TEXT,
    target_url     TEXT NOT NULL,
    badge_text     TEXT DEFAULT '⭐ สปอนเซอร์',
    status         TEXT DEFAULT 'active',
    start_at       DATETIME,
    end_at         DATETIME,
    click_count    INTEGER DEFAULT 0,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sponsors_keyword ON sponsors(target_keyword);
CREATE INDEX IF NOT EXISTS idx_sponsors_status  ON sponsors(status);
