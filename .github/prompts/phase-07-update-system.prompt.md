---
mode: "agent"
description: "Implement Phase 7: Safe Update System — Registry digest comparison, risk detection, backup→update→healthcheck→rollback"
tools: ["run_in_terminal", "create_file", "replace_string_in_file", "read_file", "grep_search", "file_search", "get_errors"]
---

# Phase 7 — Safe Update System

Controlled, safe container image updates with full rollback capability.

## Prerequisites
Phase 6 complete — Backup Engine must be working. **Every update starts with a backup.**

## Tasks

### 7.1 — Registry Digest Comparison (`internal/update/registry.go`)
```go
type ImageStatus struct {
    Image         string
    CurrentDigest string
    LatestDigest  string
    UpdateAvail   bool
    IsLatestTag   bool
    IsVersioned   bool
}

func CheckForUpdate(ctx context.Context, image string, currentDigest string) (*ImageStatus, error)
```
- Query Docker registry v2 API for manifest digest.
- Support Docker Hub, ghcr.io, lscr.io.
- Handle auth tokens for Docker Hub.

### 7.2 — Update Planner (`internal/update/planner.go`)
```go
type UpdateRisk string
const (
    RiskLow    UpdateRisk = "low"
    RiskMedium UpdateRisk = "medium"
    RiskHigh   UpdateRisk = "high"
)

type UpdatePlan struct {
    Container      labels.ClassifiedContainer
    ImageStatus    ImageStatus
    Risk           UpdateRisk
    RiskReasons    []string
    BackupRequired bool
    PolicyAllowed  bool
    Steps          []string
}

func PlanUpdate(ctx context.Context, container labels.ClassifiedContainer, status ImageStatus, engine core.PolicyEngine) (*UpdatePlan, error)
```

Risk detection:
- HIGH: `:latest` tag, `db` role, no backup strategy, NAS-dependent
- MEDIUM: major version jump, `critical` priority
- LOW: minor/patch update, `stateless` role

### 7.3 — Update Executor (`internal/update/executor.go`)
```go
type UpdateResult struct {
    ContainerName string
    OldImage      string
    NewImage      string
    BackupPath    string
    Success       bool
    RolledBack    bool
    HealthCheckOK bool
    Error         string
    Duration      time.Duration
}

func (e *Executor) Execute(ctx context.Context, plan *UpdatePlan) (*UpdateResult, error)
```

Execution flow (STRICT ORDER):
1. **Policy check** — ask Policy Engine; abort if MSM active
2. **Backup** — run Backup Engine; abort if backup fails
3. **Pull new image**
4. **Stop old container** — record full config
5. **Rename old** → `<name>-hlc-rollback`
6. **Create new container** — same config, new image
7. **Start new container**
8. **Health check** — wait for healthy state
9. **On success**: remove old, publish `UpdateCompleted`
10. **On failure**: stop new → remove new → rename old → start old → publish `UpdateRolledBack`

### 7.4 — Stack-Level Update
```go
func (e *Executor) UpdateStack(ctx context.Context, stack stacks.StackInfo, plans []*UpdatePlan) ([]UpdateResult, error)
```
- Update in safe order: stateless first, databases last.
- Stop on first critical failure.

### 7.5 — API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/updates/check` | Check all containers |
| GET | `/api/v1/updates/check/:container` | Check specific container |
| POST | `/api/v1/updates/plan/:container` | Generate update plan |
| POST | `/api/v1/updates/execute/:container` | Execute update |
| POST | `/api/v1/stacks/:name/update` | Update entire stack |

### 7.6 — SQLite Migration
`003_updates.sql`:
```sql
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
    duration_ms    INTEGER NOT NULL,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Acceptance Criteria
- [ ] Registry digest comparison detects available updates
- [ ] Risk assessment flags `:latest`, DB roles, NAS-dependent containers
- [ ] Policy Engine blocks updates when MSM active
- [ ] Full update flow: backup → update → healthcheck works
- [ ] Rollback restores original container on failure
- [ ] Stack-level update respects dependency order
- [ ] Events published for each step
- [ ] `go test ./...` passes
