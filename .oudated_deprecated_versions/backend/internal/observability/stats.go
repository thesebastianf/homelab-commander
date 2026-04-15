// Package observability collects CPU/RAM stats and restart counts.
package observability

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/thesebastianf/hlc/internal/core"
	"github.com/thesebastianf/hlc/internal/docker"
)

// Snapshot is a point-in-time resource usage reading for a container.
type Snapshot struct {
	ContainerID   string
	ContainerName string
	CPUPercent    float64
	MemUsageBytes int64
	MemLimitBytes int64
	MemPercent    float64
	RestartCount  int
	CollectedAt   time.Time
}

// Collector gathers container stats on a scheduled basis.
type Collector struct {
	docker *docker.Client
	db     *sql.DB
	bus    core.EventBus
	log    *slog.Logger
}

// NewCollector creates a stats Collector.
func NewCollector(dc *docker.Client, db *sql.DB, bus core.EventBus, log *slog.Logger) *Collector {
	return &Collector{docker: dc, db: db, bus: bus, log: log}
}

// CollectAll gathers a snapshot for every running container.
func (c *Collector) CollectAll(ctx context.Context) error {
	containers, err := c.docker.ListContainers(ctx)
	if err != nil {
		return fmt.Errorf("collect stats: list containers: %w", err)
	}

	for _, cont := range containers {
		if cont.State != "running" {
			continue
		}
		snap, err := c.collect(ctx, cont.ID, cont.Name)
		if err != nil {
			c.log.Warn("stats collect failed", "container", cont.Name, "err", err)
			continue
		}
		if err := c.persist(ctx, snap); err != nil {
			c.log.Warn("stats persist failed", "container", cont.Name, "err", err)
		}
		c.bus.Publish(ctx, core.Event{
			Type:    core.StatsCollected,
			Source:  cont.Name,
			Payload: map[string]string{"container": cont.Name},
		})
	}
	return nil
}

// collect fetches a single non-streaming stats response from Docker.
func (c *Collector) collect(ctx context.Context, containerID, containerName string) (*Snapshot, error) {
	data, err := c.docker.Get(ctx, "/containers/"+containerID+"/stats?stream=false")
	if err != nil {
		return nil, fmt.Errorf("stats %s: %w", containerName, err)
	}

	var raw dockerStats
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("stats parse %s: %w", containerName, err)
	}

	cpuPercent := calcCPUPercent(raw)
	memUsage := raw.MemoryStats.Usage
	memLimit := raw.MemoryStats.Limit
	memPercent := 0.0
	if memLimit > 0 {
		memPercent = float64(memUsage) / float64(memLimit) * 100.0
	}

	return &Snapshot{
		ContainerID:   containerID,
		ContainerName: containerName,
		CPUPercent:    cpuPercent,
		MemUsageBytes: memUsage,
		MemLimitBytes: memLimit,
		MemPercent:    memPercent,
		CollectedAt:   time.Now(),
	}, nil
}

// persist saves a snapshot into SQLite stats_history.
func (c *Collector) persist(ctx context.Context, s *Snapshot) error {
	_, err := c.db.ExecContext(ctx,
		`INSERT INTO stats_history (container_id, container_name, cpu_percent, mem_usage_bytes, mem_limit_bytes, mem_percent, collected_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		s.ContainerID, s.ContainerName, s.CPUPercent, s.MemUsageBytes, s.MemLimitBytes, s.MemPercent,
		s.CollectedAt.UTC().Format(time.RFC3339),
	)
	return err
}

// GetHistory returns recent snapshots for a container.
func (c *Collector) GetHistory(ctx context.Context, containerName string, limit int) ([]Snapshot, error) {
	if limit <= 0 {
		limit = 60
	}
	rows, err := c.db.QueryContext(ctx,
		`SELECT container_id, container_name, cpu_percent, mem_usage_bytes, mem_limit_bytes, mem_percent, collected_at
		 FROM stats_history WHERE container_name = ? ORDER BY collected_at DESC LIMIT ?`,
		containerName, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var snaps []Snapshot
	for rows.Next() {
		var s Snapshot
		var ts string
		if err := rows.Scan(&s.ContainerID, &s.ContainerName, &s.CPUPercent, &s.MemUsageBytes, &s.MemLimitBytes, &s.MemPercent, &ts); err != nil {
			return nil, err
		}
		s.CollectedAt, _ = time.Parse(time.RFC3339, ts)
		snaps = append(snaps, s)
	}
	return snaps, rows.Err()
}

// Docker Engine stats response structures (minimal subset).
type dockerStats struct {
	CPUStats    cpuStats    `json:"cpu_stats"`
	PreCPUStats cpuStats    `json:"precpu_stats"`
	MemoryStats memoryStats `json:"memory_stats"`
}

type cpuStats struct {
	CPUUsage    cpuUsage `json:"cpu_usage"`
	SystemUsage int64    `json:"system_cpu_usage"`
	OnlineCPUs  int      `json:"online_cpus"`
}

type cpuUsage struct {
	TotalUsage int64 `json:"total_usage"`
}

type memoryStats struct {
	Usage int64 `json:"usage"`
	Limit int64 `json:"limit"`
}

// calcCPUPercent computes CPU percentage using the delta method from Docker's own CLI.
func calcCPUPercent(stats dockerStats) float64 {
	cpuDelta := float64(stats.CPUStats.CPUUsage.TotalUsage - stats.PreCPUStats.CPUUsage.TotalUsage)
	sysDelta := float64(stats.CPUStats.SystemUsage - stats.PreCPUStats.SystemUsage)
	numCPU := float64(stats.CPUStats.OnlineCPUs)
	if numCPU == 0 {
		numCPU = 1
	}
	if sysDelta <= 0 || cpuDelta < 0 {
		return 0.0
	}
	return (cpuDelta / sysDelta) * numCPU * 100.0
}
