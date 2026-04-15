package nas

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/thesebastianf/hlc/internal/core"
)

func TestCheckMount_Healthy(t *testing.T) {
	dir := t.TempDir()
	anchor := filepath.Join(dir, ".hlc_ready")
	if err := os.WriteFile(anchor, []byte("ready"), 0o644); err != nil {
		t.Fatal(err)
	}
	c := NewChecker(".hlc_ready")
	mc := c.CheckMount(context.Background(), dir)
	if mc.Status != MountHealthy {
		t.Errorf("expected healthy, got %s: %s", mc.Status, mc.Reason)
	}
}

func TestCheckMount_Degraded_NoAnchor(t *testing.T) {
	dir := t.TempDir()
	c := NewChecker(".hlc_ready")
	mc := c.CheckMount(context.Background(), dir)
	if mc.Status != MountDegraded {
		t.Errorf("expected degraded, got %s: %s", mc.Status, mc.Reason)
	}
}

func TestCheckMount_Offline_NotExist(t *testing.T) {
	c := NewChecker(".hlc_ready")
	mc := c.CheckMount(context.Background(), "/nonexistent/path/abc123")
	if mc.Status != MountOffline {
		t.Errorf("expected offline, got %s: %s", mc.Status, mc.Reason)
	}
}

type testBus struct {
	events []core.Event
}

func (b *testBus) Publish(_ context.Context, e core.Event) { b.events = append(b.events, e) }
func (b *testBus) Subscribe(_ core.EventType, _ core.HandlerFunc) func() { return func() {} }
func (b *testBus) SubscribeAll(_ core.HandlerFunc) func()                 { return func() {} }
func (b *testBus) Shutdown(_ context.Context) error                       { return nil }

func TestMonitor_Transition(t *testing.T) {
	dir := t.TempDir()
	anchor := filepath.Join(dir, ".hlc_ready")

	checker := NewChecker(".hlc_ready")
	bus := &testBus{}
	mon := NewMonitor(checker, []string{dir}, 10*time.Millisecond, bus, noopLogger())

	// No anchor yet → should emit MountDegraded or MountLost.
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	mon.Start(ctx)
	time.Sleep(50 * time.Millisecond)

	// Add anchor.
	if err := os.WriteFile(anchor, []byte("ready"), 0o644); err != nil {
		t.Fatal(err)
	}
	time.Sleep(100 * time.Millisecond)

	found := false
	for _, e := range bus.events {
		if e.Type == core.MountReady {
			found = true
		}
	}
	if !found {
		t.Error("expected MountReady event after anchor created")
	}
}
