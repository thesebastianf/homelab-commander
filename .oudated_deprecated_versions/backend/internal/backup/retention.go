package backup

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"os"
	"time"
)

// PruneOldBackups deletes backup files (and DB records) older than retentionDays.
func PruneOldBackups(ctx context.Context, db *sql.DB, log *slog.Logger, retentionDays int) error {
	cutoff := time.Now().AddDate(0, 0, -retentionDays).UTC().Format(time.RFC3339)

	rows, err := db.QueryContext(ctx,
		`SELECT id, archive_path FROM backups WHERE created_at < ? AND restored = 0`, cutoff)
	if err != nil {
		return fmt.Errorf("prune query: %w", err)
	}
	defer rows.Close()

	type record struct {
		id   int64
		path string
	}
	var old []record
	for rows.Next() {
		var r record
		if err := rows.Scan(&r.id, &r.path); err != nil {
			return err
		}
		old = append(old, r)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	pruned := 0
	for _, r := range old {
		if err := os.Remove(r.path); err != nil && !os.IsNotExist(err) {
			log.Warn("prune: failed to delete archive", "path", r.path, "err", err)
			continue
		}
		if _, err := db.ExecContext(ctx, `DELETE FROM backups WHERE id = ?`, r.id); err != nil {
			log.Warn("prune: failed to delete DB record", "id", r.id, "err", err)
			continue
		}
		pruned++
	}

	log.Info("backup retention pruned", "pruned", pruned, "cutoff", cutoff)
	return nil
}
