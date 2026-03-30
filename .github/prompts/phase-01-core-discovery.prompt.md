---
mode: "agent"
description: "Implement Phase 1: Core Discovery — Docker socket, container listing, event streaming, internal event bus"
tools: ["run_in_terminal", "create_file", "replace_string_in_file", "read_file", "grep_search", "file_search", "get_errors"]
---

# Phase 1 — Core Discovery (Foundation)

Build the foundational layer: Docker socket connection, container discovery, event streaming, and the internal Event Bus.

## Tasks

### 1.1 — Project Scaffold
Create the Go module and directory structure:
```
backend/
  go.mod                        # module github.com/<user>/hlc
  cmd/hlc/main.go               # entrypoint, wires up components
  internal/
    core/event_bus.go            # pub/sub event bus
    core/event_bus_test.go
    docker/client.go             # Docker socket HTTP client
    docker/client_test.go
    docker/containers.go         # list containers
    docker/containers_test.go
    docker/events.go             # stream Docker events
    docker/events_test.go
```
Run `go mod init` and `go mod tidy`.

### 1.2 — Event Bus (`internal/core/event_bus.go`)
```go
type EventType string

const (
    ContainerStarted  EventType = "ContainerStarted"
    ContainerStopped  EventType = "ContainerStopped"
    ContainerDied     EventType = "ContainerDied"
    ContainerHealth   EventType = "ContainerHealth"
)

type Event struct {
    Type      EventType
    Source    string            // container name or system component
    Payload   map[string]string
    Timestamp time.Time
}

type HandlerFunc func(ctx context.Context, event Event)

type EventBus interface {
    Publish(ctx context.Context, event Event)
    Subscribe(eventType EventType, handler HandlerFunc) (unsubscribe func())
    SubscribeAll(handler HandlerFunc) (unsubscribe func())
    Shutdown(ctx context.Context) error
}
```
- Subscribers run in separate goroutines.
- Use a buffered channel internally.
- Support graceful shutdown (drain pending events).
- Write table-driven tests.

### 1.3 — Docker Socket Client (`internal/docker/client.go`)
```go
type Client struct {
    httpClient *http.Client
    baseURL    string
}

func NewClient(socketPath string) *Client
func (c *Client) Get(ctx context.Context, path string) ([]byte, error)
func (c *Client) Post(ctx context.Context, path string, body io.Reader) ([]byte, error)
func (c *Client) Stream(ctx context.Context, path string) (io.ReadCloser, error)
```
- Default socket: `/var/run/docker.sock`
- Use `net.Dial` with Unix transport.
- All methods accept `context.Context` for cancellation.

### 1.4 — Container Listing (`internal/docker/containers.go`)
```go
type Container struct {
    ID     string
    Name   string
    Image  string
    State  string            // running, exited, etc.
    Labels map[string]string // all labels, including hlc.*
}

func (c *Client) ListContainers(ctx context.Context) ([]Container, error)
```
- Call `GET /containers/json?all=true`.
- Parse JSON response into `[]Container`.
- Strip leading `/` from container names.

### 1.5 — Docker Event Streaming (`internal/docker/events.go`)
```go
func (c *Client) StreamEvents(ctx context.Context, bus core.EventBus) error
```
- Call `GET /events` (long-lived streaming connection).
- Parse each JSON line from the stream.
- Map Docker event types (start, stop, die, health_status) to internal `core.Event` types.
- Publish each mapped event to the Event Bus.
- Respect context cancellation for clean shutdown.

### 1.6 — Main Entrypoint (`cmd/hlc/main.go`)
Wire everything together:
1. Create Event Bus
2. Create Docker client
3. List containers (log them)
4. Start event streaming in a goroutine
5. Block on signal (SIGTERM/SIGINT)
6. Graceful shutdown: cancel context, drain event bus

## Acceptance Criteria
- [ ] `go build ./...` succeeds with zero errors
- [ ] `go test ./...` passes all tests
- [ ] Running the binary connects to Docker and lists containers
- [ ] Docker events (start/stop a container) appear in logs via Event Bus
