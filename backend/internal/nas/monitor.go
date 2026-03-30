package nas

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/thesebastianf/hlc/internal/core"
)

// Monitor watches mount points and emits events on state transitions.
type Monitor struct {
	checker  *Checker
	mounts   []string
	interval time.Duration
	bus      core.EventBus
	log      *slog.Logger

	mu    sync.Mutex
	state map[string]MountStatus
}

// NewMonitor creates a Monitor that polls mounts at the given interval.
func NewMonitor(checker *Checker, mounts []string, interval time.Duration, bus core.EventBus, log *slog.Logger) *Monitor {
	return &Monitor{
		checker:  checker,
		mounts:   mounts,
		interval: interval,
		bus:      bus,
		log:      log,
		state:    make(map[string]MountStatus),
	}
}

// Start begins polling in the background until ctx is cancelled.
func (m *Monitor) Start(ctx context.Context) {
	go m.loop(ctx)
}

// CurrentStatus returns the last known status for a mount path.
func (m *Monitor) CurrentStatus(path string) MountStatus {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.state[path]
	if !ok {
		return MountOffline
	}
	return s
}

func (m *Monitor) loop(ctx context.Context) {
	// Run immediately, then on interval.
	m.check(ctx)
	ticker := time.NewTicker(m.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.check(ctx)
		}
	}
}

func (m *Monitor) check(ctx context.Context) {
	for _, path := range m.mounts {
		result := m.checker.CheckMount(ctx, path)
		m.transition(ctx, path, result)
	}
}

func (m *Monitor) transition(ctx context.Context, path string, result MountCheck) {
	m.mu.Lock()
	prev, hasPrev := m.state[path]
	m.state[path] = result.Status
	m.mu.Unlock()

	if !hasPrev || prev != result.Status {
		m.log.Info("mount status changed",
			"path", path,
			"previous", prev,
			"current", result.Status,
			"reason", result.Reason,
		)
		evt := core.Event{
			Source:  path,
			Payload: map[string]string{"path": path, "status": string(result.Status), "reason": result.Reason},
		}
		switch result.Status {
		case MountHealthy:
			evt.Type = core.MountReady
		case MountDegraded:
			evt.Type = core.MountDegraded
		case MountOffline:
			evt.Type = core.MountLost
		}
		m.bus.Publish(ctx, evt)
	}
}
