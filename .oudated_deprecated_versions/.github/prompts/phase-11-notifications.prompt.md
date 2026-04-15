---
mode: "agent"
description: "Implement Phase 11: Notifications — Multi-channel dispatcher (Telegram, Discord, Gotify, Ntfy, Email, Webhook)"
tools: ["run_in_terminal", "create_file", "replace_string_in_file", "read_file", "grep_search", "file_search", "get_errors"]
---

# Phase 11 — Notifications (Multi-Channel)

Configurable notification service subscribed to Event Bus. Primary channel: Telegram.

## Prerequisites
Phase 10 complete.

## Tasks

### 11.1 — Core Dispatcher (`internal/notification/`)
```go
type Level string
const (
    LevelInfo    Level = "info"
    LevelWarning Level = "warning"
    LevelError   Level = "error"
)

type Message struct {
    Title     string
    Body      string
    Level     Level
    Event     string
    Container string
    Meta      map[string]string
    Timestamp time.Time
}

type Channel interface {
    Name() string
    Send(ctx context.Context, msg Message) error
    Validate() error
}

type Dispatcher struct {
    channels []channelBinding
    bus      *core.EventBus
}

func NewDispatcher(bus *core.EventBus) *Dispatcher
func (d *Dispatcher) Register(ch Channel, events []string, minLevel Level)
func (d *Dispatcher) Dispatch(ctx context.Context, msg Message) error
func (d *Dispatcher) TestChannel(ctx context.Context, channelName string) error
```

### 11.2 — Built-in Channels

**Telegram** (`telegram.go`):
```go
type TelegramChannel struct {
    BotToken  string
    ChatID    string
    Silent    bool
    ParseMode string // "HTML" or "Markdown"
}
```
- Primary notification channel. Telegram Bot API `/sendMessage`.
- Formatted messages: bold container names, code blocks for errors.
- Validate via `getMe` API call.
- Report: mount status, backup success/failure, crash loops.

**Discord** (`discord.go`): Webhook API with color-coded embeds.
**Gotify** (`gotify.go`): Push notifications with priority mapping.
**Ntfy** (`ntfy.go`): ntfy.sh or self-hosted, with tags and priority.
**Email** (`email.go`): SMTP with TLS support.
**Webhook** (`webhook.go`): Generic JSON POST with Go template body.

### 11.3 — Event Subscriptions
Subscribe to Event Bus for:
- `BackupFailed`, `BackupCompleted`
- `UpdateFailed`, `UpdateRolledBack`, `UpdateCompleted`
- `ContainerDied`, `ContainerUnhealthy`
- `MountLost`, `MountReady`, `MountTimeout`
- `PolicyActivated`, `PolicyDeactivated`
- `SystemSafeMode`, `AuthFailure`

### 11.4 — Persistence
Migration `006_notifications.sql`:
```sql
CREATE TABLE IF NOT EXISTS notification_channels (
    id        TEXT PRIMARY KEY,
    type      TEXT NOT NULL,
    name      TEXT NOT NULL,
    config    TEXT NOT NULL,
    events    TEXT,
    min_level TEXT DEFAULT 'warning',
    enabled   BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notification_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL,
    event      TEXT NOT NULL,
    message    TEXT NOT NULL,
    status     TEXT NOT NULL,
    error      TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 11.5 — API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/notifications/channels` | List channels |
| POST | `/api/v1/notifications/channels` | Create channel |
| PUT | `/api/v1/notifications/channels/:id` | Update channel |
| DELETE | `/api/v1/notifications/channels/:id` | Delete channel |
| POST | `/api/v1/notifications/channels/:id/test` | Test channel |
| GET | `/api/v1/notifications/events` | Subscribable events |
| GET | `/api/v1/notifications/history` | Recent log |

## Acceptance Criteria
- [ ] Dispatcher fans out events to registered channels
- [ ] Telegram sends formatted messages (mount status, backups, crashes)
- [ ] All 6 channel types implemented
- [ ] Per-channel event filtering + severity threshold
- [ ] Test endpoint verifies connectivity
- [ ] Notification history persisted
- [ ] `go test ./...` passes
