package db

import (
	"context"
	"os"
	"testing"
)

func openTestDB(t *testing.T) *SettingsRepo {
	t.Helper()
	dir := t.TempDir()
	db, err := Open(dir + "/test.db")
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return NewSettingsRepo(db)
}

func TestSettingsRepo_GetSet(t *testing.T) {
	repo := openTestDB(t)
	ctx := context.Background()

	// Seeded value should exist.
	val, err := repo.Get(ctx, "instance_name")
	if err != nil {
		t.Fatalf("get seeded setting: %v", err)
	}
	if val != "HomeLab-01" {
		t.Errorf("expected HomeLab-01, got %q", val)
	}

	// Set a new value.
	if err := repo.Set(ctx, "instance_name", "MyLab"); err != nil {
		t.Fatalf("set setting: %v", err)
	}

	val, err = repo.Get(ctx, "instance_name")
	if err != nil {
		t.Fatalf("get updated setting: %v", err)
	}
	if val != "MyLab" {
		t.Errorf("expected MyLab, got %q", val)
	}
}

func TestSettingsRepo_GetAll(t *testing.T) {
	repo := openTestDB(t)
	ctx := context.Background()

	all, err := repo.GetAll(ctx)
	if err != nil {
		t.Fatalf("get all: %v", err)
	}
	if _, ok := all["base_stack_path"]; !ok {
		t.Error("expected base_stack_path in seeded settings")
	}
}

func TestSettingsRepo_GetMissing(t *testing.T) {
	repo := openTestDB(t)
	_, err := repo.Get(context.Background(), "nonexistent_key_xyz")
	if err == nil {
		t.Error("expected error for missing key")
	}
}

func TestMigrate_Idempotent(t *testing.T) {
	dir := t.TempDir()
	db, err := Open(dir + "/test.db")
	if err != nil {
		t.Fatalf("first open: %v", err)
	}
	db.Close()

	// Second open should succeed — migrations are idempotent.
	db2, err := Open(dir + "/test.db")
	if err != nil {
		t.Fatalf("second open: %v", err)
	}
	db2.Close()
}

// Ensure test binary can find migrations via embed even without a filesystem.
func TestEmbed(t *testing.T) {
	entries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		t.Fatalf("read embedded migrations: %v", err)
	}
	if len(entries) == 0 {
		t.Error("expected at least one migration file")
	}
	_ = os.Stdout // quiet import
}
