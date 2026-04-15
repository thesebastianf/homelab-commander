package auth

import (
	"context"
	"database/sql"
	"testing"
)

func TestVerify_NoTokenConfigured(t *testing.T) {
	db, err := openTestDB(t)
	if err != nil {
		t.Fatal(err)
	}
	store := NewTokenStore(db)
	// No token set yet — expect nil (allow all on first-run).
	if err := store.Verify(context.Background(), "anything"); err != nil {
		t.Errorf("expected nil on unconfigured token store, got: %v", err)
	}
}

func TestVerify_CorrectToken(t *testing.T) {
	db, err := openTestDB(t)
	if err != nil {
		t.Fatal(err)
	}
	store := NewTokenStore(db)
	token := "mysecrettoken"
	if err := store.SetToken(context.Background(), token); err != nil {
		t.Fatal(err)
	}
	if err := store.Verify(context.Background(), token); err != nil {
		t.Errorf("expected nil for correct token, got: %v", err)
	}
}

func TestVerify_WrongToken(t *testing.T) {
	db, err := openTestDB(t)
	if err != nil {
		t.Fatal(err)
	}
	store := NewTokenStore(db)
	if err := store.SetToken(context.Background(), "correct"); err != nil {
		t.Fatal(err)
	}
	if err := store.Verify(context.Background(), "wrong"); err == nil {
		t.Error("expected error for wrong token")
	}
}

func TestGenerateToken(t *testing.T) {
	tok, err := GenerateToken()
	if err != nil {
		t.Fatal(err)
	}
	if len(tok) != 64 {
		t.Errorf("expected 64-char hex token, got %d chars", len(tok))
	}
}

// openTestDB creates a minimal in-memory SQLite DB with just the settings table.
func openTestDB(t *testing.T) (*sql.DB, error) {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		return nil, err
	}
	t.Cleanup(func() { db.Close() })
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`)
	return db, err
}
