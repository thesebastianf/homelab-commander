package core

import (
	"context"
	"sync"
	"testing"
	"time"
)

func TestEventBus_SubscribeAndPublish(t *testing.T) {
	b := NewEventBus()

	received := make(chan Event, 1)
	unsub := b.Subscribe(ContainerStarted, func(_ context.Context, e Event) {
		received <- e
	})
	defer unsub()

	evt := Event{
		Type:    ContainerStarted,
		Source:  "my-container",
		Payload: map[string]string{"image": "nginx"},
	}
	b.Publish(context.Background(), evt)

	select {
	case got := <-received:
		if got.Source != "my-container" {
			t.Errorf("expected source my-container, got %s", got.Source)
		}
		if got.Type != ContainerStarted {
			t.Errorf("expected type ContainerStarted, got %s", got.Type)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for event")
	}
}

func TestEventBus_SubscribeAll(t *testing.T) {
	b := NewEventBus()

	var mu sync.Mutex
	var events []Event

	unsub := b.SubscribeAll(func(_ context.Context, e Event) {
		mu.Lock()
		events = append(events, e)
		mu.Unlock()
	})
	defer unsub()

	types := []EventType{ContainerStarted, ContainerStopped, ContainerDied}
	for _, et := range types {
		b.Publish(context.Background(), Event{Type: et, Source: "c1"})
	}

	// Wait for handlers to fire.
	time.Sleep(100 * time.Millisecond)

	mu.Lock()
	got := len(events)
	mu.Unlock()

	if got != len(types) {
		t.Errorf("expected %d events, got %d", len(types), got)
	}
}

func TestEventBus_FilterByType(t *testing.T) {
	b := NewEventBus()

	started := make(chan struct{}, 10)
	unsub := b.Subscribe(ContainerStarted, func(_ context.Context, _ Event) {
		started <- struct{}{}
	})
	defer unsub()

	b.Publish(context.Background(), Event{Type: ContainerStopped, Source: "c1"})
	b.Publish(context.Background(), Event{Type: ContainerStarted, Source: "c2"})

	time.Sleep(100 * time.Millisecond)

	if len(started) != 1 {
		t.Errorf("expected 1 ContainerStarted event, got %d", len(started))
	}
}

func TestEventBus_Unsubscribe(t *testing.T) {
	b := NewEventBus()

	count := make(chan int, 10)
	unsub := b.Subscribe(ContainerStarted, func(_ context.Context, _ Event) {
		count <- 1
	})

	b.Publish(context.Background(), Event{Type: ContainerStarted, Source: "c1"})
	time.Sleep(50 * time.Millisecond)
	unsub()
	b.Publish(context.Background(), Event{Type: ContainerStarted, Source: "c2"})
	time.Sleep(50 * time.Millisecond)

	if len(count) != 1 {
		t.Errorf("expected 1 delivery before unsub, got %d", len(count))
	}
}

func TestEventBus_TimestampSet(t *testing.T) {
	b := NewEventBus()

	received := make(chan Event, 1)
	unsub := b.SubscribeAll(func(_ context.Context, e Event) { received <- e })
	defer unsub()

	before := time.Now()
	b.Publish(context.Background(), Event{Type: ContainerHealth, Source: "c1"})

	select {
	case e := <-received:
		if e.Timestamp.Before(before) {
			t.Errorf("timestamp %v before publish time %v", e.Timestamp, before)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out")
	}
}

func TestEventBus_Shutdown(t *testing.T) {
	b := NewEventBus()

	received := make(chan Event, 100)
	unsub := b.SubscribeAll(func(_ context.Context, e Event) {
		time.Sleep(10 * time.Millisecond) // simulate slow handler
		received <- e
	})
	defer unsub()

	for i := 0; i < 5; i++ {
		b.Publish(context.Background(), Event{Type: ContainerStarted, Source: "c"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := b.Shutdown(ctx); err != nil {
		t.Fatalf("Shutdown returned error: %v", err)
	}
}
