package docker

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/thesebastianf/hlc/internal/core"
)

// dockerEvent mirrors the fields we care about from the Docker Engine event stream.
type dockerEvent struct {
	Type   string `json:"Type"`
	Action string `json:"Action"`
	Actor  struct {
		ID         string            `json:"ID"`
		Attributes map[string]string `json:"Attributes"`
	} `json:"Actor"`
	Time int64 `json:"time"`
}

// StreamEvents reads the Docker event stream and publishes mapped events to the
// provided Event Bus. It returns only when the context is cancelled or an
// unrecoverable error occurs.
func (c *Client) StreamEvents(ctx context.Context, bus core.EventBus) error {
	stream, err := c.Stream(ctx, "/events")
	if err != nil {
		return fmt.Errorf("stream events: open: %w", err)
	}
	defer stream.Close()

	scanner := bufio.NewScanner(stream)
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var de dockerEvent
		if err := json.Unmarshal(line, &de); err != nil {
			slog.Warn("stream events: unmarshal failed", "error", err, "line", string(line))
			continue
		}

		// Only handle container-type events.
		if de.Type != "container" {
			continue
		}

		eventType, ok := mapDockerAction(de.Action)
		if !ok {
			continue
		}

		name := de.Actor.Attributes["name"]
		if name == "" {
			name = de.Actor.ID[:min(12, len(de.Actor.ID))]
		}

		payload := map[string]string{
			"container_id": de.Actor.ID,
			"image":        de.Actor.Attributes["image"],
			"action":       de.Action,
		}
		// For health events the "health_status" attribute carries the status.
		if hs := de.Actor.Attributes["health_status"]; hs != "" {
			payload["health_status"] = hs
		}

		bus.Publish(ctx, core.Event{
			Type:      eventType,
			Source:    name,
			Payload:   payload,
			Timestamp: time.Unix(de.Time, 0),
		})
	}

	if err := scanner.Err(); err != nil {
		// A context cancellation causes the underlying connection to close,
		// which surfaces as a scanner error — treat that as a clean exit.
		if ctx.Err() != nil {
			return nil
		}
		return fmt.Errorf("stream events: scanner: %w", err)
	}

	return nil
}

// mapDockerAction converts a Docker event action string to an internal EventType.
// Returns false if the action is not one we track.
func mapDockerAction(action string) (core.EventType, bool) {
	switch action {
	case "start":
		return core.ContainerStarted, true
	case "stop":
		return core.ContainerStopped, true
	case "die":
		return core.ContainerDied, true
	case "health_status":
		return core.ContainerHealth, true
	default:
		return "", false
	}
}

