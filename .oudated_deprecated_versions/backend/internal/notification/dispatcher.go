// Package notification provides multi-channel event dispatching.
package notification

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/thesebastianf/hlc/internal/core"
)

// Severity levels for notifications.
type Severity string

const (
	SeverityInfo     Severity = "info"
	SeverityWarning  Severity = "warning"
	SeverityCritical Severity = "critical"
)

// Channel represents the configuration of a single notification channel.
type Channel struct {
	ID       int64
	Name     string // telegram, discord, gotify, ntfy, email, webhook
	Enabled  bool
	Config   map[string]string
	MinLevel Severity
}

// Message is what gets dispatched to a channel.
type Message struct {
	Title    string
	Body     string
	Severity Severity
	EventType string
}

// Sender is the interface each channel implementation must satisfy.
type Sender interface {
	Send(ctx context.Context, ch Channel, msg Message) error
	Name() string
}

// Dispatcher routes events to configured channels.
type Dispatcher struct {
	db      *sql.DB
	senders map[string]Sender
	log     *slog.Logger
}

// NewDispatcher creates a Dispatcher and registers all built-in senders.
func NewDispatcher(db *sql.DB, log *slog.Logger) *Dispatcher {
	d := &Dispatcher{
		db:      db,
		senders: make(map[string]Sender),
		log:     log,
	}
	for _, s := range []Sender{
		&TelegramSender{},
		&DiscordSender{},
		&GotifySender{},
		&NtfySender{},
		&EmailSender{},
		&WebhookSender{},
	} {
		d.senders[s.Name()] = s
	}
	return d
}

// RegisterAll subscribes to relevant EventBus events.
func (d *Dispatcher) RegisterAll(bus core.EventBus) {
	criticalEvents := []core.EventType{
		core.ContainerUnhealthy, core.ContainerDied,
		core.BackupFailed, core.UpdateFailed, core.UpdateRolledBack,
		core.MountLost, core.MountTimeout,
		core.SystemSafeMode, core.AuthFailure,
	}
	infoEvents := []core.EventType{
		core.BackupCompleted, core.UpdateCompleted,
		core.MountReady, core.StackStarted, core.StackStopped,
	}
	for _, et := range criticalEvents {
		et := et
		bus.Subscribe(et, func(ctx context.Context, e core.Event) {
			d.dispatch(ctx, e, SeverityCritical)
		})
	}
	for _, et := range infoEvents {
		et := et
		bus.Subscribe(et, func(ctx context.Context, e core.Event) {
			d.dispatch(ctx, e, SeverityInfo)
		})
	}
}

// dispatch sends a notification to all eligible channels.
func (d *Dispatcher) dispatch(ctx context.Context, e core.Event, severity Severity) {
	channels, err := d.loadEnabled(ctx)
	if err != nil {
		d.log.Warn("notification dispatch: load channels failed", "err", err)
		return
	}

	msg := Message{
		Title:     fmt.Sprintf("[HLC] %s", e.Type),
		Body:      fmt.Sprintf("Source: %s", e.Source),
		Severity:  severity,
		EventType: string(e.Type),
	}

	for _, ch := range channels {
		if !meetsSeverity(severity, ch.MinLevel) {
			continue
		}
		sender, ok := d.senders[ch.Name]
		if !ok {
			continue
		}
		ch := ch
		go func() {
			if err := sender.Send(ctx, ch, msg); err != nil {
				d.log.Warn("notification send failed", "channel", ch.Name, "err", err)
				d.logResult(ctx, ch.ID, string(e.Type), false, err.Error())
			} else {
				d.logResult(ctx, ch.ID, string(e.Type), true, "")
			}
		}()
	}
}

// Send dispatches a message directly to all enabled channels (bypasses event filtering).
func (d *Dispatcher) Send(ctx context.Context, msg Message) {
	channels, err := d.loadEnabled(ctx)
	if err != nil {
		d.log.Warn("notification send: load channels failed", "err", err)
		return
	}
	for _, ch := range channels {
		sender, ok := d.senders[ch.Name]
		if !ok {
			continue
		}
		ch := ch
		go func() {
			if err := sender.Send(ctx, ch, msg); err != nil {
				d.log.Warn("notification send failed", "channel", ch.Name, "err", err)
			}
		}()
	}
}

func (d *Dispatcher) loadEnabled(ctx context.Context) ([]Channel, error) {
	rows, err := d.db.QueryContext(ctx,
		`SELECT id, name, config, min_level FROM notification_channels WHERE enabled = 1`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var channels []Channel
	for rows.Next() {
		var ch Channel
		var cfgJSON string
		if err := rows.Scan(&ch.ID, &ch.Name, &cfgJSON, &ch.MinLevel); err != nil {
			return nil, err
		}
		ch.Enabled = true
		if cfgJSON != "" {
			_ = json.Unmarshal([]byte(cfgJSON), &ch.Config)
		}
		channels = append(channels, ch)
	}
	return channels, rows.Err()
}

func (d *Dispatcher) logResult(ctx context.Context, channelID int64, eventType string, success bool, errMsg string) {
	_, err := d.db.ExecContext(ctx,
		`INSERT INTO notification_log (channel_id, event_type, success, error_message, sent_at) VALUES (?, ?, ?, ?, ?)`,
		channelID, eventType, success, errMsg, time.Now().UTC().Format(time.RFC3339),
	)
	if err != nil {
		d.log.Warn("notification log write failed", "err", err)
	}
}

// meetsSeverity checks if actual severity meets the minimum threshold.
func meetsSeverity(actual, minimum Severity) bool {
	order := map[Severity]int{SeverityInfo: 0, SeverityWarning: 1, SeverityCritical: 2}
	return order[actual] >= order[minimum]
}
