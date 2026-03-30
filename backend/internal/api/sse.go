package api

import (
	"fmt"
	"net/http"
	"time"
)

// HandleSSE streams EventBus events to connected browsers via Server-Sent Events.
func (s *Server) HandleSSE(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "SSE not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	// Send initial ping.
	fmt.Fprintf(w, "event: ping\ndata: connected\n\n")
	flusher.Flush()

	// Create a channel for events.
	events := make(chan string, 32)
	done := r.Context().Done()

	// Keepalive ticker (15s).
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-done:
			return
		case msg := <-events:
			fmt.Fprintf(w, "data: %s\n\n", msg)
			flusher.Flush()
		case <-ticker.C:
			fmt.Fprintf(w, "event: ping\ndata: keepalive\n\n")
			flusher.Flush()
		}
	}
}
