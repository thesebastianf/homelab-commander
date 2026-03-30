# HomeLab Commander V2 — Copilot Instructions

## Mental Model

You are building an **intelligent operator system**, not a CRUD app.
HLC is a policy-driven, event-driven, NAS-aware operator for Docker-based homelabs.
It replaces Portainer (management), Dockge (stacks), and Dozzle (logs) while adding
resilience, backup-first safety, and migration readiness.

## Architecture Principles

- **Event-driven over polling** — the Event Bus is the central nervous system.
- **Explicit over implicit** — no magic defaults; every behavior must be traceable to a policy or label.
- **Every action must be reversible** — backup before mutation; rollback on failure.
- **Backup-first philosophy** — never update or mutate without a verified backup path.
- **Label-driven intelligence** — container behavior is driven by `hlc.*` Docker labels.
- **NAS-aware** — stacks declare mount conditions; nothing starts until mounts are verified.
- **Stack-first management** — compose files are first-class entities, discovered from filesystem.
- **Global env propagation** — shared variables managed centrally, injected into stack `.env` files.

## Tech Stack

- **Backend:** Go (standard library preferred, minimal dependencies)
- **Database:** SQLite (via `modernc.org/sqlite` — pure Go, no CGO)
- **Frontend:** HTML + HTMX for most views; Monaco Editor (CDN) for YAML editing
- **Docker:** Socket API via `net/http` unix transport for container ops
- **Compose:** `docker compose` CLI for stack operations (single exception to "no shelling out")
- **Theme:** Tactical dark blue (Slate-900 / Zinc palette)

## Project Structure

```
backend/
  cmd/hlc/               # main entrypoint
  internal/
    core/                # Event Bus, Policy Engine
    docker/              # Docker socket HTTP client, container discovery
    db/                  # SQLite setup, migrations, queries
    envhub/              # Global Env Store, Path Presets, env injection
    labels/              # hlc.* label parser & classification
    stacks/              # Compose file scanning, stack CRUD, stack ops
    nas/                 # NAS Gatekeeper, mount condition checker, boot sequencer
    scheduler/           # Native Go cron, periodic task runner
    backup/              # Backup Engine (volumes, DB dumps, tar/gzip)
    update/              # Update Engine (digest comparison, rollback)
    observability/       # CPU/RAM snapshots, restart/uptime tracking
    audit/               # Persistent audit log, event types
    auth/                # Token auth, read-only mode, safe mode
    notification/        # Multi-channel dispatcher (Telegram, Discord, Gotify, Ntfy, Email, Webhook)
    migrate/             # Export/import wizard for server migration
    api/                 # HTTP handlers, SSE, routes
  web/
    templates/           # Go html/template files
    static/              # CSS, htmx.min.js, monaco loader
  data/                  # Runtime mount: hlc.db, configs
```

## Critical Systems (in dependency order)

1. **Event Bus** (`internal/core/event_bus.go`) — pub/sub for internal events
2. **Policy Engine** (`internal/core/policy_engine.go`) — decision-making, MSM, quiet hours
3. **Global Env Hub** (`internal/envhub/`) — central variable store, path presets, env injection
4. **NAS Gatekeeper** (`internal/nas/`) — mount condition verification, boot sequencing
5. **Stack Manager** (`internal/stacks/`) — compose file CRUD, stack operations
6. **Backup Engine** (`internal/backup/`) — volume snapshots, DB-aware dumps, metadata
7. **Update Engine** (`internal/update/`) — digest comparison, backup→update→healthcheck→rollback

## Development Rules

- Follow ROADMAP phases **sequentially** (Phase 1 → Phase 14).
- **DO NOT** build UI before backend logic is solid.
- **DO NOT** skip Backup Engine before Update Engine.
- **DO NOT** start stacks without checking mount conditions first.
- Every public function needs a clear, single responsibility.
- Use Go interfaces for testability (mock Docker socket, mock DB, mock filesystem).
- Errors are values — wrap with context using `fmt.Errorf("...: %w", err)`.
- Use structured logging (`log/slog`).

## Code Style

- Go standard formatting (`gofmt`).
- Package names: short, lowercase, singular (`backup` not `backups`).
- Interfaces: define at the consumer, not the producer.
- No init() functions — explicit initialization in main.
- Context propagation: pass `context.Context` as the first parameter.
- Table-driven tests preferred.

## Naming Conventions

- Docker labels: `hlc.<category>.<key>` (e.g., `hlc.backup.strategy=full`)
- API routes: `/api/v1/<resource>` (RESTful)
- Event types: `PascalCase` constants (e.g., `ContainerStarted`, `MountReady`, `BackupCompleted`)
- Policy names: `snake_case` (e.g., `max_stability_mode`, `quiet_hours`)
- Global env keys: `UPPER_SNAKE_CASE` (e.g., `TZ`, `PUID`, `BASE_STACK`)
- Path presets: `{{BASE_STACK}}`, `{{BASE_VOL}}` — resolved at runtime

## Label Schema (V2)

| Label | Values | Description |
|-------|--------|-------------|
| `hlc.role` | `db`, `stateless`, `cache`, `proxy`, `app` | Container's functional role |
| `hlc.update.policy` | `auto`, `manual`, `pin` | How updates are handled |
| `hlc.update.schedule` | cron expression | When auto-updates run |
| `hlc.backup.strategy` | `full`, `db-dump`, `none` | Backup approach |
| `hlc.backup.stop` | `true`, `false` | Stop container before backup |
| `hlc.backup.db-type` | `postgres`, `mariadb`, `mysql`, `redis` | DB type for dump |
| `hlc.stack` | string | Logical stack grouping |
| `hlc.priority` | `critical`, `normal`, `low` | Operational priority |
| `hlc.wait_for_mount` | path(s) | Mount(s) that must be ready before start |
| `hlc.startup.order` | integer | Boot sequence order within stack |
| `hlc.homepage.url` | URL | Link to this service's web UI |

## Homepage Integration

- Configurable `homepage_url` setting — link in nav header to gethomepage instance.
- Status API endpoint: `GET /api/v1/status` returns:
```json
{
  "msm_active": true,
  "containers": { "running": 9, "stopped": 2, "unhealthy": 1 },
  "backups": { "last_success": "2026-03-30T01:00:00Z", "pending_failures": 0 },
  "updates": { "available": 3 },
  "mounts": { "healthy": 2, "degraded": 0, "offline": 0 }
}
```
