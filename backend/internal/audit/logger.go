// Package audit provides a persistent event log backed by SQLite.
package audit

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// Category classifies an audit event.
type Category string

const (
	CategoryContainer Category = "container"
	CategoryStack     Category = "stack"
	CategoryBackup    Category = "backup"
	CategoryUpdate    Category = "update"
	CategoryPolicy    Category = "policy"
	CategoryMount     Category = "mount"
	CategoryAuth      Category = "auth"
	CategorySystem    Category = "system"
)

// Entry is a row in the audit_log table.
type Entry struct {
	ID         int64
	EventType  string
	Category   Category
	Target     string
	Detail     string
	ActorIP    string
	OccurredAt time.Time
}

// Filter allows querying audit entries.
type Filter struct {
	Category Category
	Target   string
	Since    time.Time
	Limit    int
}

// Logger records audit events to SQLite.
type Logger struct {
	db *sql.DB
}

// NewLogger creates a Logger backed by the given DB.
func NewLogger(db *sql.DB) *Logger {
	return &Logger{db: db}
}

// Log persists an audit entry.
func (l *Logger) Log(ctx context.Context, e Entry) error {
	if e.OccurredAt.IsZero() {
		e.OccurredAt = time.Now()
	}
	_, err := l.db.ExecContext(ctx,
		`INSERT INTO audit_log (event_type, category, target, detail, actor_ip, occurred_at)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		e.EventType, string(e.Category), e.Target, e.Detail, e.ActorIP,
		e.OccurredAt.UTC().Format(time.RFC3339),
	)
	if err != nil {
		return fmt.Errorf("audit log: %w", err)
	}
	return nil
}

// Query retrieves audit entries matching the filter.
func (l *Logger) Query(ctx context.Context, f Filter) ([]Entry, error) {
	if f.Limit <= 0 {
		f.Limit = 100
	}

	q := `SELECT id, event_type, category, target, detail, actor_ip, occurred_at
	      FROM audit_log WHERE 1=1`
	args := []interface{}{}

	if f.Category != "" {
		q += " AND category = ?"
		args = append(args, string(f.Category))
	}
	if f.Target != "" {
		q += " AND target = ?"
		args = append(args, f.Target)
	}
	if !f.Since.IsZero() {
		q += " AND occurred_at >= ?"
		args = append(args, f.Since.UTC().Format(time.RFC3339))
	}
	q += " ORDER BY occurred_at DESC LIMIT ?"
	args = append(args, f.Limit)

	rows, err := l.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("audit query: %w", err)
	}
	defer rows.Close()

	var entries []Entry
	for rows.Next() {
		var e Entry
		var ts string
		if err := rows.Scan(&e.ID, &e.EventType, &e.Category, &e.Target, &e.Detail, &e.ActorIP, &ts); err != nil {
			return nil, err
		}
		e.OccurredAt, _ = time.Parse(time.RFC3339, ts)
		entries = append(entries, e)
	}
	return entries, rows.Err()
}
