CREATE TABLE IF NOT EXISTS updates (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    container_name TEXT NOT NULL,
    stack_name     TEXT,
    old_image      TEXT NOT NULL,
    new_image      TEXT NOT NULL,
    backup_id      INTEGER REFERENCES backups(id),
    risk_level     TEXT NOT NULL,
    success        BOOLEAN NOT NULL,
    rolled_back    BOOLEAN NOT NULL DEFAULT 0,
    error_message  TEXT,
    duration_ms    INTEGER NOT NULL DEFAULT 0,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);
