---
mode: "agent"
description: "Implement Phase 5: NAS Gatekeeper — Mount condition checking, conditional startup, boot sequencer, scheduler"
tools: ["run_in_terminal", "create_file", "replace_string_in_file", "read_file", "grep_search", "file_search", "get_errors"]
---

# Phase 5 — NAS Gatekeeper & Scheduler

Solve the boot-order problem: stacks that depend on NAS mounts wait until mounts are verified before starting.

## Prerequisites
Phase 4 complete — Stack Manager and Label Intelligence working.

## Tasks

### 5.1 — Mount Checker (`internal/nas/checker.go`)
```go
type MountStatus string
const (
    MountHealthy  MountStatus = "healthy"
    MountDegraded MountStatus = "degraded" // path exists but anchor missing
    MountOffline  MountStatus = "offline"
)

type MountCheck struct {
    Path       string
    Status     MountStatus
    AnchorFile string    // e.g., ".hlc_ready"
    LastCheck  time.Time
    Error      string
}

type Checker struct {
    anchorFile string // configurable, default ".hlc_ready"
}

func NewChecker(anchorFile string) *Checker

// CheckMount verifies a single mount point:
// 1. os.Stat(path) — path exists?
// 2. Look for anchor file — mount fully ready?
// 3. Read test on anchor file — filesystem responsive?
func (c *Checker) CheckMount(ctx context.Context, path string) MountCheck

// CheckAll verifies all registered mount paths
func (c *Checker) CheckAll(ctx context.Context, paths []string) []MountCheck
```

Verification sequence:
1. `os.Stat(path)` — does the path exist?
2. `os.Stat(path + "/" + anchorFile)` — is the anchor file present?
3. `os.ReadFile(path + "/" + anchorFile)` — can we read from the mount?
4. If all pass → `MountHealthy`
5. If path exists but no anchor → `MountDegraded`
6. If path doesn't exist → `MountOffline`

### 5.2 — Mount Monitor (`internal/nas/monitor.go`)
```go
type Monitor struct {
    checker  *Checker
    eventBus core.EventBus
    paths    []string
    interval time.Duration
    statuses map[string]MountStatus // track previous to detect transitions
}

func NewMonitor(checker *Checker, bus core.EventBus, paths []string, interval time.Duration) *Monitor
func (m *Monitor) Start(ctx context.Context) // run in goroutine
func (m *Monitor) CurrentStatus() map[string]MountCheck
```

Events emitted:
- `MountReady` — mount transitioned from offline/degraded to healthy
- `MountLost` — mount transitioned from healthy to offline/degraded
- `MountDegraded` — mount exists but anchor file missing

### 5.3 — Boot Sequencer (`internal/nas/boot.go`)
```go
type BootSequencer struct {
    checker      *Checker
    stackOps     *stacks.Operator
    classifier   // needs label access
    eventBus     core.EventBus
    maxWait      time.Duration // max time to wait for mount, default 5 min
    pollInterval time.Duration // how often to check, default 10s
}

// BootAll runs at HLC startup:
// 1. Discover all stacks with hlc.wait_for_mount labels
// 2. Group by mount path dependency
// 3. Wait for each mount to become ready
// 4. Start stacks in startup_order, respecting mount readiness
// 5. Start non-NAS-dependent stacks immediately
func (b *BootSequencer) BootAll(ctx context.Context) error

// WaitForMount blocks until mount is ready or context cancelled
func (b *BootSequencer) WaitForMount(ctx context.Context, path string) error
```

Boot flow:
1. Classify all containers → identify NAS-dependent stacks
2. Start stacks with no mount conditions immediately
3. For NAS-dependent stacks: poll mounts every `pollInterval`
4. As each mount becomes ready → start waiting stacks in `startup_order`
5. If `maxWait` exceeded → log error, emit `MountTimeout` event, notify via Event Bus

### 5.4 — Scheduler (`internal/scheduler/scheduler.go`)
```go
type Job struct {
    ID       string
    Name     string
    Schedule string // cron expression
    Func     func(ctx context.Context) error
    Enabled  bool
}

type Scheduler struct {
    jobs     []Job
    eventBus core.EventBus
}

func NewScheduler(bus core.EventBus) *Scheduler
func (s *Scheduler) Register(job Job) error
func (s *Scheduler) Start(ctx context.Context)
func (s *Scheduler) Stop(ctx context.Context)
func (s *Scheduler) ListJobs() []Job
func (s *Scheduler) EnableJob(id string, enabled bool) error
```

Built-in jobs:
- Mount health check (every 60s in steady-state)
- Backup scheduler (per-container cron from `hlc.backup.schedule` label)
- Update check (daily or configurable)
- Stats collection (every 60s)
- Stale backup cleanup (daily)

Use a simple cron parser (5-field: min hour dom month dow). Implement manually or use a minimal Go cron library.

### 5.5 — API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/mounts` | List all tracked mounts with current status |
| GET | `/api/v1/mounts/:path` | Check specific mount (live check) |
| POST | `/api/v1/mounts/check` | Force check all mounts now |
| GET | `/api/v1/scheduler/jobs` | List all scheduled jobs |
| PUT | `/api/v1/scheduler/jobs/:id` | Enable/disable a job |

### 5.6 — Settings
Add to settings:
- `nas.anchor_file` — anchor filename, default `.hlc_ready`
- `nas.boot_timeout` — max wait for mounts during boot, default `300` (seconds)
- `nas.poll_interval_boot` — mount check interval during boot, default `10` (seconds)
- `nas.poll_interval_steady` — mount check interval in steady state, default `60` (seconds)

### 5.7 — Tests
- CheckMount with existing path + anchor file → healthy.
- CheckMount with existing path but no anchor → degraded.
- CheckMount with non-existent path → offline.
- Monitor emits MountReady when mount transitions to healthy.
- Monitor emits MountLost when mount transitions to offline.
- BootSequencer waits for mount, then starts stacks in order.
- Scheduler executes jobs on cron schedule.

## Acceptance Criteria
- [ ] Mount checker correctly detects healthy/degraded/offline mounts
- [ ] Monitor emits events on mount status transitions
- [ ] Boot sequencer waits for NAS, then starts stacks in order
- [ ] Stacks without mount conditions start immediately
- [ ] Scheduler runs periodic jobs on cron schedules
- [ ] API returns mount status and job listings
- [ ] `go test ./...` passes
