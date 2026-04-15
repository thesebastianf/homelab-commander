// Package scheduler provides a simple cron-like task scheduler.
package scheduler

import (
	"context"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Job is a registered periodic task.
type Job struct {
	ID       string
	Schedule string // cron expression (5 fields: min hour dom mon dow)
	Handler  func(ctx context.Context)
	next     time.Time
}

// Scheduler runs registered jobs at their scheduled times.
type Scheduler struct {
	mu   sync.Mutex
	jobs []*Job
	log  *slog.Logger
}

// New creates a new Scheduler.
func New(log *slog.Logger) *Scheduler {
	return &Scheduler{log: log}
}

// Register adds a new job. Returns an error if the cron expression is invalid.
func (s *Scheduler) Register(id, cronExpr string, handler func(ctx context.Context)) error {
	next, err := nextTick(cronExpr, time.Now())
	if err != nil {
		return fmt.Errorf("invalid cron expression %q: %w", cronExpr, err)
	}
	s.mu.Lock()
	s.jobs = append(s.jobs, &Job{
		ID:       id,
		Schedule: cronExpr,
		Handler:  handler,
		next:     next,
	})
	s.mu.Unlock()
	return nil
}

// Start runs the scheduling loop until ctx is cancelled.
func (s *Scheduler) Start(ctx context.Context) {
	go s.loop(ctx)
}

// ListJobs returns a snapshot of all registered jobs.
func (s *Scheduler) ListJobs() []Job {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]Job, len(s.jobs))
	for i, j := range s.jobs {
		out[i] = *j
	}
	return out
}

func (s *Scheduler) loop(ctx context.Context) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			s.tick(ctx, now)
		}
	}
}

func (s *Scheduler) tick(ctx context.Context, now time.Time) {
	s.mu.Lock()
	due := make([]*Job, 0)
	for _, j := range s.jobs {
		if !now.Before(j.next) {
			due = append(due, j)
		}
	}
	s.mu.Unlock()

	for _, j := range due {
		j := j
		s.log.Info("scheduler: running job", "id", j.ID)
		go j.Handler(ctx)
		// Compute next tick.
		s.mu.Lock()
		next, err := nextTick(j.Schedule, now.Add(time.Minute))
		if err == nil {
			j.next = next
		}
		s.mu.Unlock()
	}
}

// nextTick returns the next time a cron expression fires after `from`.
// Supports 5-field cron: min hour dom mon dow.
// For simplicity: wildcard "*" and literal values only (no ranges/lists in this impl).
func nextTick(expr string, from time.Time) (time.Time, error) {
	fields := strings.Fields(expr)
	if len(fields) != 5 {
		return time.Time{}, fmt.Errorf("expected 5 fields, got %d", len(fields))
	}

	// Scan forward minute-by-minute from start (truncated to minute).
	t := from.Truncate(time.Minute).Add(time.Minute)
	// Safety: scan at most 1 year forward.
	limit := from.Add(365 * 24 * time.Hour)

	for t.Before(limit) {
		if matchField(fields[0], t.Minute()) &&
			matchField(fields[1], t.Hour()) &&
			matchField(fields[2], t.Day()) &&
			matchField(fields[3], int(t.Month())) &&
			matchField(fields[4], int(t.Weekday())) {
			return t, nil
		}
		t = t.Add(time.Minute)
	}
	return time.Time{}, fmt.Errorf("no valid time within a year for %q", expr)
}

func matchField(field string, value int) bool {
	if field == "*" {
		return true
	}
	n, err := strconv.Atoi(field)
	if err != nil {
		return false
	}
	return n == value
}
