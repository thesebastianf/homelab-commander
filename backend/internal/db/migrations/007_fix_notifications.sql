-- Migration 007: Fix notification tables to match handler expectations.
-- Drops and recreates both tables with correct column names and types.

DROP TABLE IF EXISTS notification_channels;
DROP TABLE IF EXISTS notification_log;

CREATE TABLE notification_channels (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    type       TEXT NOT NULL DEFAULT 'webhook',
    name       TEXT NOT NULL,
    config     TEXT NOT NULL DEFAULT '{}',
    events     TEXT,
    min_level  TEXT DEFAULT 'warning',
    enabled    BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notification_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id    INTEGER NOT NULL,
    event_type    TEXT NOT NULL,
    message       TEXT NOT NULL DEFAULT '',
    success       BOOLEAN NOT NULL DEFAULT 0,
    error_message TEXT,
    sent_at       DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notif_log_channel ON notification_log(channel_id, sent_at);
