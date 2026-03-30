package envhub

import (
	"context"
	"database/sql"
	"fmt"
)

// EnvVar is a global environment variable stored in the hub.
type EnvVar struct {
	Key      string
	Value    string
	Category string // "system", "credentials", "custom"
}

// Store provides CRUD access to global env vars.
type Store interface {
	Get(ctx context.Context, key string) (*EnvVar, error)
	Set(ctx context.Context, key, value, category string) error
	Delete(ctx context.Context, key string) error
	List(ctx context.Context) ([]EnvVar, error)
	ListByCategory(ctx context.Context, category string) ([]EnvVar, error)
}

// sqlStore is the SQLite-backed Store implementation.
type sqlStore struct {
	db *sql.DB
}

// NewStore creates a new SQLite-backed env store.
func NewStore(db *sql.DB) Store {
	return &sqlStore{db: db}
}

func (s *sqlStore) Get(ctx context.Context, key string) (*EnvVar, error) {
	var e EnvVar
	err := s.db.QueryRowContext(ctx,
		`SELECT key, value, category FROM global_envs WHERE key = ?`, key).
		Scan(&e.Key, &e.Value, &e.Category)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("env key %q not found", key)
	}
	if err != nil {
		return nil, fmt.Errorf("get env %q: %w", key, err)
	}
	return &e, nil
}

func (s *sqlStore) Set(ctx context.Context, key, value, category string) error {
	if category == "" {
		category = "custom"
	}
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO global_envs (key, value, category, updated_at) VALUES (?, ?, ?, datetime('now'))
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value, category = excluded.category, updated_at = excluded.updated_at`,
		key, value, category)
	if err != nil {
		return fmt.Errorf("set env %q: %w", key, err)
	}
	return nil
}

func (s *sqlStore) Delete(ctx context.Context, key string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM global_envs WHERE key = ?`, key)
	if err != nil {
		return fmt.Errorf("delete env %q: %w", key, err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("env key %q not found", key)
	}
	return nil
}

func (s *sqlStore) List(ctx context.Context) ([]EnvVar, error) {
	return s.query(ctx, `SELECT key, value, category FROM global_envs ORDER BY category, key`)
}

func (s *sqlStore) ListByCategory(ctx context.Context, category string) ([]EnvVar, error) {
	return s.query(ctx, `SELECT key, value, category FROM global_envs WHERE category = ? ORDER BY key`, category)
}

func (s *sqlStore) query(ctx context.Context, q string, args ...any) ([]EnvVar, error) {
	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("query envs: %w", err)
	}
	defer rows.Close()

	var result []EnvVar
	for rows.Next() {
		var e EnvVar
		if err := rows.Scan(&e.Key, &e.Value, &e.Category); err != nil {
			return nil, fmt.Errorf("scan env: %w", err)
		}
		result = append(result, e)
	}
	return result, rows.Err()
}
