---
mode: "agent"
description: "Implement Phase 3: Label Intelligence — Parse hlc.* labels including NAS/startup labels, classify containers"
tools: ["run_in_terminal", "create_file", "replace_string_in_file", "read_file", "grep_search", "file_search", "get_errors"]
---

# Phase 3 — Label Intelligence System

Parse `hlc.*` Docker labels to classify containers, detect NAS dependencies, and drive automated behavior.

## Prerequisites
Phase 2 complete — Docker client, Event Bus, and Policy Engine working.

## Tasks

### 3.1 — Label Schema Definition (V2)

| Label | Values | Default | Description |
|-------|--------|---------|-------------|
| `hlc.role` | `db`, `stateless`, `cache`, `proxy`, `app` | `app` | Container's functional role |
| `hlc.update.policy` | `auto`, `manual`, `pin` | `manual` | How updates are handled |
| `hlc.update.schedule` | cron expression | — | When auto-updates run |
| `hlc.backup.strategy` | `full`, `db-dump`, `none` | `none` | Backup approach |
| `hlc.backup.stop` | `true`, `false` | `false` | Stop container before backup |
| `hlc.backup.db-type` | `postgres`, `mariadb`, `mysql`, `redis` | — | DB type for dump |
| `hlc.stack` | string | — | Logical stack grouping |
| `hlc.priority` | `critical`, `normal`, `low` | `normal` | Operational priority |
| `hlc.wait_for_mount` | path or comma-separated paths | — | Mount(s) that must be ready before start |
| `hlc.startup.order` | integer | `50` | Boot sequence order within stack (lower = first) |
| `hlc.homepage.url` | URL | — | Link to this service's web UI |

### 3.2 — Label Parser (`internal/labels/parser.go`)
```go
type ContainerClassification struct {
    Role            string
    UpdatePolicy    string
    UpdateSchedule  string
    BackupStrategy  string
    BackupStop      bool
    DBType          string
    Stack           string
    Priority        string
    WaitForMounts   []string  // NEW: paths that must be ready
    StartupOrder    int       // NEW: boot sequence order
    HomepageURL     string    // NEW: link to service UI
    RawLabels       map[string]string
}

func Parse(labels map[string]string) ContainerClassification
func (c ContainerClassification) Validate() []string
func (c ContainerClassification) HasMountConditions() bool
func (c ContainerClassification) NeedsDatabaseDump() bool
```
- Filter only `hlc.*` prefixed labels.
- Parse `hlc.wait_for_mount` as comma-separated list of paths.
- Apply sensible defaults.
- Validate: warn on unknown labels, invalid enum values, missing db-type when strategy is db-dump.

### 3.3 — Classification Engine (`internal/labels/classifier.go`)
```go
type ClassifiedContainer struct {
    docker.Container
    Classification ContainerClassification
}

func ClassifyAll(containers []docker.Container) []ClassifiedContainer
func GroupByStack(classified []ClassifiedContainer) map[string][]ClassifiedContainer
func FilterByRole(classified []ClassifiedContainer, role string) []ClassifiedContainer
func FilterNASDependent(classified []ClassifiedContainer) []ClassifiedContainer
func SortByStartupOrder(classified []ClassifiedContainer) []ClassifiedContainer
```

### 3.4 — API Endpoint
Add `GET /api/v1/containers` returning classified containers:
```json
[{
    "id": "abc123",
    "name": "jellyfin",
    "state": "running",
    "classification": {
        "role": "app",
        "update_policy": "safe",
        "backup_strategy": "full",
        "stack": "media-stack",
        "wait_for_mounts": ["/mnt/nas/media"],
        "startup_order": 30,
        "homepage_url": "http://jellyfin.local:8096"
    }
}]
```

### 3.5 — Tests
- Parse labels with all fields set.
- Parse labels with missing fields (defaults applied).
- Parse labels with invalid values (warnings returned).
- Parse `wait_for_mount` with single path and comma-separated paths.
- GroupByStack with multiple stacks.
- SortByStartupOrder correctness.
- FilterNASDependent returns only containers with mount conditions.

## Acceptance Criteria
- [ ] Labels parsed correctly with defaults and validation
- [ ] New V2 labels (wait_for_mount, startup.order, homepage.url) work
- [ ] Containers classified and groupable by stack/role
- [ ] NAS-dependent containers identifiable
- [ ] API returns classified container list
- [ ] `go test ./...` passes
