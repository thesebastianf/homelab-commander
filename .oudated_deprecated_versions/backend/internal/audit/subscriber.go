package audit

import (
	"context"
	"log/slog"
	"strings"

	"github.com/thesebastianf/hlc/internal/core"
)

// eventCategoryMap maps EventType prefixes to audit categories.
var eventCategoryMap = map[string]Category{
	"Container": CategoryContainer,
	"Stack":     CategoryStack,
	"Backup":    CategoryBackup,
	"Update":    CategoryUpdate,
	"Policy":    CategoryPolicy,
	"Mount":     CategoryMount,
	"Auth":      CategoryAuth,
	"System":    CategorySystem,
}

// Subscriber listens to the EventBus and writes audit entries automatically.
type Subscriber struct {
	logger *Logger
	log    *slog.Logger
}

// NewSubscriber creates a Subscriber ready to be registered on the EventBus.
func NewSubscriber(logger *Logger, log *slog.Logger) *Subscriber {
	return &Subscriber{logger: logger, log: log}
}

// RegisterAll subscribes to all known event types on the bus.
func (s *Subscriber) RegisterAll(bus core.EventBus) {
	eventTypes := []core.EventType{
		core.ContainerStarted, core.ContainerStopped, core.ContainerRestarted,
		core.ContainerUnhealthy, core.ContainerDied,
		core.StackStarted, core.StackStopped, core.StackRestarted,
		core.BackupStarted, core.BackupCompleted, core.BackupFailed,
		core.RestoreStarted, core.RestoreCompleted, core.RestoreFailed,
		core.UpdateStarted, core.UpdateCompleted, core.UpdateFailed, core.UpdateRolledBack,
		core.MountReady, core.MountLost, core.MountDegraded, core.MountTimeout,
		core.PolicyChanged, core.PolicyEvaluated, core.PolicyActivated, core.PolicyDeactivated,
		core.SystemSafeMode, core.AuthFailure,
	}
	for _, et := range eventTypes {
		et := et
		bus.Subscribe(et, func(ctx context.Context, e core.Event) {
			s.handle(ctx, e)
		})
	}
}

func (s *Subscriber) handle(ctx context.Context, e core.Event) {
	category := inferCategory(string(e.Type))
	entry := Entry{
		EventType: string(e.Type),
		Category:  category,
		Target:    e.Source,
	}
	if err := s.logger.Log(ctx, entry); err != nil {
		s.log.Warn("audit subscriber: log failed", "event", e.Type, "err", err)
	}
}

func inferCategory(eventType string) Category {
	for prefix, cat := range eventCategoryMap {
		if strings.HasPrefix(eventType, prefix) {
			return cat
		}
	}
	return CategorySystem
}
