package scheduler

import (
	"context"
	"testing"
	"time"
)

func TestRegister_InvalidExpr(t *testing.T) {
	s := New(noopLogger())
	if err := s.Register("test", "* * * *", func(_ context.Context) {}); err == nil {
		t.Error("expected error for 4-field expression")
	}
}

func TestNextTick_Wildcard(t *testing.T) {
	// "* * * * *" should resolve to the next minute.
	from := time.Date(2024, 1, 1, 12, 0, 0, 0, time.UTC)
	next, err := nextTick("* * * * *", from)
	if err != nil {
		t.Fatal(err)
	}
	expected := from.Truncate(time.Minute).Add(time.Minute)
	if !next.Equal(expected) {
		t.Errorf("expected %v, got %v", expected, next)
	}
}

func TestNextTick_HourlyAt30(t *testing.T) {
	// "30 * * * *" runs at :30 of every hour.
	from := time.Date(2024, 1, 1, 12, 0, 0, 0, time.UTC)
	next, err := nextTick("30 * * * *", from)
	if err != nil {
		t.Fatal(err)
	}
	if next.Minute() != 30 {
		t.Errorf("expected minute 30, got %d", next.Minute())
	}
}

func TestRegister_ValidExpr(t *testing.T) {
	s := New(noopLogger())
	if err := s.Register("job1", "0 3 * * *", func(_ context.Context) {}); err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	jobs := s.ListJobs()
	if len(jobs) != 1 || jobs[0].ID != "job1" {
		t.Errorf("expected 1 job named job1, got %v", jobs)
	}
}
