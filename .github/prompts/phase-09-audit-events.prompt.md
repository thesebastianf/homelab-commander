---
mode: "agent"
description: "Implement Phase 9: Audit & Event System — Persistent audit log, event types, timeline API"
tools: ["run_in_terminal", "create_file", "replace_string_in_file", "read_file", "grep_search", "file_search", "get_errors"]
---

# Phase 9 — Audit & Event System

Persistent audit trail for all significant actions.

## Prerequisites
Phase 8 complete.

## Tasks

### 9.1 — Audit Logger (`internal/audit/logger.go`)
```go
type AuditCategory string
const (
    CategoryContainer    AuditCategory = "container"
    CategoryBackup       AuditCategory = "backup"
    CategoryUpdate       AuditCategory = "update"
    CategoryPolicy       AuditCategory = "policy"
    CategorySystem       AuditCategory = "system"
    CategoryMount        AuditCategory = "mount"
    CategoryNotification AuditCategory = "notification"
    CategoryStack        AuditCategory = "stack"
)

type AuditEntry struct {
    ID        int64
    Category  AuditCategory
    Action    string
    Target    string
    Details   map[string]any
    Timestamp time.Time
}

type Logger interface {
    Log(ctx context.Context, entry AuditEntry) error
    Query(ctx context.Context, filter AuditFilter) ([]AuditEntry, error)
}
```

### 9.2 — SQLite Storage
Migration `005_audit.sql`:
```sql
CREATE TABLE IF NOT EXISTS audit_log (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    category  TEXT NOT NULL,
    action    TEXT NOT NULL,
    target    TEXT NOT NULL,
    details   TEXT NOT NULL DEFAULT '{}',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_category ON audit_log(category, timestamp);
CREATE INDEX idx_audit_target ON audit_log(target, timestamp);
```

### 9.3 — Event Bus Subscriber
Auto-capture:
- Container lifecycle: `ContainerStarted`, `ContainerStopped`, `ContainerDied`
- Backups: `BackupStarted`, `BackupCompleted`, `BackupFailed`
- Updates: `UpdateStarted`, `UpdateCompleted`, `UpdateFailed`, `UpdateRolledBack`
- Policy: `PolicyChanged`, `PolicyEvaluated`
- Mounts: `MountReady`, `MountLost`, `MountDegraded`
- Stacks: `StackStarted`, `StackStopped`

### 9.4 — Query & Filter
```go
type AuditFilter struct {
    Category  *AuditCategory
    Target    *string
    Since     *time.Time
    Until     *time.Time
    Limit     int
}
```

### 9.5 — API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/audit` | Query audit log (filter params) |
| GET | `/api/v1/audit/timeline` | Timeline view (grouped by day) |

## Acceptance Criteria
- [ ] All system events persisted to audit log
- [ ] Mount and stack events captured
- [ ] Queryable by category, target, time range
- [ ] Timeline grouping works
- [ ] `go test ./...` passes
