// Package backup implements volume backup, DB dumps, restore, and retention.
package backup

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	"github.com/thesebastianf/hlc/internal/core"
	"github.com/thesebastianf/hlc/internal/docker"
	"github.com/thesebastianf/hlc/internal/labels"
)

// Executor performs container backups.
type Executor struct {
	docker  *docker.Client
	db      *sql.DB
	backupDir string
	bus     core.EventBus
	log     *slog.Logger
}

// NewExecutor creates a new backup Executor.
func NewExecutor(dc *docker.Client, db *sql.DB, backupDir string, bus core.EventBus, log *slog.Logger) *Executor {
	return &Executor{
		docker:    dc,
		db:        db,
		backupDir: backupDir,
		bus:       bus,
		log:       log,
	}
}

// BackupContainer performs a backup for a classified container.
// Selects strategy based on hlc.backup.strategy label:
//   - "none":    skips
//   - "db-dump": runs the appropriate database dump command
//   - "full":    tar/gzip all declared volume paths
func (e *Executor) BackupContainer(ctx context.Context, c labels.ClassifiedContainer) (*Metadata, error) {
	if c.Classification.BackupStrategy == "none" {
		return nil, nil
	}

	e.bus.Publish(ctx, core.Event{Type: core.BackupStarted, Source: c.Name})

	dest, err := e.prepareDestDir(c.Name)
	if err != nil {
		return nil, err
	}

	var archivePath string
	switch c.Classification.BackupStrategy {
	case "db-dump":
		archivePath, err = dbDump(ctx, e.docker, c.ID, c.Classification.DBType, dest, c.Name)
	default: // "full"
		mounts, merr := DetectMounts(ctx, e.docker, c.ID)
		if merr != nil {
			return nil, fmt.Errorf("detect mounts %s: %w", c.Name, merr)
		}
		archivePath, err = tarGzip(mounts, dest, c.Name)
	}
	if err != nil {
		e.bus.Publish(ctx, core.Event{Type: core.BackupFailed, Source: c.Name, Payload: map[string]string{"error": err.Error()}})
		return nil, fmt.Errorf("backup %s: %w", c.Name, err)
	}

	checksum, err := sha256File(archivePath)
	if err != nil {
		return nil, err
	}

	meta := &Metadata{
		ContainerID:   c.ID,
		ContainerName: c.Name,
		Strategy:      c.Classification.BackupStrategy,
		ArchivePath:   archivePath,
		Checksum:      checksum,
		CreatedAt:     time.Now(),
	}
	if err := SaveMetadata(ctx, e.db, meta); err != nil {
		e.log.Error("backup metadata save failed", "container", c.Name, "err", err)
	}
	e.bus.Publish(ctx, core.Event{Type: core.BackupCompleted, Source: c.Name, Payload: map[string]string{"path": archivePath}})
	return meta, nil
}

// prepareDestDir creates a timestamped directory for this container's backup.
func (e *Executor) prepareDestDir(name string) (string, error) {
	ts := time.Now().Format("20060102T150405")
	dir := filepath.Join(e.backupDir, name, ts)
	return dir, os.MkdirAll(dir, 0o755)
}

// sha256File computes the SHA-256 checksum of a file.
func sha256File(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", fmt.Errorf("checksum open %s: %w", path, err)
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", fmt.Errorf("checksum read %s: %w", path, err)
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
