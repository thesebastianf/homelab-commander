# Homelab Commander — Project Documentation

> **Version:** 1.0.0 (Iteration 0)
> **Last Updated:** April 15, 2026
> **Status:** Feature-complete foundation — all core features implemented, ready for integration testing and Docker deployment.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Project Structure](#4-project-structure)
5. [Database Schema](#5-database-schema)
6. [API Reference](#6-api-reference)
7. [Frontend Components](#7-frontend-components)
8. [Feature Scope](#8-feature-scope)
9. [Configuration](#9-configuration)
10. [Deployment](#10-deployment)
11. [Development Guide](#11-development-guide)
12. [Security Model](#12-security-model)
13. [WebSocket Events](#13-websocket-events)
14. [Background Services](#14-background-services)

---

## 1. Project Overview

**Homelab Commander** is a self-hosted Docker management dashboard designed for homelab operators. It provides a single-pane-of-glass view to manage containers, Docker Compose stacks, images, volumes, and networks — plus advanced homelab features like automated backups, smart device-triggered startup, port conflict management, and multi-channel notifications.

### Design Principles

- **Self-contained:** Runs as a single `docker compose up` with zero external dependencies.
- **Homelab-first:** Features tailored for home server operators (NAS integration, device-triggered containers, port planning).
- **Read-only filesystem:** Frontend container runs with `read_only: true` for security.
- **No cloud dependency:** All data stays local in PostgreSQL. No telemetry, no external API calls (except optional Docker Hub update checks and notification webhooks).

### What It Manages

| Resource       | Operations                                                   |
| -------------- | ------------------------------------------------------------ |
| **Containers** | List, start, stop, restart, remove, live logs, live stats    |
| **Stacks**     | Create from templates, edit compose/env, deploy, version history, git sync |
| **Images**     | List, pull, remove, update detection                         |
| **Volumes**    | List, create, remove, inspect                                |
| **Networks**   | List, create, remove, inspect                                |
| **Backups**    | Per-stack config, scheduled cron jobs, DB dumps, retention policies |
| **Ports**      | Range reservations, conflict detection, color-coded groups   |
| **Alerts**     | Telegram, Discord, Slack, email, webhook notifications       |
| **Smart Start**| Auto-start containers when devices come online (ping/IP)     |

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     User Browser                        │
│                   http://host:3210                       │
└──────────────────────┬──────────────────────────────────┘
                       │
          ┌────────────▼────────────┐
          │    NGINX (Frontend)     │
          │    Static SPA + Proxy   │
          │    Port 3210 → :80      │
          └────┬──────────┬─────────┘
               │          │
     /api/*    │          │  /ws/*
     /healthz  │          │
               │          │
          ┌────▼──────────▼─────────┐
          │   Express (Backend)     │
          │   Port 3001             │
          │                         │
          │  ┌───────────────────┐  │
          │  │ REST API (12 mods)│  │
          │  │ WebSocket Server  │  │
          │  │ Background Jobs   │  │
          │  │  • Backup Cron    │  │
          │  │  • Smart Startup  │  │
          │  │  • Update Checker │  │
          │  │  • Threshold Mon. │  │
          │  └───────────────────┘  │
          └────┬──────────┬─────────┘
               │          │
    ┌──────────▼──┐  ┌────▼──────────┐
    │ PostgreSQL  │  │ Docker Socket │
    │ :5432       │  │ /var/run/     │
    │ 9 tables    │  │ docker.sock   │
    └─────────────┘  └───────────────┘
```

### Request Flow

1. Browser loads SPA from NGINX (static files).
2. All `/api/*` requests are reverse-proxied by NGINX to the Express backend on port 3001.
3. WebSocket connections (`/ws/*`) are upgraded and proxied to the backend.
4. Express validates requests with Zod schemas, interacts with Docker via Dockerode and PostgreSQL via `pg`.
5. Background services (cron, polling) run inside the backend process.

### Container Topology (Production)

| Service    | Image               | Port          | Volumes                        |
| ---------- | ------------------- | ------------- | ------------------------------ |
| `frontend` | Custom (nginx:alpine) | 3210→80     | None (read-only)               |
| `backend`  | Custom (node:22-alpine) | 3001→3001 | docker.sock, stacks, backups   |
| `db`       | postgres:16-alpine  | (internal)    | pg_data, init.sql              |

---

## 3. Technology Stack

### Frontend

| Technology         | Version | Purpose                        |
| ------------------ | ------- | ------------------------------ |
| React              | 19      | UI framework                   |
| TypeScript         | 5.7     | Type safety                    |
| Vite               | 7       | Build tool + dev server        |
| TailwindCSS        | 4       | Utility-first styling          |
| shadcn/ui          | Latest  | Component library (46 components) |
| @tanstack/react-query | 5    | Server state management        |
| Recharts           | 2       | Dashboard charts               |
| Lucide React       | Latest  | Icon library                   |
| Sonner             | 2       | Toast notifications            |
| date-fns           | 3       | Date formatting                |
| Zod                | 3       | Client-side validation         |
| Framer Motion      | 12      | Animations                     |

### Backend

| Technology         | Version | Purpose                        |
| ------------------ | ------- | ------------------------------ |
| Node.js            | 22      | Runtime                        |
| Express            | 5       | HTTP framework                 |
| TypeScript         | 5.7     | Type safety                    |
| Dockerode          | 4       | Docker Engine API client       |
| pg                 | 8       | PostgreSQL driver              |
| ws                 | 8       | WebSocket server               |
| Zod                | 3       | Request validation             |
| Pino               | 9       | Structured logging             |
| node-cron          | 3       | Backup scheduling              |
| Nodemailer         | 6       | Email notifications            |
| Helmet             | 8       | Security headers               |
| express-rate-limit | 7       | Rate limiting                  |

### Infrastructure

| Technology         | Version | Purpose                        |
| ------------------ | ------- | ------------------------------ |
| Docker Compose     | 3.x     | Orchestration                  |
| PostgreSQL         | 16      | Persistent storage             |
| NGINX              | Alpine  | Static serving + reverse proxy |

---

## 4. Project Structure

```
iteration0/
├── docker-compose.yml          # Production compose
├── docker-compose.dev.yml      # Development overrides
├── .env                        # Environment variables
├── .env.example                # Template for .env
│
├── db/
│   └── init.sql                # Full database schema (9 tables)
│
├── backend/
│   ├── Dockerfile              # Multi-stage: dev + production
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts            # Entry point: middleware + route registration
│       ├── config.ts           # Environment config object
│       ├── database.ts         # pg Pool + init
│       ├── logger.ts           # Pino logger
│       ├── websocket.ts        # WebSocket server (logs, stats, events)
│       ├── lib/
│       │   ├── asyncHandler.ts # Async error wrapper for Express
│       │   └── audit.ts        # Audit log helper
│       ├── middleware/
│       │   ├── basicAuth.ts    # Optional HTTP Basic auth
│       │   ├── errorHandler.ts # Global error handler
│       │   └── validate.ts     # Zod validation middleware
│       ├── routes/             # 12 route modules
│       │   ├── health.ts       # GET /healthz, /readyz
│       │   ├── containers.ts   # CRUD + lifecycle
│       │   ├── images.ts       # List, pull, remove
│       │   ├── volumes.ts      # CRUD
│       │   ├── networks.ts     # CRUD
│       │   ├── system.ts       # Info, df, prune (granular)
│       │   ├── settings.ts     # Singleton settings
│       │   ├── stacks.ts       # CRUD + deploy/stop/restart + versions
│       │   ├── backups.ts      # Config + jobs + run
│       │   ├── notificationServices.ts  # CRUD + test
│       │   ├── portReservations.ts      # CRUD
│       │   └── smartStartup.ts          # CRUD
│       ├── services/           # Business logic
│       │   ├── docker.ts       # All Docker operations via Dockerode
│       │   ├── backups.ts      # Backup execution (tar + pg_dump)
│       │   ├── backupScheduler.ts  # Cron scheduling
│       │   ├── notifications.ts    # Multi-channel dispatch
│       │   ├── smartStartup.ts     # Device polling + auto-start
│       │   └── updates.ts         # Docker Hub update checking
│       └── validation/
│           └── schemas.ts      # All Zod schemas
│
├── frontend/
│   ├── Dockerfile              # Multi-stage: dev + production (nginx)
│   ├── nginx.conf              # Reverse proxy + SPA config
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts          # Vite + TailwindCSS + dev proxy
│   ├── index.html              # SPA entry point
│   └── src/
│       ├── App.tsx             # Main app: tabs, dialogs, state
│       ├── main.tsx            # React root + QueryClient + ErrorBoundary
│       ├── index.css           # Tailwind imports + theme
│       ├── lib/
│       │   ├── types.ts        # All TypeScript interfaces (15+)
│       │   ├── api.ts          # All fetch functions (48 endpoints)
│       │   └── utils.ts        # cn() helper
│       ├── hooks/              # React Query hooks (9 files)
│       │   ├── useContainers.ts
│       │   ├── useImages.ts
│       │   ├── useStacks.ts
│       │   ├── useVolumes.ts
│       │   ├── useNetworks.ts
│       │   ├── useSettings.ts
│       │   ├── useBackups.ts
│       │   ├── useServices.ts  # Notifications + Ports + Smart Startup
│       │   └── use-mobile.ts
│       └── components/
│           ├── App-level components (17 files)
│           └── ui/             # shadcn/ui primitives (46 files)
│
└── SVGmocks/                   # UI mockup reference files
```

---

## 5. Database Schema

**Engine:** PostgreSQL 16 with `pgcrypto` extension (for `gen_random_uuid()`).

### Tables

#### `settings` (singleton — always id=1)

| Column                 | Type        | Default                     | Notes |
| ---------------------- | ----------- | --------------------------- | ----- |
| id                     | INTEGER PK  | 1 (CHECK id=1)             | Singleton |
| docker_host            | TEXT        | `/var/run/docker.sock`      | |
| refresh_interval       | INTEGER     | 5                           | Seconds |
| max_log_lines          | INTEGER     | 200                         | |
| auto_update            | BOOLEAN     | false                       | |
| global_update_freeze   | BOOLEAN     | false                       | |
| stacks_base_path       | TEXT        | `/data/stacks`              | |
| volumes_base_path      | TEXT        | `/data/volumes`             | |
| backups_base_path      | TEXT        | `/data/backups`             | |
| notification_config    | JSONB       | `{enabled, events, thresholds}` | |
| home_assistant_config  | JSONB       | `{enabled, baseUrl, accessToken, entityPrefix}` | |
| created_at             | TIMESTAMPTZ | NOW()                       | |
| updated_at             | TIMESTAMPTZ | NOW()                       | |

#### `stacks`

| Column          | Type        | Notes |
| --------------- | ----------- | ----- |
| id              | UUID PK     | gen_random_uuid() |
| name            | TEXT UNIQUE | Stack name |
| description     | TEXT        | |
| stack_path      | TEXT NOT NULL | Compose file directory |
| compose_content | TEXT        | docker-compose.yml content |
| env_content     | TEXT        | .env content |
| volume_path     | TEXT        | Custom volume path |
| git_repo_config | JSONB       | `{enabled, repoUrl, branch, composePath, autoSync}` |
| status          | TEXT        | running/stopped/failed/deploying |
| services        | INTEGER     | Service count |
| version         | INTEGER     | Current version number |
| auto_update     | BOOLEAN     | |
| created_at      | TIMESTAMPTZ | |
| updated_at      | TIMESTAMPTZ | |

#### `stack_versions`

| Column          | Type        | Notes |
| --------------- | ----------- | ----- |
| id              | UUID PK     | |
| stack_id        | UUID FK→stacks | CASCADE delete |
| version         | INTEGER     | Version number |
| compose_content | TEXT        | Snapshot |
| env_content     | TEXT        | Snapshot |
| description     | TEXT        | Change description |
| created_at      | TIMESTAMPTZ | |

Index: `(stack_id, version DESC)`

#### `backup_configs` (one per stack)

| Column               | Type    | Default | Notes |
| -------------------- | ------- | ------- | ----- |
| id                   | UUID PK | | |
| stack_id             | UUID FK UNIQUE | | One config per stack |
| enabled              | BOOLEAN | false   | |
| cron_schedule        | TEXT    | `0 2 * * *` | |
| retention_days       | INTEGER | 7       | Simple mode |
| include_stack_folder | BOOLEAN | true    | |
| include_volumes      | BOOLEAN | true    | |
| include_databases    | BOOLEAN | false   | |
| database_type        | TEXT    | `none`  | postgres/mysql/mongo/none |
| database_config      | JSONB   | `{}`    | containerName, databaseName |
| compression_level    | INTEGER | 6       | 1-9 |
| encrypted            | BOOLEAN | false   | |
| incremental          | BOOLEAN | false   | |
| use_advanced_retention | BOOLEAN | false | |
| retention_policy     | JSONB   | `{daily:7,weekly:4,monthly:6,yearly:1}` | Advanced mode |

#### `backup_jobs`

| Column        | Type        | Notes |
| ------------- | ----------- | ----- |
| id            | UUID PK     | |
| stack_id      | UUID FK     | |
| status        | TEXT        | completed/failed/in-progress |
| size_bytes    | BIGINT      | |
| backup_path   | TEXT        | Archive location |
| includes      | JSONB       | What was backed up |
| error_message | TEXT        | If failed |
| started_at    | TIMESTAMPTZ | |
| completed_at  | TIMESTAMPTZ | |

Index: `(stack_id, started_at DESC)`

#### `notification_services`

| Column   | Type    | Notes |
| -------- | ------- | ----- |
| id       | UUID PK | |
| name     | TEXT    | Display name |
| type     | TEXT    | telegram/discord/slack/email/webhook |
| enabled  | BOOLEAN | |
| config   | JSONB   | Channel-specific config (botToken, chatId, webhookUrl, etc.) |

#### `port_reservations`

| Column          | Type    | Notes |
| --------------- | ------- | ----- |
| id              | UUID PK | |
| name            | TEXT    | Reservation name |
| description     | TEXT    | |
| port_range_start | INTEGER | 1-65535 |
| port_range_end  | INTEGER | 1-65535, ≥ start |
| group_name      | TEXT    | Category (Web, Databases, etc.) |
| color           | TEXT    | Hex color for UI |

#### `smart_startup_configs`

| Column       | Type    | Notes |
| ------------ | ------- | ----- |
| id           | UUID PK | |
| target_type  | TEXT    | container/stack |
| target_id    | TEXT    | Container/stack identifier |
| trigger_type | TEXT    | ping/ip/nas/device |
| trigger_value | TEXT   | IP address or hostname |
| auto_start   | BOOLEAN | |
| start_delay  | INTEGER | Seconds after device detected |
| enabled      | BOOLEAN | |

#### `audit_log`

| Column        | Type        | Notes |
| ------------- | ----------- | ----- |
| id            | UUID PK     | |
| action        | TEXT        | e.g., container.start, stack.deploy |
| resource_type | TEXT        | container/stack/image/etc. |
| resource_id   | TEXT        | |
| details       | JSONB       | Action metadata |
| created_at    | TIMESTAMPTZ | |

Indexes: `(created_at DESC)`, `(resource_type, resource_id)`

---

## 6. API Reference

Base URL: `/api`

### Containers — `/api/containers`

| Method | Path                    | Body/Params | Description |
| ------ | ----------------------- | ----------- | ----------- |
| GET    | `/`                     | —           | List all containers |
| GET    | `/:id`                 | —           | Get single container |
| GET    | `/:id/stats`           | —           | Live CPU/memory stats |
| GET    | `/:id/logs?tail=100`   | —           | Fetch log lines |
| POST   | `/:id/start`           | —           | Start container |
| POST   | `/:id/stop`            | —           | Stop container |
| POST   | `/:id/restart`         | —           | Restart container |
| DELETE | `/:id?force=false`     | —           | Remove container |

### Images — `/api/images`

| Method | Path       | Body              | Description |
| ------ | ---------- | ----------------- | ----------- |
| GET    | `/`        | —                 | List all images |
| POST   | `/pull`    | `{name, tag}`     | Pull from registry |
| DELETE | `/:id?force=false` | —          | Remove image |

### Volumes — `/api/volumes`

| Method | Path       | Body              | Description |
| ------ | ---------- | ----------------- | ----------- |
| GET    | `/`        | —                 | List all volumes |
| POST   | `/`        | `{name, driver}`  | Create volume |
| DELETE | `/:name`   | —                 | Remove volume |

### Networks — `/api/networks`

| Method | Path       | Body              | Description |
| ------ | ---------- | ----------------- | ----------- |
| GET    | `/`        | —                 | List all networks |
| POST   | `/`        | `{name, driver}`  | Create network |
| DELETE | `/:id`     | —                 | Remove network |

### System — `/api/system`

| Method | Path              | Description |
| ------ | ----------------- | ----------- |
| GET    | `/info`           | Docker system info (containers, images, version, OS) |
| GET    | `/df`             | Disk usage by resource type |
| POST   | `/prune`          | Full system prune (all unused resources) |
| POST   | `/prune/images`   | Prune unused images only |
| POST   | `/prune/volumes`  | Prune unused volumes only |
| POST   | `/prune/containers` | Prune stopped containers only |
| POST   | `/prune/networks` | Prune unused networks only |

### Settings — `/api/settings`

| Method | Path | Body | Description |
| ------ | ---- | ---- | ----------- |
| GET    | `/`  | —    | Get all settings |
| PUT    | `/`  | Partial settings object | Update settings |

Settings body may include: `dockerHost`, `refreshInterval`, `maxLogLines`, `autoUpdate`, `globalUpdateFreeze`, `stacksBasePath`, `volumesBasePath`, `backupsBasePath`, `notificationConfig`, `homeAssistantConfig`.

### Stacks — `/api/stacks`

| Method | Path                        | Body | Description |
| ------ | --------------------------- | ---- | ----------- |
| GET    | `/`                         | —    | List all stacks |
| GET    | `/:id`                      | —    | Get stack with versions |
| POST   | `/`                         | `{name, description?, composeContent, envContent?}` | Create stack |
| PUT    | `/:id`                      | Partial stack fields | Update stack (auto-versions) |
| DELETE | `/:id`                      | —    | Delete stack |
| POST   | `/:id/deploy`               | —    | Deploy (docker compose up -d) |
| POST   | `/:id/stop`                 | —    | Stop (docker compose down) |
| POST   | `/:id/restart`              | —    | Restart stack |
| GET    | `/:id/versions`             | —    | List version history |
| POST   | `/:id/restore/:version`     | —    | Restore to specific version |

### Backups — `/api/backups`

| Method | Path                    | Body | Description |
| ------ | ----------------------- | ---- | ----------- |
| GET    | `/:stackId/config`      | —    | Get backup config for stack |
| PUT    | `/:stackId/config`      | Partial BackupConfig | Update backup config |
| GET    | `/:stackId/jobs`        | —    | List backup jobs |
| POST   | `/:stackId/run`         | —    | Trigger manual backup |

### Notification Services — `/api/notifications`

| Method | Path         | Body | Description |
| ------ | ------------ | ---- | ----------- |
| GET    | `/`          | —    | List all services |
| POST   | `/`          | `{name, type, enabled, config}` | Create service |
| PUT    | `/:id`       | Partial fields | Update service |
| DELETE | `/:id`       | —    | Delete service |
| POST   | `/:id/test`  | —    | Send test notification |

### Port Reservations — `/api/ports`

| Method | Path    | Body | Description |
| ------ | ------- | ---- | ----------- |
| GET    | `/`     | —    | List all reservations |
| POST   | `/`     | `{name, portRangeStart, portRangeEnd, groupName, color}` | Create reservation |
| DELETE | `/:id`  | —    | Delete reservation |

### Smart Startup — `/api/smart-startup`

| Method | Path    | Body | Description |
| ------ | ------- | ---- | ----------- |
| GET    | `/`     | —    | List all configs |
| POST   | `/`     | `{targetType, targetId, triggerType, triggerValue, ...}` | Create config |
| PUT    | `/:id`  | Partial fields | Update config |
| DELETE | `/:id`  | —    | Delete config |

### Health — `/` (root)

| Method | Path       | Description |
| ------ | ---------- | ----------- |
| GET    | `/healthz` | Liveness probe (always 200) |
| GET    | `/readyz`  | Readiness probe (checks DB connection) |

---

## 7. Frontend Components

### App Shell (`App.tsx`)

Single-page tabbed interface with 6 main tabs:
- **Dashboard** — Metric cards (containers, images, stacks, volumes), system info
- **Containers** — Grid of ContainerCards with search and status filter
- **Stacks** — StacksList with compose/env inline editing
- **Images** — Grid of ImageCards with pull dialog
- **Volumes** — Grid of VolumeCards
- **Networks** — Grid of NetworkCards

Plus a header toolbar with: global update freeze badge, settings button, maintenance button, backup button, port registry button, aggregated logs button.

### Dialog Components

| Component | Trigger | Features |
| --------- | ------- | -------- |
| `SettingsDialog` | Header gear icon | 3 tabs: General (paths, intervals, update freeze), Notifications (enable events, thresholds), Integrations (Home Assistant) |
| `MaintenanceDialog` | Header wrench icon | System disk usage from `/api/system/df`, granular prune (images/volumes/containers), full system prune danger card |
| `BackupManagementDialog` | Header save icon | 3 tabs: Stack Backups (per-stack accordion: schedule, retention simple/advanced, contents, DB dumps, advanced options), History (job list), Settings (backup path, NAS pull script) |
| `PortRegistryDialog` | Header list icon | Stats bar (6 metrics), search, 3 tabs: Timeline (range visualization), Port Mappings (conflict badges), Range Reservations (6 presets, create form, progress bars) |
| `NewStackDialog` | Stacks tab + button | 5 templates (Blank/Nginx/WordPress/PostgreSQL/Prometheus), name input, compose editor, env editor, port conflict detection with auto-resolve |
| `EnhancedStackEditorDialog` | Stack edit action | 5 tabs: Compose (YAML editor with copy path), .env editor, Git Sync (toggle/URL/branch/auto-sync), Versions (list/restore), Compare (side-by-side version diff) |
| `NotificationServicesDialog` | Settings → Notifications | CRUD for Telegram/Discord/Slack/Email/Webhook with per-type config forms and test button |
| `SmartStartupDialog` | Header zap icon | Create/edit rules: target (container/stack), trigger (ping/IP/NAS/device), auto-start toggle, delay |
| `AggregatedLogs` | Header terminal icon | Real-time log viewer with search, level filter, auto-scroll toggle |

### Card Components

| Component | Displays | Actions |
| --------- | -------- | ------- |
| `MetricCard` | Label, value, icon, trend | Click for detail |
| `ContainerCard` | Name, image, status, CPU/mem, ports, restart policy, Smart Start badge | Start/Stop/Restart/Remove/Logs/Terminal |
| `StackCard` | Name, status, services, version, auto-update badge | Deploy/Stop/Restart/Edit/Delete |
| `ImageCard` | Repository:tag, size, created, in-use badge, update badge | Pull update/Remove/Copy ID |
| `VolumeCard` | Name, driver, mountpoint, size, containers | Remove/Inspect |
| `NetworkCard` | Name, driver, scope, containers | Remove/Inspect |

### Hooks (React Query)

All data fetching uses `@tanstack/react-query` with automatic refetching, cache invalidation on mutations, and optimistic updates.

| Hook File | Queries | Mutations |
| --------- | ------- | --------- |
| `useContainers.ts` | containers, container, stats, logs | start, stop, restart, remove |
| `useImages.ts` | images | pull, remove |
| `useStacks.ts` | stacks, stack | create, update, delete, deploy, stop, restart |
| `useVolumes.ts` | volumes | create, remove |
| `useNetworks.ts` | networks | create, remove |
| `useSettings.ts` | settings, systemInfo | updateSettings, pruneSystem |
| `useBackups.ts` | backupConfig, backupJobs | updateConfig, runBackup |
| `useServices.ts` | notificationServices, portReservations, smartStartupConfigs | CRUD for each |

---

## 8. Feature Scope

### Core Docker Management

- [x] Container lifecycle (start/stop/restart/remove)
- [x] Container live stats (CPU, memory, network I/O)
- [x] Container logs (tail with WebSocket streaming)
- [x] Image management (list, pull, remove)
- [x] Volume management (list, create, remove)
- [x] Network management (list, create, remove)
- [x] System info and disk usage
- [x] Granular prune (per resource type)

### Stack Management

- [x] Create stacks from 5 templates (Blank, Nginx, WordPress+MySQL, PostgreSQL+pgAdmin, Prometheus+Grafana)
- [x] Compose YAML editor
- [x] Environment file editor
- [x] Deploy / Stop / Restart stacks (via docker compose CLI)
- [x] Version history with side-by-side comparison
- [x] Version restore
- [x] Git sync configuration (repo URL, branch, compose path, auto-sync)
- [x] Port conflict detection on creation with auto-resolve

### Backup System

- [x] Per-stack backup configuration
- [x] Cron-based automated scheduling (hourly/daily/weekly/monthly)
- [x] Simple retention (N days) or advanced (daily/weekly/monthly/yearly counts)
- [x] Backup contents: stack folder, Docker volumes, database dumps
- [x] Database dump support: PostgreSQL, MySQL/MariaDB, MongoDB
- [x] Compression level control (1-9)
- [x] Encryption toggle
- [x] Incremental backup toggle
- [x] Manual "Run Now" trigger
- [x] Job history with status and size
- [x] NAS pull script generation (rsync)

### Notifications

- [x] 5 channels: Telegram, Discord, Slack, Email, Webhook
- [x] Per-event enable/disable (container start/stop/error, high CPU/memory, update available, backup complete/fail)
- [x] CPU and memory threshold configuration
- [x] Test notification button
- [x] Background threshold monitor with periodic checks

### Smart Startup

- [x] Trigger types: Ping, IP, NAS, Device
- [x] Target: individual containers or entire stacks
- [x] Configurable start delay
- [x] Auto-start toggle
- [x] Background device polling (30-second interval)

### Port Registry

- [x] Automatic port usage detection from containers and stacks
- [x] Conflict detection with badge indicators
- [x] Range reservations with custom name and description
- [x] 6 presets: Web Services, Databases, Monitoring, Media, Home Automation, Dev/CI-CD
- [x] Color-coded groups with progress visualization
- [x] Search/filter across ports and services

### Settings & Integrations

- [x] Docker host configuration
- [x] Refresh interval, max log lines
- [x] Auto-update toggle with global freeze
- [x] Base paths for stacks, volumes, backups
- [x] Home Assistant integration (entity prefix, access token, base URL)
- [x] Optional HTTP Basic authentication

### Update Detection

- [x] Docker Hub registry digest comparison
- [x] Update-available badges on container and image cards
- [x] Global update freeze to prevent auto-updates

---

## 9. Configuration

### Environment Variables

| Variable          | Default                    | Description |
| ----------------- | -------------------------- | ----------- |
| `FRONTEND_PORT`   | `3210`                     | Host port for web UI |
| `BACKEND_PORT`    | `3001`                     | Host port for API (also internal) |
| `POSTGRES_USER`   | `hlc`                      | Database user |
| `POSTGRES_PASSWORD` | `hlc_secret_change_me`   | Database password — **change in production** |
| `POSTGRES_DB`     | `hlc`                      | Database name |
| `NODE_ENV`        | `production`               | Node environment |
| `LOG_LEVEL`       | `info`                     | Pino log level (debug/info/warn/error) |
| `STACKS_PATH`     | `/data/stacks`             | Path inside backend container for stack files |
| `BACKUPS_PATH`    | `/data/backups`            | Path inside backend container for backups |
| `AUTH_USER`       | _(empty = disabled)_       | Basic auth username |
| `AUTH_PASS`       | _(empty = disabled)_       | Basic auth password |
| `CORS_ORIGIN`     | _(empty)_                  | Allowed CORS origin (dev mode) |

### Vite Dev Proxy

During development, Vite proxies `/api/*`, `/ws/*`, `/healthz`, `/readyz` to `http://localhost:3001`.

---

## 10. Deployment

### Production (Recommended)

```bash
# Clone and navigate to iteration0
cd DOCKERVERSION/iteration0

# Copy and edit environment
cp .env.example .env
# Edit .env: set POSTGRES_PASSWORD, AUTH_USER/PASS, etc.

# Build and start
docker compose up -d --build

# Access at http://your-host:3210
```

### Development

```bash
# Start with dev overrides (hot-reload for both frontend and backend)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Frontend: http://localhost:5173 (Vite dev server)
# Backend: http://localhost:3001 (tsx watch)
```

### Without Docker (Local Dev)

```bash
# Terminal 1: Database
docker run -d --name hlc-db -p 5432:5432 \
  -e POSTGRES_USER=hlc -e POSTGRES_PASSWORD=hlc_secret_change_me -e POSTGRES_DB=hlc \
  -v ./db/init.sql:/docker-entrypoint-initdb.d/init.sql \
  postgres:16-alpine

# Terminal 2: Backend
cd backend
npm install
DATABASE_URL=postgresql://hlc:hlc_secret_change_me@localhost:5432/hlc npm run dev

# Terminal 3: Frontend
cd frontend
npm install
npm run dev
# Open http://localhost:5173
```

---

## 11. Development Guide

### Adding a New API Resource

1. **Schema:** Add a table to `db/init.sql`.
2. **Types:** Add TypeScript interface to `frontend/src/lib/types.ts`.
3. **Validation:** Add Zod schema to `backend/src/validation/schemas.ts`.
4. **Route:** Create `backend/src/routes/yourResource.ts` with Express router. Use `asyncHandler()` and `validate()` middleware.
5. **Register:** Mount the router in `backend/src/index.ts`.
6. **API functions:** Add fetch/create/update/delete to `frontend/src/lib/api.ts`.
7. **Hook:** Create `frontend/src/hooks/useYourResource.ts` with React Query hooks.
8. **Component:** Create the UI component in `frontend/src/components/`.

### Coding Conventions

- **Backend route pattern:** `asyncHandler(async (req, res) => { ... res.json(data) })`
- **Validation:** Always use `validate(bodySchema)` or `validate(undefined, paramsSchema)` middleware on routes accepting input.
- **Audit logging:** Call `auditLog(action, resourceType, resourceId, details)` for write operations.
- **Frontend hooks:** One file per resource domain. Name: `useThings()` for queries, `useCreateThing()` for mutations.
- **Components:** Use shadcn/ui primitives from `@/components/ui/`. Import icons from `lucide-react`.
- **Toasts:** Use `toast.success()` / `toast.error()` from `sonner` for user feedback.
- **Path alias:** Use `@/` for imports (maps to `src/`).

### TypeScript

- Frontend: `strictNullChecks: true`, target ES2020, JSX react-jsx.
- Backend: `strict: true`, target ES2022, ESM output.
- Run `./node_modules/.bin/tsc --noEmit` from either `frontend/` or `backend/` to type-check.

---

## 12. Security Model

### Network Security

- NGINX reverse proxy — backend is not directly exposed in production.
- Backend only listens on internal Docker network (`backend:3001`).
- Database has no published ports (internal only).
- `no-new-privileges` security option on all containers.
- Frontend runs `read_only: true` with minimal tmpfs.

### Authentication

- Optional HTTP Basic Auth (set `AUTH_USER` + `AUTH_PASS`).
- Uses constant-time comparison (`timingSafeEqual`) to prevent timing attacks.
- Health endpoints (`/healthz`, `/readyz`) bypass auth.

### Rate Limiting

- Global: 2000 requests per 15-minute window.
- Applied via `express-rate-limit`.

### Input Validation

- All request bodies validated with Zod schemas.
- Container/resource IDs are URI-encoded via `encodeURIComponent()`.
- SQL parameterized queries throughout (no string interpolation).

### Headers

- Helmet.js with configured CSP (self + inline styles for TailwindCSS).
- Standard security headers: X-Frame-Options, X-Content-Type-Options, etc.

### Docker Socket

- The backend mounts `/var/run/docker.sock` (required for Docker management).
- Backend runs as `node` user (non-root) in production.
- Consider using a Docker socket proxy (like Tecnativa's) for additional isolation.

---

## 13. WebSocket Events

The backend exposes three WebSocket endpoints via `ws`:

### `/ws/logs/:containerId`

Streams container logs in real-time. Messages are plain text log lines.

### `/ws/stats/:containerId`

Streams container stats as JSON objects:
```json
{ "cpu": 12.5, "memory": 256000000, "memoryLimit": 1073741824, "networkRx": 1024, "networkTx": 2048 }
```

### `/ws/events`

Broadcasts Docker engine events (container start/stop/die, image pull, etc.) as JSON.

---

## 14. Background Services

Four background services run inside the backend process:

### Backup Scheduler (`backupScheduler.ts`)

- On startup, loads all `backup_configs` where `enabled = true`.
- Schedules each as a `node-cron` job per the `cron_schedule`.
- Triggers `runBackup()` which creates tar.gz archives of stack folders, volumes, and optional database dumps.
- Reschedules when config is updated via API.

### Smart Startup (`smartStartup.ts`)

- Polls every 30 seconds.
- For each enabled config, pings the `trigger_value` (IP/hostname).
- If device becomes reachable and target container/stack is stopped, starts it after `start_delay` seconds.
- Sends notification on auto-start events.

### Update Checker (`updates.ts`)

- Periodically checks Docker Hub registry for newer image digests.
- Compares local image digest against remote `latest` tag.
- Marks containers/images with `updateAvailable: true`.
- Respects `globalUpdateFreeze` setting.

### Threshold Monitor (`notifications.ts`)

- Periodically checks container CPU and memory usage.
- Compares against configured thresholds (default: 80% CPU, 90% memory).
- Sends notification through configured channels when thresholds are exceeded.
