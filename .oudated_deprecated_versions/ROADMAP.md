# 📍 HLC V2 Roadmap (Operator-Grade)

## Phase 1 – Core Discovery (Foundation)
- Docker socket connection via unix transport
- Container listing (name, state, image, labels)
- Docker Events stream (start/stop/die/health)
- Internal Event Bus (typed pub/sub, goroutine-safe)

## Phase 2 – State & Configuration Hub
- SQLite setup (modernc.org/sqlite, pure Go)
- Settings table (key/value)
- **Global Path Presets**: `base_stack_path`, `base_volume_path` → `{{BASE_STACK}}`, `{{BASE_VOL}}`
- **Global Env Store**: Central TZ, PUID, PGID, API keys — shared across stacks
- Policy Engine: MSM (Max Stability Mode), quiet hours, custom rules
- API: `/settings`, `/policies`, `/env-hub`

## Phase 3 – Label Intelligence System
- Parse `hlc.*` Docker labels
- Classification engine: role, update policy, backup strategy
- **New labels**: `hlc.wait_for_mount`, `hlc.startup.condition`, `hlc.homepage.url`
- Grouping (stack detection via compose labels + hlc labels)
- Validation & warnings for misconfigured labels

## Phase 4 – Stack Management (Dockge-Style)
- **Filesystem scanner**: Scan `base_stack_path` for `docker-compose.yml` files
- Stack CRUD: create, edit, delete compose files
- **Env injection**: Write global env vars into stack `.env` files
- **Env propagation**: When global value changes → propose update to all affected stacks
- Stack operations: `docker compose up/down/restart/pull`
- Compose file validation before apply
- API: `/stacks`, `/stacks/:name/compose`, `/stacks/:name/env`

## Phase 5 – NAS Gatekeeper & Scheduler
- **Mount condition checker**: Verify CIFS/NFS mounts before stack startup
  - Anchor-file detection (e.g., `/mnt/nas/.hlc_ready`)
  - Ping/TCP connectivity check
  - Path existence + read test
- **Conditional startup**: Stacks with `hlc.wait_for_mount` wait until mount is ready
- **Boot sequencer**: On HLC startup, check all mounts → start stacks in dependency order
- **Scheduler**: Native Go cron for periodic backup, update checks, mount health
- **Mount health monitor**: Continuous check, emit events on mount loss/recovery
- API: `/mounts`, `/scheduler/jobs`

## Phase 6 – Backup Engine (Critical Path)
- Volume + bind mount detection
- Backup execution:
  1. Optional stop (`hlc.backup.stop=true`)
  2. DB-aware dump (Postgres, MariaDB, MySQL, Redis)
  3. `tar/gzip` or `tar/zstd` archive
- **Stack-level backup**: Backup all containers in a stack, DBs first
- Backup metadata storage (JSON + SQLite)
- Restore simulation (dry-run) + actual restore
- Checksum verification (SHA256)
- Retention policies (auto-prune old backups)
- API: `/backup/:container`, `/backups`, `/restore`

## Phase 7 – Safe Update System
- Registry digest comparison (Docker Hub, ghcr.io, lscr.io)
- Update planner with risk detection (`:latest` tag, DB role, version jumps)
- Execution flow: Policy Check → Backup → Pull → Stop → Rename → Create → Start → Health Check → Cleanup/Rollback
- Respect MSM policy (block all updates when active)
- Stack-level updates (safe ordering: dependencies last)
- API: `/updates/check`, `/updates/plan`, `/updates/execute`

## Phase 8 – Observability Lite
- CPU / RAM stats snapshots via Docker API
- Restart count tracking
- Uptime tracking
- **Mount health status** in stats
- Store minimal history in SQLite (24h default retention)
- API: `/stats`, `/stats/:container/history`

## Phase 9 – Audit & Event System
- Persistent audit log for all significant actions
- Event categories: container, backup, update, policy, system, mount, notification
- Timeline view capability (grouped by day)
- Queryable by category, target, time range
- API: `/audit`, `/audit/timeline`

## Phase 10 – Safety & Access
- Token-based auth (`HLC_API_TOKEN` env var, bcrypt hashed)
- Read-only mode (block mutations via middleware)
- Safe Mode boot (auto-detect DB corruption, socket failure, unclean shutdown)
- Middleware chain: Token → SafeMode → ReadOnly → Handler

## Phase 11 – Notifications (Multi-Channel)
- Notification Dispatcher subscribed to Event Bus
- Built-in channels: Telegram, Discord, Gotify, Ntfy, Email (SMTP), Webhook
- Per-channel event type filtering + severity threshold
- Channel CRUD via API + test endpoint
- Notification history log
- Key events: BackupFailed, UpdateFailed, ContainerDied, MountLost, MSMActivated

## Phase 12 – UI (Glassmorphic Dashboard)
- **Design System**: Glassmorphic dark theme with mesh gradient background, Inter font
  - Background: `#07080d` with layered radial gradient overlays (blue, purple, green tints)
  - Glass cards: `rgba(14,17,30,.55)` + `backdrop-filter: blur(16px)` + ultra-thin `rgba(255,255,255,.06)` borders
  - Color palette: accent `#6c8cff`, green `#3ee8b5`, yellow `#f0c050`, red `#ff6b6b`, purple `#a78bfa`
  - 14px border-radius on cards, gradient headings, hover glow transitions
- **Navigation**: 72px icon-only rail sidebar with SVG feather icons, tooltip on hover, gradient "H" logo, active-state accent bar
- **Dashboard**: Bento grid layout — ring chart (fleet health), CPU/Memory sparkline cards, MSM banner, NAS mount status bar (3 mounts), container table with inline resource bars, role pills, NAS badges, update dots
- **Stack Editor** (Dockge-style 3-panel):
  - Left (58%): Monaco YAML editor with syntax highlighting
  - Top-right: Env variable table with Global/Local/Path Preset source badges + "Inject Global Envs" button
  - Bottom-right: Streaming log output with colored service names
  - Glass action bar with stack status pill, NAS tag, Up/Down/Restart/Pull/Save buttons
- **Container Detail**: Breadcrumb nav, glass info cards (2-col grid), resource gauge bars, HLC labels, volumes, recent backups, env vars with source badges, live log tail
- **Backups**: 4 stat cards (total/today/storage/failed), animated progress banner, filter pills + search, glass table with type/status badges
- **Settings**: 7-tab pill bar (General, Paths, Env Hub, NAS, Policies, Backups, Security), glass toggle switches, form inputs, NAS mount cards with health dots
- **Notifications**: 6 channel cards (Telegram, Discord, Gotify, Ntfy, Email, Webhook) with gradient icon backgrounds, config panel, event subscription chips, delivery history table
- **Audit Log**: Category filter pills, vertical timeline with color-coded dots (green/blue/yellow/red/purple), glass entry cards with icon + badge system
- **Migration Wizard**: 4-step stepper with done/active states, path remapping table with editable inputs, warning box, export summary grid
- **Homepage cross-link**: Configurable link in nav header
- **Status API**: Compact JSON for gethomepage widgets
- Live updates via SSE (Event Bus → browser)
- Progressive enhancement (works without JS for basic viewing)

## Phase 13 – Migration Wizard
- **Export**: Package all stacks (compose files + .env) + HLC database + settings
- **Import**: Restore wizard — map old paths to new paths, validate, apply
- **Server move**: One-click export → copy to new server → import wizard
- Backup archives optional include/exclude
- API: `/migrate/export`, `/migrate/import`

## Phase 14 – Advanced (Future)
- S3/MinIO/B2 backup targets (upload after local backup)
- Multi-node support (agent per node, central coordinator) — design only
- Webhook templates (customizable notification payloads)
