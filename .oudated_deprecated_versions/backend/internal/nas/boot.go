package nas

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"time"

	"github.com/thesebastianf/hlc/internal/labels"
	"github.com/thesebastianf/hlc/internal/stacks"
)

// BootSequencer starts NAS-dependent stacks in priority order after mounts are ready.
type BootSequencer struct {
	checker  *Checker
	operator *stacks.Operator
	log      *slog.Logger
	timeout  time.Duration
}

// NewBootSequencer creates a BootSequencer.
func NewBootSequencer(checker *Checker, operator *stacks.Operator, log *slog.Logger, timeout time.Duration) *BootSequencer {
	if timeout == 0 {
		timeout = 5 * time.Minute
	}
	return &BootSequencer{
		checker:  checker,
		operator: operator,
		log:      log,
		timeout:  timeout,
	}
}

// BootAll discovers stacks, waits for all required mounts, then starts stacks in order.
func (b *BootSequencer) BootAll(ctx context.Context, containers []labels.ClassifiedContainer) error {
	sdx := labels.FilterNASDependent(containers)
	if len(sdx) == 0 {
		b.log.Info("boot sequencer: no NAS-dependent containers")
		return nil
	}

	// Collect unique required mounts.
	mountSet := make(map[string]struct{})
	for _, c := range sdx {
		for _, m := range c.Classification.WaitForMounts {
			mountSet[m] = struct{}{}
		}
	}

	// Wait for each mount with timeout.
	deadline := time.Now().Add(b.timeout)
	for mount := range mountSet {
		if err := b.waitMount(ctx, mount, deadline); err != nil {
			return fmt.Errorf("boot sequencer: %w", err)
		}
	}

	// Sort by startup order.
	sorted := make([]labels.ClassifiedContainer, len(sdx))
	copy(sorted, sdx)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].Classification.StartupOrder < sorted[j].Classification.StartupOrder
	})

	// Start each stack that owns the container.
	started := make(map[string]bool)
	for _, c := range sorted {
		stackName := c.Classification.Stack
		if stackName == "" {
			continue
		}
		if started[stackName] {
			continue
		}
		b.log.Info("boot sequencer: starting stack", "stack", stackName, "order", c.Classification.StartupOrder)
		if err := b.operator.Up(ctx, stackName); err != nil {
			b.log.Error("boot sequencer: stack start failed", "stack", stackName, "err", err)
			// Log and continue — don't stop other stacks.
		}
		started[stackName] = true
	}
	return nil
}

func (b *BootSequencer) waitMount(ctx context.Context, mountPath string, deadline time.Time) error {
	for {
		mc := b.checker.CheckMount(ctx, mountPath)
		if mc.Status == MountHealthy {
			b.log.Info("boot sequencer: mount ready", "path", mountPath)
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("mount %q timed out: %s", mountPath, mc.Reason)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(5 * time.Second):
		}
	}
}
