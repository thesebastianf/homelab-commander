---
mode: "agent"
description: "Implement Phase 6: Backup Engine — Volume detection, DB-aware dumps, tar/gzip, metadata, stack-level backup, restore"
tools: ["run_in_terminal", "create_file", "replace_string_in_file", "read_file", "grep_search", "file_search", "get_errors"]
---

# Phase 6 — Backup Engine (Critical Path)

The most important engine. Nothing mutates data without a backup path.

## Prerequisites
Phase 5 complete — NAS Gatekeeper and Stack Manager working.

## Tasks

### 6.1 — Volume & Mount Detection (`internal/backup/volumes.go`)
```go
type Mount struct {
    Type        string // volume, bind
    Source      string // host path or volume name
    Destination string // container path
    ReadOnly    bool
}

func DetectMounts(ctx context.Context, dockerClient *docker.Client, containerID string) ([]Mount, error)
```

### 6.2 — Backup Executor (`internal/backup/executor.go`)
```go
type BackupResult struct {
    ContainerID   string
    ContainerName string
    Strategy      string
    FilePath      string
    Size          int64
    Duration      time.Duration
    Checksum      string // SHA256
    Timestamp     time.Time
    Success       bool
    Error         string
}

type Executor struct {
    dockerClient *docker.Client
    eventBus     core.EventBus
    backupDir    string
}

func (e *Executor) Backup(ctx context.Context, container labels.ClassifiedContainer) (*BackupResult, error)
```

Backup flow based on `hlc.backup.strategy`:
1. **`full`**: tar/gzip all volumes and bind mounts
   - If `hlc.backup.stop=true`: stop → backup → restart
   - Archive to `<backupDir>/<container>/<timestamp>.tar.gz`
2. **`db-dump`**: database-aware backup
   - Detect DB type from `hlc.backup.db-type`
   - Execute dump via Docker exec API:
     - Postgres: `pg_dumpall -U postgres`
     - MariaDB/MySQL: `mysqldump --all-databases -u root -p$MYSQL_ROOT_PASSWORD`
     - Redis: `redis-cli BGSAVE` + copy RDB file
   - Compress to `<backupDir>/<container>/<timestamp>.sql.gz`
3. **`none`**: skip, log

Always: calculate SHA256, publish `BackupStarted` / `BackupCompleted` / `BackupFailed` events.

### 6.3 — Stack-Level Backup
```go
func (e *Executor) BackupStack(ctx context.Context, stack stacks.StackInfo, containers []labels.ClassifiedContainer) ([]BackupResult, error)
```
- Backup in dependency order: databases first, then app containers.
- Also backup the stack's compose file and .env file.
- Return aggregate results.

### 6.4 — Backup Metadata (`internal/backup/metadata.go`)
```go
func SaveMetadata(path string, result BackupResult) error
func LoadMetadata(path string) (*BackupMetadata, error)
```

Migration `002_backups.sql`:
```sql
CREATE TABLE IF NOT EXISTS backups (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    container_id   TEXT NOT NULL,
    container_name TEXT NOT NULL,
    stack_name     TEXT,
    strategy       TEXT NOT NULL,
    file_path      TEXT NOT NULL,
    size_bytes     INTEGER NOT NULL,
    checksum       TEXT NOT NULL,
    duration_ms    INTEGER NOT NULL,
    success        BOOLEAN NOT NULL,
    error_message  TEXT,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 6.5 — Restore (`internal/backup/restore.go`)
```go
func (e *Executor) RestoreDryRun(ctx context.Context, backupPath string) (*RestoreReport, error)
func (e *Executor) Restore(ctx context.Context, backupPath string, containerName string) error
```
- Dry-run: verify checksum, list contents, check target exists.
- Full restore: stop container → extract archive → replay SQL dump → restart.
- Publish `RestoreStarted` / `RestoreCompleted` / `RestoreFailed` events.

### 6.6 — Retention Policy
```go
func (e *Executor) PruneOldBackups(ctx context.Context, retentionDays int) ([]string, error)
```
- Delete backup files older than retention period.
- Remove corresponding DB records.
- Run as scheduled job (from Phase 5 scheduler).

### 6.7 — API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/backup/:container` | Trigger backup |
| POST | `/api/v1/stacks/:name/backup` | Backup entire stack |
| GET | `/api/v1/backups` | List all backup records |
| GET | `/api/v1/backups/:container` | Backups for container |
| POST | `/api/v1/restore/dry-run` | Simulate restore |
| POST | `/api/v1/restore` | Execute restore |

## Acceptance Criteria
- [ ] Volume and bind mount detection works
- [ ] Full backup creates verified tar.gz archive
- [ ] DB dump backup works for Postgres, MariaDB, Redis
- [ ] Stack-level backup respects dependency order
- [ ] Compose + .env files included in stack backup
- [ ] Backup metadata persisted to JSON and SQLite
- [ ] Restore dry-run and full restore work
- [ ] Retention pruning removes old backups
- [ ] Events published to Event Bus
- [ ] `go test ./...` passes
