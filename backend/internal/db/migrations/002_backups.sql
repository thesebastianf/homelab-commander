CREATE TABLE IF NOT EXISTS backups (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    container_id   TEXT NOT NULL,
    container_name TEXT NOT NULL,
    stack_name     TEXT,
    strategy       TEXT NOT NULL,
    file_path      TEXT NOT NULL,
    size_bytes     INTEGER NOT NULL DEFAULT 0,
    checksum       TEXT NOT NULL DEFAULT '',
    duration_ms    INTEGER NOT NULL DEFAULT 0,
    success        BOOLEAN NOT NULL,
    error_message  TEXT,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_backups_container ON backups(container_name, created_at);
CREATE INDEX IF NOT EXISTS idx_backups_stack ON backups(stack_name, created_at);
