---
mode: "agent"
description: "Implement Phase 8: Observability — CPU/RAM stats, restart counts, uptime, mount health, SQLite history"
tools: ["run_in_terminal", "create_file", "replace_string_in_file", "read_file", "grep_search", "file_search", "get_errors"]
---

# Phase 8 — Observability Lite

Lightweight monitoring — no Prometheus needed. Enough to know what's happening.

## Prerequisites
Phase 7 complete.

## Tasks

### 8.1 — Stats Collector (`internal/observability/stats.go`)
```go
type ContainerStats struct {
    ContainerID   string
    ContainerName string
    CPUPercent    float64
    MemoryUsage   int64
    MemoryLimit   int64
    MemoryPercent float64
    RestartCount  int
    Uptime        time.Duration
    CollectedAt   time.Time
}

func CollectStats(ctx context.Context, dockerClient *docker.Client, containerID string) (*ContainerStats, error)
func CollectAllStats(ctx context.Context, dockerClient *docker.Client) ([]ContainerStats, error)
```
- Docker `GET /containers/{id}/stats?stream=false` for snapshots.
- Calculate CPU % from `cpu_stats` delta.

### 8.2 — Mount Health in Stats
```go
type SystemStats struct {
    Containers []ContainerStats
    Mounts     []nas.MountCheck
    CollectedAt time.Time
}

func CollectSystemStats(ctx context.Context, dockerClient *docker.Client, mountChecker *nas.Checker, mountPaths []string) (*SystemStats, error)
```

### 8.3 — History Storage
Migration `004_stats.sql`:
```sql
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

CREATE INDEX idx_stats_container ON stats_history(container_id, collected_at);
```

### 8.4 — API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/stats` | Current stats for all containers + mounts |
| GET | `/api/v1/stats/:container` | Current stats for one container |
| GET | `/api/v1/stats/:container/history` | Historical stats (last 24h) |

### 8.5 — Event Bus Integration
- Publish `StatsCollected` after each cycle.
- Subscribe to `ContainerDied` — log final stats.

## Acceptance Criteria
- [ ] CPU/RAM stats collected from Docker API
- [ ] Mount health included in system stats
- [ ] History stored in SQLite with automatic pruning
- [ ] API returns current and historical stats
- [ ] `go test ./...` passes
