---
mode: "agent"
description: "Implement Phase 2: State & Configuration — SQLite, settings, Global Path/Env Hub, Policy Engine, REST API"
tools: ["run_in_terminal", "create_file", "replace_string_in_file", "read_file", "grep_search", "file_search", "get_errors"]
---

# Phase 2 — State & Configuration Hub

Build persistence layer (SQLite), settings, the Global Env Hub for centralized variable management, and the Policy Engine.

## Prerequisites
Phase 1 complete — Event Bus and Docker client working.

## Tasks

### 2.1 — SQLite Setup (`internal/db/`)
```
internal/db/
  db.go              # Open, migrate, close
  db_test.go
  migrations/
    001_init.sql
```

```go
func Open(path string) (*sql.DB, error)
func Migrate(db *sql.DB) error
```

Migration `001_init.sql`:
```sql
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
    ('instance_name', 'HomeLab-01');

-- Seed default global envs
INSERT OR IGNORE INTO global_envs (key, value, category) VALUES
    ('TZ', 'Europe/Berlin', 'system'),
    ('PUID', '1000', 'system'),
    ('PGID', '1000', 'system');

-- Seed MSM policy
INSERT OR IGNORE INTO policies (name, enabled, config) VALUES
    ('max_stability_mode', 0, '{"block":["update","restart","config_change"],"allow":["backup","health_check","db_dump"]}');
```

Use `modernc.org/sqlite` — add to go.mod.

### 2.2 — Settings Repository (`internal/db/settings.go`)
```go
type SettingsRepo struct { db *sql.DB }

func (r *SettingsRepo) Get(ctx context.Context, key string) (string, error)
func (r *SettingsRepo) Set(ctx context.Context, key, value string) error
func (r *SettingsRepo) GetAll(ctx context.Context) (map[string]string, error)
```

### 2.3 — Global Env Hub (`internal/envhub/`)
```
internal/envhub/
  store.go           # CRUD for global env variables
  store_test.go
  injector.go        # Write env vars into stack .env files
  injector_test.go
```

```go
// store.go
type EnvVar struct {
    Key      string
    Value    string
    Category string // "system", "credentials", "custom"
}

type Store interface {
    Get(ctx context.Context, key string) (*EnvVar, error)
    Set(ctx context.Context, key, value, category string) error
    Delete(ctx context.Context, key string) error
    List(ctx context.Context) ([]EnvVar, error)
    ListByCategory(ctx context.Context, category string) ([]EnvVar, error)
}

// injector.go
type Injector struct {
    store         Store
    baseStackPath string
}

// InjectIntoStack writes global env vars into a stack's .env file.
// It merges with existing local overrides (local takes priority unless force=true).
func (i *Injector) InjectIntoStack(ctx context.Context, stackDir string, force bool) error

// FindAffectedStacks returns stacks whose .env files reference the given key.
func (i *Injector) FindAffectedStacks(ctx context.Context, key string) ([]string, error)

// ProposeUpdates generates a list of stacks that should be updated when a global env changes.
func (i *Injector) ProposeUpdates(ctx context.Context, key, newValue string) ([]EnvUpdate, error)

type EnvUpdate struct {
    StackName string
    FilePath  string
    OldValue  string
    NewValue  string
}
```

### 2.4 — Path Presets
Path presets are special settings that resolve template variables:
- `{{BASE_STACK}}` → value of `base_stack_path` setting
- `{{BASE_VOL}}` → value of `base_volume_path` setting
- Used by stack manager, backup engine, and migration wizard.

```go
// internal/envhub/paths.go
func ResolveTemplate(template string, settings map[string]string) string
```

### 2.5 — Policy Engine (`internal/core/policy_engine.go`)
```go
type PolicyAction string
const (
    ActionAllow PolicyAction = "allow"
    ActionBlock PolicyAction = "block"
    ActionDefer PolicyAction = "defer"
)

type Policy struct {
    ID      int64
    Name    string
    Enabled bool
    Config  map[string]any
}

type PolicyEngine interface {
    Evaluate(ctx context.Context, action string, target string) (PolicyAction, error)
    ListPolicies(ctx context.Context) ([]Policy, error)
    SetPolicy(ctx context.Context, name string, enabled bool, config map[string]any) error
}
```

Built-in policies:
- `max_stability_mode` — when enabled, blocks updates, restarts, config changes
- `quiet_hours` — blocks updates/restarts during specified time window

### 2.6 — REST API (`internal/api/`)
```
internal/api/
  router.go          # HTTP mux setup
  settings.go        # /api/v1/settings handlers
  policies.go        # /api/v1/policies handlers
  envhub.go          # /api/v1/env-hub handlers
  middleware.go       # logging, content-type
  status.go          # /api/v1/status (Homepage widget)
```

Endpoints:
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/settings` | List all settings |
| PUT | `/api/v1/settings/:key` | Update a setting |
| GET | `/api/v1/policies` | List all policies |
| PUT | `/api/v1/policies/:name` | Enable/disable/configure a policy |
| GET | `/api/v1/env-hub` | List all global env vars |
| POST | `/api/v1/env-hub` | Create/update a global env var |
| DELETE | `/api/v1/env-hub/:key` | Delete a global env var |
| POST | `/api/v1/env-hub/:key/propagate` | Check affected stacks & propose updates |
| GET | `/api/v1/status` | Compact status JSON for Homepage widgets |

Use `net/http` standard mux (Go 1.22+ routing patterns).

### 2.7 — Wire into Main
Update `cmd/hlc/main.go`:
1. Open SQLite database (path from `HLC_DB_PATH` env or default `./data/hlc.db`)
2. Create SettingsRepo, EnvHub Store, PolicyEngine
3. Register API routes
4. Start HTTP server (configurable port, default 8080)
5. Graceful shutdown includes DB close

## Acceptance Criteria
- [ ] SQLite database created on first run with correct schema and seed data
- [ ] Settings CRUD works via API
- [ ] Global Env Hub stores and retrieves variables by category
- [ ] Env injection writes variables into a stack's .env file
- [ ] Policy Engine evaluates MSM correctly (block updates when active)
- [ ] Status API returns compact JSON
- [ ] `go test ./...` passes
