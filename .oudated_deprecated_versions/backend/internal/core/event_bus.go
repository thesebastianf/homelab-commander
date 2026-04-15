package core

import (
	"context"
	"sync"
	"time"
)

// EventType identifies the kind of event on the bus.
type EventType string

const (
	// Container lifecycle
	ContainerStarted   EventType = "ContainerStarted"
	ContainerStopped   EventType = "ContainerStopped"
	ContainerRestarted EventType = "ContainerRestarted"
	ContainerDied      EventType = "ContainerDied"
	ContainerHealth    EventType = "ContainerHealth"
	ContainerUnhealthy EventType = "ContainerUnhealthy"

	// Stack lifecycle
	StackStarted   EventType = "StackStarted"
	StackStopped   EventType = "StackStopped"
	StackRestarted EventType = "StackRestarted"

	// Mount events
	MountReady    EventType = "MountReady"
	MountLost     EventType = "MountLost"
	MountDegraded EventType = "MountDegraded"
	MountTimeout  EventType = "MountTimeout"

	// Backup events
	BackupStarted   EventType = "BackupStarted"
	BackupCompleted EventType = "BackupCompleted"
	BackupFailed    EventType = "BackupFailed"

	// Restore events
	RestoreStarted   EventType = "RestoreStarted"
	RestoreCompleted EventType = "RestoreCompleted"
	RestoreFailed    EventType = "RestoreFailed"

	// Update events
	UpdateStarted    EventType = "UpdateStarted"
	UpdateCompleted  EventType = "UpdateCompleted"
	UpdateFailed     EventType = "UpdateFailed"
	UpdateRolledBack EventType = "UpdateRolledBack"

	// Observability
	StatsCollected EventType = "StatsCollected"

	// Policy events
	PolicyChanged    EventType = "PolicyChanged"
	PolicyEvaluated  EventType = "PolicyEvaluated"
	PolicyActivated  EventType = "PolicyActivated"
	PolicyDeactivated EventType = "PolicyDeactivated"

	// System events
	SystemSafeMode EventType = "SystemSafeMode"
	AuthFailure    EventType = "AuthFailure"
)

// Event is the message passed between components via the Event Bus.
type Event struct {
	Type      EventType
	Source    string            // container name or system component
	Payload   map[string]string
	Timestamp time.Time
}

// HandlerFunc is called when a matching event arrives.
type HandlerFunc func(ctx context.Context, event Event)

// EventBus is the central pub/sub interface.
type EventBus interface {
	Publish(ctx context.Context, event Event)
	Subscribe(eventType EventType, handler HandlerFunc) (unsubscribe func())
	SubscribeAll(handler HandlerFunc) (unsubscribe func())
	Shutdown(ctx context.Context) error
}

// subscription holds a handler and its optional type filter.
type subscription struct {
	id      uint64
	filter  EventType // empty = all events
	handler HandlerFunc
}

// bus is the concrete EventBus implementation.
type bus struct {
	mu   sync.RWMutex
	subs []*subscription
	ch   chan Event
	done chan struct{}
	wg   sync.WaitGroup
	seq  uint64
}

const defaultBufferSize = 256

// NewEventBus creates and starts a buffered, goroutine-safe Event Bus.
func NewEventBus() EventBus {
	b := &bus{
		ch:   make(chan Event, defaultBufferSize),
		done: make(chan struct{}),
	}
	b.wg.Add(1)
	go b.dispatch()
	return b
}

// Publish enqueues an event. It never blocks the caller; if the buffer is full
// the event is dropped and the call returns immediately.
func (b *bus) Publish(_ context.Context, event Event) {
	if event.Timestamp.IsZero() {
		event.Timestamp = time.Now()
	}
	select {
	case b.ch <- event:
	default:
		// buffer full – drop to avoid blocking callers
	}
}

// Subscribe registers a handler for a specific event type and returns an
// unsubscribe function.
func (b *bus) Subscribe(eventType EventType, handler HandlerFunc) func() {
	return b.addSub(&subscription{filter: eventType, handler: handler})
}

// SubscribeAll registers a handler that receives every event type.
func (b *bus) SubscribeAll(handler HandlerFunc) func() {
	return b.addSub(&subscription{handler: handler})
}

func (b *bus) addSub(s *subscription) func() {
	b.mu.Lock()
	b.seq++
	s.id = b.seq
	b.subs = append(b.subs, s)
	b.mu.Unlock()

	return func() {
		b.mu.Lock()
		defer b.mu.Unlock()
		for i, sub := range b.subs {
			if sub.id == s.id {
				b.subs = append(b.subs[:i], b.subs[i+1:]...)
				return
			}
		}
	}
}

// dispatch is the single goroutine that reads from the channel and fans out.
func (b *bus) dispatch() {
	defer b.wg.Done()
	for event := range b.ch {
		b.mu.RLock()
		subs := make([]*subscription, len(b.subs))
		copy(subs, b.subs)
		b.mu.RUnlock()

		for _, s := range subs {
			if s.filter == "" || s.filter == event.Type {
				s := s
				ev := event
				// Each handler runs in its own goroutine so a slow handler
				// cannot block others.
				b.wg.Add(1)
				go func() {
					defer b.wg.Done()
					s.handler(context.Background(), ev)
				}()
			}
		}
	}
}

// Shutdown stops accepting new events and waits for all pending events and
// handler goroutines to finish, or until ctx is cancelled.
func (b *bus) Shutdown(ctx context.Context) error {
	close(b.ch)

	finished := make(chan struct{})
	go func() {
		b.wg.Wait()
		close(finished)
	}()

	select {
	case <-finished:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
