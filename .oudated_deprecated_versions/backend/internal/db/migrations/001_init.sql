CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS policies (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT UNIQUE NOT NULL,
    enabled    BOOLEAN NOT NULL DEFAULT 0,
    config     TEXT NOT NULL DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS global_envs (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    category   TEXT NOT NULL DEFAULT 'custom',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed default settings
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('base_stack_path', '/opt/stacks'),
    ('base_volume_path', '/opt/volumes'),
    ('homepage_url', ''),
    ('instance_name', 'HomeLab-01'),
    ('nas.anchor_file', '.hlc_ready'),
    ('nas.boot_timeout', '300'),
    ('nas.poll_interval_boot', '10'),
    ('nas.poll_interval_steady', '60');

-- Seed default global envs
INSERT OR IGNORE INTO global_envs (key, value, category) VALUES
    ('TZ', 'Europe/Berlin', 'system'),
    ('PUID', '1000', 'system'),
    ('PGID', '1000', 'system');

-- Seed MSM policy
INSERT OR IGNORE INTO policies (name, enabled, config) VALUES
    ('max_stability_mode', 0, '{"block":["update","restart","config_change"],"allow":["backup","health_check","db_dump"]}'),
    ('quiet_hours', 0, '{"start":"02:00","end":"06:00","block":["update","restart"]}');
