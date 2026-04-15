package docker

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/thesebastianf/hlc/internal/core"
)

// newTestClient returns a Client wired to the given test server, bypassing the
// Unix socket entirely.
func newTestClient(server *httptest.Server) *Client {
	return &Client{
		httpClient: server.Client(),
		baseURL:    server.URL,
	}
}

// fakeBus is a minimal core.EventBus implementation for tests.
type fakeBus struct {
	mu     sync.Mutex
	events []core.Event
	ch     chan string
}

func (f *fakeBus) Publish(_ context.Context, event core.Event) {
	f.mu.Lock()
	f.events = append(f.events, event)
	f.mu.Unlock()
	if f.ch != nil {
		f.ch <- string(event.Type)
	}
}

func (f *fakeBus) Subscribe(_ core.EventType, _ core.HandlerFunc) func()   { return func() {} }
func (f *fakeBus) SubscribeAll(_ core.HandlerFunc) func()                   { return func() {} }
func (f *fakeBus) Shutdown(_ context.Context) error                         { return nil }

// ---- Client tests ----

func TestClient_Get_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	c := newTestClient(srv)
	body, err := c.Get(context.Background(), "/test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(body) != `{"ok":true}` {
		t.Errorf("unexpected body: %s", body)
	}
}

func TestClient_Get_ErrorStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "not found", http.StatusNotFound)
	}))
	defer srv.Close()

	c := newTestClient(srv)
	_, err := c.Get(context.Background(), "/missing")
	if err == nil {
		t.Fatal("expected error for 404 response")
	}
}

func TestClient_Post_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("expected POST, got %s", r.Method)
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"created":true}`))
	}))
	defer srv.Close()

	c := newTestClient(srv)
	body, err := c.Post(context.Background(), "/create", strings.NewReader(`{}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(body) != `{"created":true}` {
		t.Errorf("unexpected body: %s", body)
	}
}

// ---- Container listing tests ----

func TestListContainers_ParsesResponse(t *testing.T) {
	payload := []map[string]interface{}{
		{
			"Id":     "abc123def456",
			"Names":  []string{"/my-nginx"},
			"Image":  "nginx:latest",
			"State":  "running",
			"Labels": map[string]interface{}{"hlc.role": "app"},
		},
		{
			"Id":     "deadbeef0000",
			"Names":  []string{"/stopped-db"},
			"Image":  "postgres:15",
			"State":  "exited",
			"Labels": nil,
		},
	}
	raw, _ := json.Marshal(payload)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.RawQuery, "all=true") {
			t.Error("expected all=true query param")
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(raw)
	}))
	defer srv.Close()

	c := newTestClient(srv)
	containers, err := c.ListContainers(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(containers) != 2 {
		t.Fatalf("expected 2 containers, got %d", len(containers))
	}

	// Name should have leading slash stripped.
	if containers[0].Name != "my-nginx" {
		t.Errorf("expected name my-nginx, got %s", containers[0].Name)
	}
	if containers[0].Labels["hlc.role"] != "app" {
		t.Errorf("expected label hlc.role=app")
	}
	// Nil labels should become empty map, not nil.
	if containers[1].Labels == nil {
		t.Error("expected non-nil labels map for container with no labels")
	}
}

// ---- Event streaming tests ----

func TestMapDockerAction(t *testing.T) {
	cases := []struct {
		action string
		want   string
		ok     bool
	}{
		{"start", "ContainerStarted", true},
		{"stop", "ContainerStopped", true},
		{"die", "ContainerDied", true},
		{"health_status", "ContainerHealth", true},
		{"create", "", false},
		{"destroy", "", false},
		{"exec_start", "", false},
	}

	for _, tc := range cases {
		et, ok := mapDockerAction(tc.action)
		if ok != tc.ok {
			t.Errorf("action %q: ok=%v, want %v", tc.action, ok, tc.ok)
		}
		if ok && string(et) != tc.want {
			t.Errorf("action %q: type=%q, want %q", tc.action, et, tc.want)
		}
	}
}

func TestStreamEvents_PublishesEvents(t *testing.T) {
	makeEvent := func(typ, action, name, image string) dockerEvent {
		var e dockerEvent
		e.Type = typ
		e.Action = action
		e.Time = time.Now().Unix()
		e.Actor.ID = "aaabbbccc"
		e.Actor.Attributes = map[string]string{"name": name, "image": image}
		return e
	}

	evts := []dockerEvent{
		makeEvent("container", "start", "my-app", "nginx"),
		makeEvent("container", "die", "my-app", "nginx"),
		makeEvent("network", "connect", "net1", ""),  // ignored
		makeEvent("container", "create", "my-app", "nginx"), // ignored
	}

	var sb strings.Builder
	for _, e := range evts {
		line, _ := json.Marshal(e)
		sb.Write(line)
		sb.WriteByte('\n')
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(sb.String()))
	}))
	defer srv.Close()

	published := make(chan string, 10)
	fb := &fakeBus{ch: published}

	c := newTestClient(srv)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	_ = c.StreamEvents(ctx, fb)

	close(published)
	var got []string
	for et := range published {
		got = append(got, et)
	}

	if len(got) != 2 {
		t.Errorf("expected 2 published events, got %d: %v", len(got), got)
	}
}
