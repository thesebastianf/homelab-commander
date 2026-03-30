package envhub

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/thesebastianf/hlc/internal/db"
)

func openTestInjector(t *testing.T) (*Injector, string) {
	t.Helper()
	d, err := db.Open(t.TempDir() + "/test.db")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { d.Close() })

	store := NewStore(d)
	ctx := context.Background()
	_ = store.Set(ctx, "TZ", "UTC", "system")
	_ = store.Set(ctx, "PUID", "1001", "system")

	baseDir := t.TempDir()
	return NewInjector(store, baseDir), baseDir
}

func TestInjector_InjectIntoStack(t *testing.T) {
	inj, baseDir := openTestInjector(t)

	stackDir := filepath.Join(baseDir, "my-stack")
	if err := os.MkdirAll(stackDir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}

	// Pre-existing local .env with a local override.
	existing := "PUID=9999\nLOCAL_VAR=local\n"
	if err := os.WriteFile(filepath.Join(stackDir, ".env"), []byte(existing), 0o644); err != nil {
		t.Fatalf("write .env: %v", err)
	}

	if err := inj.InjectIntoStack(context.Background(), stackDir, false); err != nil {
		t.Fatalf("inject: %v", err)
	}

	vars, err := readEnvFile(filepath.Join(stackDir, ".env"))
	if err != nil {
		t.Fatalf("read after inject: %v", err)
	}

	// Local override should be kept.
	if vars["PUID"] != "9999" {
		t.Errorf("expected PUID=9999 (local override), got %q", vars["PUID"])
	}
	// Global TZ injected.
	if vars["TZ"] != "UTC" {
		t.Errorf("expected TZ=UTC, got %q", vars["TZ"])
	}
	// Local-only var preserved.
	if vars["LOCAL_VAR"] != "local" {
		t.Errorf("expected LOCAL_VAR=local, got %q", vars["LOCAL_VAR"])
	}
}

func TestInjector_InjectForce(t *testing.T) {
	inj, baseDir := openTestInjector(t)

	stackDir := filepath.Join(baseDir, "force-stack")
	_ = os.MkdirAll(stackDir, 0o755)
	_ = os.WriteFile(filepath.Join(stackDir, ".env"), []byte("PUID=9999\n"), 0o644)

	if err := inj.InjectIntoStack(context.Background(), stackDir, true); err != nil {
		t.Fatalf("inject force: %v", err)
	}

	vars, _ := readEnvFile(filepath.Join(stackDir, ".env"))
	// Force should overwrite local.
	if vars["PUID"] != "1001" {
		t.Errorf("force inject: expected PUID=1001, got %q", vars["PUID"])
	}
}

func TestInjector_FindAffectedStacks(t *testing.T) {
	inj, baseDir := openTestInjector(t)

	// Create two stacks, one referencing TZ.
	s1 := filepath.Join(baseDir, "stack1")
	_ = os.MkdirAll(s1, 0o755)
	_ = os.WriteFile(filepath.Join(s1, ".env"), []byte("TZ=America/New_York\n"), 0o644)

	s2 := filepath.Join(baseDir, "stack2")
	_ = os.MkdirAll(s2, 0o755)
	_ = os.WriteFile(filepath.Join(s2, ".env"), []byte("OTHER=val\n"), 0o644)

	affected, err := inj.FindAffectedStacks(context.Background(), "TZ")
	if err != nil {
		t.Fatalf("find affected: %v", err)
	}
	if len(affected) != 1 {
		t.Errorf("expected 1 affected stack, got %d", len(affected))
	}
}
