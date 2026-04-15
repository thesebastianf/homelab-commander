package backup

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// Metadata holds information about a completed backup.
type Metadata struct {
	ID            int64
	ContainerID   string
	ContainerName string
	Strategy      string
	ArchivePath   string
	Checksum      string
	CreatedAt     time.Time
	Restored      bool
}

// SaveMetadata persists backup metadata to SQLite.
func SaveMetadata(ctx context.Context, db *sql.DB, m *Metadata) error {
	const q = `
		INSERT INTO backups (container_id, container_name, strategy, archive_path, checksum, created_at)
		VALUES (?, ?, ?, ?, ?, ?)`
	res, err := db.ExecContext(ctx, q, m.ContainerID, m.ContainerName, m.Strategy, m.ArchivePath, m.Checksum, m.CreatedAt.UTC().Format(time.RFC3339))
	if err != nil {
		return fmt.Errorf("save backup metadata: %w", err)
	}
	m.ID, _ = res.LastInsertId()
	return nil
}

// LoadMetadata retrieves all backups for a container (newest first).
func LoadMetadata(ctx context.Context, db *sql.DB, containerName string) ([]Metadata, error) {
	const q = `
		SELECT id, container_id, container_name, strategy, archive_path, checksum, created_at, restored
		FROM backups
		WHERE container_name = ?
		ORDER BY created_at DESC`
	rows, err := db.QueryContext(ctx, q, containerName)
	if err != nil {
		return nil, fmt.Errorf("load backup metadata: %w", err)
	}
	defer rows.Close()

	var results []Metadata
	for rows.Next() {
		var m Metadata
		var createdAt string
		if err := rows.Scan(&m.ID, &m.ContainerID, &m.ContainerName, &m.Strategy, &m.ArchivePath, &m.Checksum, &createdAt, &m.Restored); err != nil {
			return nil, err
		}
		m.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
		results = append(results, m)
	}
	return results, rows.Err()
}

// ListAllMetadata retrieves all backups (newest first), optionally limited.
func ListAllMetadata(ctx context.Context, db *sql.DB, limit int) ([]Metadata, error) {
	if limit <= 0 {
		limit = 50
	}
	const q = `
		SELECT id, container_id, container_name, strategy, archive_path, checksum, created_at, restored
		FROM backups
		ORDER BY created_at DESC
		LIMIT ?`
	rows, err := db.QueryContext(ctx, q, limit)
	if err != nil {
		return nil, fmt.Errorf("list backups: %w", err)
	}
	defer rows.Close()

	var results []Metadata
	for rows.Next() {
		var m Metadata
		var createdAt string
		if err := rows.Scan(&m.ID, &m.ContainerID, &m.ContainerName, &m.Strategy, &m.ArchivePath, &m.Checksum, &createdAt, &m.Restored); err != nil {
			return nil, err
		}
		m.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
		results = append(results, m)
	}
	return results, rows.Err()
}

// MarkRestored marks a backup record as restored.
func MarkRestored(ctx context.Context, db *sql.DB, backupID int64) error {
	_, err := db.ExecContext(ctx, `UPDATE backups SET restored = 1 WHERE id = ?`, backupID)
	return err
}
