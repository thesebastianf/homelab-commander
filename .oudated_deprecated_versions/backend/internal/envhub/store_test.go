package envhub

import (
	"context"
	"testing"

	"github.com/thesebastianf/hlc/internal/db"
)

func openTestStore(t *testing.T) Store {
	t.Helper()
	d, err := db.Open(t.TempDir() + "/test.db")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { d.Close() })
	return NewStore(d)
}

func TestStore_SetGet(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	if err := s.Set(ctx, "MY_KEY", "hello", "custom"); err != nil {
		t.Fatalf("set: %v", err)
	}

	e, err := s.Get(ctx, "MY_KEY")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if e.Value != "hello" {
		t.Errorf("expected hello, got %q", e.Value)
	}
	if e.Category != "custom" {
		t.Errorf("expected custom, got %q", e.Category)
	}
}

func TestStore_SeededValues(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	// TZ, PUID, PGID seeded by migration
	e, err := s.Get(ctx, "TZ")
	if err != nil {
		t.Fatalf("get TZ: %v", err)
	}
	if e.Value != "Europe/Berlin" {
		t.Errorf("expected Europe/Berlin, got %q", e.Value)
	}
}

func TestStore_Delete(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	_ = s.Set(ctx, "DEL_ME", "v", "custom")
	if err := s.Delete(ctx, "DEL_ME"); err != nil {
		t.Fatalf("delete: %v", err)
	}

	_, err := s.Get(ctx, "DEL_ME")
	if err == nil {
		t.Error("expected error after delete")
	}
}

func TestStore_ListByCategory(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	_ = s.Set(ctx, "API_KEY", "secret", "credentials")
	_ = s.Set(ctx, "TOKEN", "tok", "credentials")

	list, err := s.ListByCategory(ctx, "credentials")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(list) != 2 {
		t.Errorf("expected 2 credentials, got %d", len(list))
	}
}

func TestResolveTemplate(t *testing.T) {
	settings := map[string]string{
		"base_stack_path":  "/opt/stacks",
		"base_volume_path": "/opt/volumes",
	}

	cases := []struct {
		tmpl string
		want string
	}{
		{"{{BASE_STACK}}/myapp", "/opt/stacks/myapp"},
		{"{{BASE_VOL}}/data", "/opt/volumes/data"},
		{"no_placeholders", "no_placeholders"},
		{"{{BASE_STACK}}/{{BASE_VOL}}", "/opt/stacks//opt/volumes"},
	}

	for _, tc := range cases {
		got := ResolveTemplate(tc.tmpl, settings)
		if got != tc.want {
			t.Errorf("ResolveTemplate(%q) = %q, want %q", tc.tmpl, got, tc.want)
		}
	}
}
