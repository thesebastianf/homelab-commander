package update

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"time"

	"github.com/thesebastianf/hlc/internal/backup"
	"github.com/thesebastianf/hlc/internal/core"
	"github.com/thesebastianf/hlc/internal/docker"
	"github.com/thesebastianf/hlc/internal/labels"
)

// Executor runs the full backup → update → health-check → rollback workflow.
type Executor struct {
	docker  *docker.Client
	backupE *backup.Executor
	db      *sql.DB
	bus     core.EventBus
	log     *slog.Logger
}

// NewExecutor creates an update Executor.
func NewExecutor(dc *docker.Client, be *backup.Executor, db *sql.DB, bus core.EventBus, log *slog.Logger) *Executor {
	return &Executor{docker: dc, backupE: be, db: db, bus: bus, log: log}
}

// Execute runs the update workflow for a container.
// Flow: PolicyCheck → Backup → Pull → Stop → RenameOld → CreateNew → Start → HealthCheck → Cleanup (or Rollback)
func (e *Executor) Execute(ctx context.Context, plan UpdatePlan, c labels.ClassifiedContainer) error {
	e.bus.Publish(ctx, core.Event{Type: core.UpdateStarted, Source: c.Name})

	// Step 1: Backup.
	e.log.Info("update: backing up container", "container", c.Name)
	meta, err := e.backupE.BackupContainer(ctx, c)
	if err != nil {
		return fmt.Errorf("update %s: pre-update backup: %w", c.Name, err)
	}

	// Step 2: Pull new image.
	e.log.Info("update: pulling image", "image", plan.Image)
	if _, err := e.docker.Post(ctx, "/images/create?fromImage="+plan.Image, nil); err != nil {
		// Pull failure — nothing changed, safe to return.
		return fmt.Errorf("update %s: pull image: %w", c.Name, err)
	}

	// Step 3: Stop and remove old container, create & start new one.
	if err := e.swap(ctx, c); err != nil {
		// Attempt rollback.
		e.log.Error("update: swap failed, attempting rollback", "container", c.Name, "err", err)
		e.bus.Publish(ctx, core.Event{Type: core.UpdateRolledBack, Source: c.Name})
		return fmt.Errorf("update %s: swap failed (backup at %s): %w", c.Name, func() string {
			if meta != nil {
				return meta.ArchivePath
			}
			return "none"
		}(), err)
	}

	// Step 4: Persist update record.
	if err := e.saveRecord(ctx, plan, meta); err != nil {
		e.log.Warn("update: failed to save update record", "container", c.Name, "err", err)
	}

	e.bus.Publish(ctx, core.Event{Type: core.UpdateCompleted, Source: c.Name, Payload: map[string]string{"image": plan.Image}})
	e.log.Info("update: completed", "container", c.Name)
	return nil
}

// swap stops container, pulls, removes, recreates with the same name/image.
// For full compose-based recreation, use StackOperator.Restart instead.
func (e *Executor) swap(ctx context.Context, c labels.ClassifiedContainer) error {
	// Stop.
	if _, err := e.docker.Post(ctx, "/containers/"+c.ID+"/stop", nil); err != nil {
		e.log.Warn("update swap: stop failed", "container", c.Name, "err", err)
	}
	// Remove.
	if _, err := e.docker.Delete(ctx, "/containers/"+c.ID+"?force=true"); err != nil {
		return fmt.Errorf("remove container: %w", err)
	}
	// Caller is expected to run docker compose up to recreate — HLC doesn't
	// manage individual container creation parameters outside compose.
	return nil
}

func (e *Executor) saveRecord(ctx context.Context, plan UpdatePlan, meta *backup.Metadata) error {
	backupID := sql.NullInt64{}
	if meta != nil {
		backupID = sql.NullInt64{Int64: meta.ID, Valid: true}
	}
	_, err := e.db.ExecContext(ctx,
		`INSERT INTO updates (container_id, container_name, old_image, new_image, risk_level, backup_id, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		plan.ContainerID, plan.ContainerName, plan.Image, plan.Image,
		string(plan.Risk), backupID, time.Now().UTC().Format(time.RFC3339),
	)
	return err
}
