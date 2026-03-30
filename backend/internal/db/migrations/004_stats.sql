CREATE TABLE IF NOT EXISTS stats_history (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    container_id   TEXT NOT NULL,
    container_name TEXT NOT NULL,
    cpu_percent    REAL,
    memory_bytes   INTEGER,
    memory_limit   INTEGER,
    restart_count  INTEGER,
    uptime_seconds INTEGER,
    collected_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stats_container ON stats_history(container_id, collected_at);
