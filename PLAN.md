# HLC (Homelab Command) — Docker Version Migration Plan

## Changelog

- **iteration0 gap fix (2026-04-15):** Aligned init.sql schema with PLAN.md spec (added `home_assistant_config` to settings, `git_repo_config`/`volume_path` to stacks, `database_config`/`encrypted`/`incremental` to backup_configs). Fixed backend settings route to handle Home Assistant config. Added `restartPolicy` to container list mapping. Added granular prune endpoints. Implemented all missing frontend features: stack templates, port conflict detection, Git Sync tab, Compare tab, advanced backup retention, DB dump config, NAS pull script, port registry with tabs/ranges/presets, granular maintenance prune, and `useBackups` hook.

---

## 1. Executive Summary

**Current State:** A GitHub Spark prototype — a single-page React app using `@github/spark` KV storage and `window.spark.llm()` for AI features. All data is generated from `demoData.ts` (mock containers, images, stacks, volumes, networks, logs). No real Docker daemon interaction exists. The UI is fully functional but operates on fake data with simulated state changes.

**Target State:** A production-ready, self-hosted Docker container management platform with:
- **Frontend** — React SPA (reuses existing UI components)
- **Backend** — Node.js/Express API server communicating with the Docker daemon
- **Database** — PostgreSQL for persistent settings, stack versions, backup configs, port reservations, and audit logs
- **Docker Compose** — Single `docker-compose.yml` to deploy the entire HLC stack

**Key Principle:** NO mock/demo data. Every piece of data displayed comes from the real Docker daemon or the PostgreSQL database.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Host                          │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │           HLC Docker Compose Stack                │  │
│  │                                                   │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────┐  │  │
│  │  │  Frontend   │  │   Backend    │  │ Postgres│  │  │
│  │  │  (Nginx +   │  │  (Node.js   │  │  (DB)   │  │  │
│  │  │   React)    │──│   Express)   │──│         │  │  │
│  │  │  Port 3000  │  │  Port 3001   │  │ Port    │  │  │
│  │  │             │  │              │  │  5432   │  │  │
│  │  └─────────────┘  └──────┬───────┘  └─────────┘  │  │
│  │                          │                        │  │
│  └──────────────────────────┼────────────────────────┘  │
│                             │                           │
│                    ┌────────▼────────┐                  │
│                    │  Docker Socket  │                  │
│                    │ /var/run/docker │                  │
│                    │    .sock        │                  │
│                    └─────────────────┘                  │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Target Folder Structure

```
DOCKERVERSION/
├── docker-compose.yml              # Production compose file
├── docker-compose.dev.yml          # Development overrides
├── .env.example                    # Environment variable template
├── README.md                       # Setup & usage docs
│
├── frontend/
│   ├── Dockerfile                  # Multi-stage build (build + nginx)
│   ├── nginx.conf                  # Nginx config (SPA routing + API proxy)
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── index.html
│   └── src/
│       ├── main.tsx                # Entry point (no Spark imports)
│       ├── App.tsx                 # Root — fetches from API, no demo data
│       ├── index.css
│       ├── main.css
│       ├── styles/
│       │   └── theme.css           # Copy from Spark version
│       ├── lib/
│       │   ├── types.ts            # Shared types (updated for API)
│       │   ├── utils.ts            # cn() utility
│       │   └── api.ts              # NEW: API client (fetch wrapper)
│       ├── hooks/
│       │   ├── use-mobile.ts       # Keep as-is
│       │   ├── useContainers.ts    # NEW: React Query hook
│       │   ├── useImages.ts        # NEW: React Query hook
│       │   ├── useStacks.ts        # NEW: React Query hook
│       │   ├── useVolumes.ts       # NEW: React Query hook
│       │   ├── useNetworks.ts      # NEW: React Query hook
│       │   ├── useLogs.ts          # NEW: WebSocket-based hook
│       │   ├── useSystemStats.ts   # NEW: React Query hook
│       │   └── useSettings.ts      # NEW: React Query hook
│       ├── components/
│       │   ├── (all existing components — adapted)
│       │   └── ui/
│       │       └── (all shadcn/ui components — copy as-is)
│       └── contexts/
│           └── WebSocketContext.tsx # NEW: WebSocket provider for live data
│
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                # Express server entry
│       ├── config.ts               # Environment config
│       ├── database.ts             # PostgreSQL connection (pg pool)
│       ├── migrations/
│       │   └── 001_initial.sql     # Schema creation
│       ├── routes/
│       │   ├── containers.ts       # /api/containers/*
│       │   ├── images.ts           # /api/images/*
│       │   ├── stacks.ts           # /api/stacks/*
│       │   ├── volumes.ts          # /api/volumes/*
│       │   ├── networks.ts         # /api/networks/*
│       │   ├── system.ts           # /api/system/* (stats, prune, etc.)
│       │   ├── logs.ts             # /api/logs/* + WebSocket
│       │   ├── settings.ts         # /api/settings/*
│       │   ├── backups.ts          # /api/backups/*
│       │   └── ports.ts            # /api/ports/* (port registry)
│       ├── services/
│       │   ├── docker.ts           # Dockerode wrapper for Docker API
│       │   ├── stacks.ts           # Stack CRUD + file management
│       │   ├── backups.ts          # Backup scheduling & execution
│       │   ├── notifications.ts    # Notification dispatching
│       │   ├── updates.ts          # Image update checking
│       │   └── smart-startup.ts    # Device monitoring & auto-start
│       ├── websocket.ts            # WebSocket server (logs, metrics)
│       └── middleware/
│           ├── errorHandler.ts     # Global error handler
│           └── validation.ts       # Request validation (zod)
│
└── db/
    └── init.sql                    # Initial DB setup run by Postgres container
```

---

## 4. Phase-by-Phase Implementation

### Phase 1: Project Scaffolding & Infrastructure
**Goal:** Create the folder structure, Docker Compose, and basic build pipeline.

| # | Task | Details |
|---|------|---------|
| 1.1 | Create `docker-compose.yml` | Three services: `frontend`, `backend`, `postgres`. Mount Docker socket into backend. |
| 1.2 | Create `docker-compose.dev.yml` | Volume-mount source code, enable hot-reload for both frontend and backend. |
| 1.3 | Create `.env.example` | `POSTGRES_PASSWORD`, `POSTGRES_DB`, `HLC_SECRET`, `DOCKER_SOCKET_PATH` |
| 1.4 | Backend Dockerfile | Node 20-alpine, multi-stage (build TS → run JS). |
| 1.5 | Frontend Dockerfile | Multi-stage: Stage 1 = `npm run build`, Stage 2 = nginx serving `dist/`. |
| 1.6 | Nginx config | Serve SPA with `try_files`, proxy `/api/*` and `/ws/*` to backend:3001. |
| 1.7 | PostgreSQL init script | `db/init.sql` — creates database and grants permissions. |

### Phase 2: Backend Core — Docker Daemon Integration
**Goal:** Build the Express API that talks to the real Docker daemon via Dockerode.

| # | Task | Details |
|---|------|---------|
| 2.1 | Express server setup | TypeScript, cors, helmet, compression, JSON body parser. |
| 2.2 | Dockerode service | Connect via `/var/run/docker.sock`. Expose methods: `listContainers()`, `getContainer()`, `startContainer()`, `stopContainer()`, `restartContainer()`, `removeContainer()`, `containerStats()`, `containerLogs()`. |
| 2.3 | Containers routes | `GET /api/containers` — list all (real data). `POST /api/containers/:id/start\|stop\|restart\|remove` — actions. `GET /api/containers/:id/stats` — live stats stream. `GET /api/containers/:id/logs` — log stream. |
| 2.4 | Images routes | `GET /api/images` — list local images. `POST /api/images/pull` — pull image by name:tag. `DELETE /api/images/:id` — remove image. `POST /api/images/:id/tag` — tag image. |
| 2.5 | Volumes routes | `GET /api/volumes` — list volumes with usage info. `DELETE /api/volumes/:name` — remove. `POST /api/volumes` — create volume. |
| 2.6 | Networks routes | `GET /api/networks` — list networks with connected containers. `DELETE /api/networks/:id` — remove. `POST /api/networks` — create network. |
| 2.7 | System routes | `GET /api/system/info` — Docker host info (CPU, memory, disk). `POST /api/system/prune` — prune containers/images/volumes/networks. `GET /api/system/df` — disk usage. |
| 2.8 | WebSocket server | `ws://backend:3001/ws/logs/:containerId` — stream container logs. `ws://backend:3001/ws/stats/:containerId` — stream container stats. `ws://backend:3001/ws/events` — stream Docker events (container start/stop/die). |

### Phase 3: Backend — Database & Persistence Layer
**Goal:** PostgreSQL schema and APIs for data that doesn't live in Docker (settings, stacks metadata, backups, port reservations).

| # | Task | Details |
|---|------|---------|
| 3.1 | Database connection | `pg` pool with connection string from env. Auto-run migrations on startup. |
| 3.2 | Migration 001 | Tables: `settings`, `stacks`, `stack_versions`, `backup_configs`, `backup_jobs`, `notification_services`, `port_reservations`, `smart_startup_configs`, `audit_log`. |
| 3.3 | Settings routes | `GET /api/settings` — load app settings. `PUT /api/settings` — save settings. Singleton row in `settings` table. |
| 3.4 | Stacks routes | `GET /api/stacks` — list stacks (DB metadata + Docker Compose project status). `POST /api/stacks` — create new stack (write compose file to disk, store metadata in DB). `PUT /api/stacks/:id` — update stack (new version in `stack_versions`). `POST /api/stacks/:id/deploy` — run `docker compose up -d` via child process. `POST /api/stacks/:id/stop` — run `docker compose down`. `POST /api/stacks/:id/restart` — down + up. `DELETE /api/stacks/:id` — stop + remove files + delete from DB. `GET /api/stacks/:id/versions` — version history. `POST /api/stacks/:id/restore/:version` — restore previous version. |
| 3.5 | Backup routes | `GET /api/backups` — list all backup jobs. `POST /api/backups/:stackId/run` — trigger manual backup. `PUT /api/backups/:stackId/config` — update backup schedule. `POST /api/backups/:jobId/restore` — restore from backup. |
| 3.6 | Port registry routes | `GET /api/ports` — list reserved port ranges + actual port usage from Docker. `POST /api/ports/reservations` — create port range reservation. `DELETE /api/ports/reservations/:id` — delete reservation. |
| 3.7 | Notification routes | `GET /api/notifications/services` — list configured services. `POST /api/notifications/services` — add service. `PUT /api/notifications/services/:id` — update. `DELETE /api/notifications/services/:id` — delete. `POST /api/notifications/test/:id` — send test notification. |
| 3.8 | Smart startup routes | `GET /api/smart-startup` — list configs. `PUT /api/smart-startup/:id` — update config. Background service monitors network for trigger devices. |

### Phase 4: Frontend Migration
**Goal:** Adapt the existing React UI to consume the real backend API instead of demo data.

| # | Task | Details |
|---|------|---------|
| 4.1 | Strip Spark dependencies | Remove `@github/spark`, `useKV`, `sparkPlugin`, `phosphorIconProxy`. Replace with standard Vite + React setup. Replace `@phosphor-icons/react` with `lucide-react` (already a dependency) OR keep Phosphor (install without Spark proxy). |
| 4.2 | Create API client | `src/lib/api.ts` — typed fetch wrapper. Base URL from env (`VITE_API_URL` or relative `/api`). Error handling, response typing. |
| 4.3 | Create React Query hooks | One hook per resource: `useContainers()`, `useImages()`, `useStacks()`, `useVolumes()`, `useNetworks()`, `useSystemStats()`, `useSettings()`. Each wraps `useQuery` / `useMutation` from `@tanstack/react-query`. Auto-refetch intervals for live data. |
| 4.4 | WebSocket context | `WebSocketContext.tsx` — provides real-time log streaming and Docker event updates. Reconnect logic with exponential backoff. |
| 4.5 | Adapt App.tsx | Remove all `useKV` calls, `generateDemo*` imports, fake state. Replace with React Query hooks. Keep all UI structure, tabs, layout. |
| 4.6 | Adapt ContainerCard | Real start/stop/restart/remove via API mutations. Real-time stats via WebSocket. |
| 4.7 | Adapt StacksList + StackCard | Fetch stacks from API. Deploy/stop/restart trigger real `docker compose` operations via API. |
| 4.8 | Adapt EnhancedStackEditorDialog + NewStackDialog | Save sends to API. Version history from DB. Remove `window.spark.llm()` — AI features either removed or replaced with optional local LLM endpoint setting. |
| 4.9 | Adapt ImageCard | Pull/remove/tag trigger real Docker API calls. |
| 4.10 | Adapt VolumeCard, NetworkCard | Real Docker data, real delete actions. |
| 4.11 | Adapt AggregatedLogs | WebSocket streaming for real container logs. Merge logs from multiple containers. |
| 4.12 | Adapt SettingsDialog | Load/save via `/api/settings`. |
| 4.13 | Adapt MaintenanceDialog | `POST /api/system/prune` for real prune operations. Show actual reclaimable space from `GET /api/system/df`. |
| 4.14 | Adapt NotificationServicesDialog | CRUD via `/api/notifications/services`. Test button sends real test notification. |
| 4.15 | Adapt BackupManagementDialog | Real backup trigger/schedule via API. Show real backup job history. |
| 4.16 | Adapt SmartStartupDialog | Config stored in DB. Backend service monitors trigger devices. |
| 4.17 | Adapt PortRegistryDialog | Port data from Docker + DB reservations via API. |
| 4.18 | Delete demoData.ts | Remove entirely. No mock data remains. |

### Phase 5: Backend Services — Background Jobs
**Goal:** Implement background services for scheduled backups, update checking, smart startup, and notifications.

| # | Task | Details |
|---|------|---------|
| 5.1 | Backup scheduler | `node-cron` or `node-schedule`. Read cron expressions from DB. Execute: stop container → tar volumes → pg_dump (if DB) → compress → store → restart. |
| 5.2 | Update checker | Periodically compare local image digests against registry digests. Store update availability. Optionally auto-pull + recreate if `autoUpdate` is enabled and `globalUpdateFreeze` is off. |
| 5.3 | Smart startup monitor | Ping/check configured trigger devices at intervals. When device becomes reachable, auto-start configured containers/stacks after configured delay. |
| 5.4 | Notification dispatcher | Send alerts via Telegram (Bot API), Discord (webhook), Slack (webhook), Email (nodemailer), or generic Webhook. Triggered by Docker events, backup results, or threshold breaches. |

### Phase 6: Testing, Security & Polish
**Goal:** Harden the application for real-world self-hosted use.

| # | Task | Details |
|---|------|---------|
| 6.1 | Input validation | Zod schemas on all API endpoints. Sanitize compose YAML before writing to disk. Validate port numbers, cron expressions, paths. |
| 6.2 | Security | Docker socket access is inherently privileged — document this. No authentication in v1 (single-user homelab), but add optional basic auth via env var. Helmet headers on backend. CSP on frontend. |
| 6.3 | Error handling | Global Express error handler. Frontend error boundaries per tab (already uses react-error-boundary). Backend returns structured error JSON. |
| 6.4 | Health checks | `GET /api/health` — checks DB connection + Docker socket. Used as Docker healthcheck in compose. |
| 6.5 | Logging | Structured JSON logging on backend (pino or winston). Log level configurable via env. |
| 6.6 | README.md | Installation, configuration, screenshots, update instructions. |

---

## 5. Database Schema (Key Tables)

```sql
-- Application settings (singleton row)
CREATE TABLE settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    stacks_base_path TEXT NOT NULL DEFAULT '/opt/stacks',
    volumes_base_path TEXT NOT NULL DEFAULT '/mnt/docker-volumes',
    backups_base_path TEXT NOT NULL DEFAULT '/mnt/backups',
    auto_update BOOLEAN DEFAULT FALSE,
    global_update_freeze BOOLEAN DEFAULT FALSE,
    notification_config JSONB DEFAULT '{}',
    home_assistant_config JSONB DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stack metadata (compose files stored on disk, metadata in DB)
CREATE TABLE stacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    stack_path TEXT NOT NULL,
    volume_path TEXT,
    env_file TEXT,
    current_version INTEGER DEFAULT 1,
    git_repo_config JSONB,
    smart_startup_config JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stack version history
CREATE TABLE stack_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stack_id UUID REFERENCES stacks(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    compose_content TEXT NOT NULL,
    env_content TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(stack_id, version)
);

-- Backup configuration per stack
CREATE TABLE backup_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stack_id UUID UNIQUE REFERENCES stacks(id) ON DELETE CASCADE,
    enabled BOOLEAN DEFAULT FALSE,
    cron_schedule TEXT,
    retention_days INTEGER DEFAULT 30,
    retention_policy JSONB,
    use_advanced_retention BOOLEAN DEFAULT FALSE,
    include_stack_folder BOOLEAN DEFAULT TRUE,
    include_volumes BOOLEAN DEFAULT TRUE,
    include_databases BOOLEAN DEFAULT FALSE,
    compression_level TEXT DEFAULT 'balanced',
    database_type TEXT,
    database_config JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Backup job history
CREATE TABLE backup_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stack_id UUID REFERENCES stacks(id) ON DELETE SET NULL,
    stack_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('completed', 'failed', 'in-progress')),
    path TEXT,
    size TEXT,
    includes JSONB,
    error_message TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Notification services
CREATE TABLE notification_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('telegram', 'discord', 'slack', 'email', 'webhook')),
    name TEXT NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    config JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Port range reservations
CREATE TABLE port_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    start_port INTEGER NOT NULL CHECK (start_port BETWEEN 1 AND 65535),
    end_port INTEGER NOT NULL CHECK (end_port BETWEEN 1 AND 65535),
    group_name TEXT NOT NULL,
    color TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (end_port >= start_port)
);

-- Smart startup configurations
CREATE TABLE smart_startup_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type TEXT NOT NULL CHECK (target_type IN ('container', 'stack')),
    target_id TEXT NOT NULL,
    enabled BOOLEAN DEFAULT FALSE,
    trigger_device TEXT,
    trigger_type TEXT CHECK (trigger_type IN ('nas', 'device', 'ip', 'ping')),
    trigger_value TEXT,
    auto_start BOOLEAN DEFAULT FALSE,
    start_delay INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(target_type, target_id)
);

-- Audit log
CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 6. API Endpoints Summary

| Method | Endpoint | Source | Description |
|--------|----------|--------|-------------|
| GET | `/api/containers` | Docker | List all containers |
| POST | `/api/containers/:id/start` | Docker | Start container |
| POST | `/api/containers/:id/stop` | Docker | Stop container |
| POST | `/api/containers/:id/restart` | Docker | Restart container |
| DELETE | `/api/containers/:id` | Docker | Remove container |
| GET | `/api/containers/:id/logs` | Docker | Stream logs |
| GET | `/api/containers/:id/stats` | Docker | Stream stats |
| GET | `/api/images` | Docker | List images |
| POST | `/api/images/pull` | Docker | Pull image |
| DELETE | `/api/images/:id` | Docker | Remove image |
| POST | `/api/images/:id/tag` | Docker | Tag image |
| GET | `/api/volumes` | Docker | List volumes |
| POST | `/api/volumes` | Docker | Create volume |
| DELETE | `/api/volumes/:name` | Docker | Remove volume |
| GET | `/api/networks` | Docker | List networks |
| POST | `/api/networks` | Docker | Create network |
| DELETE | `/api/networks/:id` | Docker | Remove network |
| GET | `/api/system/info` | Docker | System info + resource usage |
| GET | `/api/system/df` | Docker | Disk usage |
| POST | `/api/system/prune` | Docker | System prune |
| GET | `/api/stacks` | DB+Disk | List stacks with status |
| POST | `/api/stacks` | DB+Disk | Create stack |
| PUT | `/api/stacks/:id` | DB+Disk | Update stack |
| DELETE | `/api/stacks/:id` | DB+Disk+Docker | Delete stack |
| POST | `/api/stacks/:id/deploy` | Docker | Deploy (docker compose up) |
| POST | `/api/stacks/:id/stop` | Docker | Stop (docker compose down) |
| POST | `/api/stacks/:id/restart` | Docker | Restart stack |
| GET | `/api/stacks/:id/versions` | DB | Version history |
| POST | `/api/stacks/:id/restore/:v` | DB+Disk | Restore version |
| GET | `/api/settings` | DB | Get settings |
| PUT | `/api/settings` | DB | Update settings |
| GET | `/api/backups` | DB | List backup jobs |
| POST | `/api/backups/:stackId/run` | DB+Disk | Trigger backup |
| PUT | `/api/backups/:stackId/config` | DB | Update backup config |
| POST | `/api/backups/:jobId/restore` | Disk | Restore from backup |
| GET | `/api/ports` | Docker+DB | Port usage + reservations |
| POST | `/api/ports/reservations` | DB | Create port reservation |
| DELETE | `/api/ports/reservations/:id` | DB | Delete reservation |
| GET | `/api/notifications/services` | DB | List notification services |
| POST | `/api/notifications/services` | DB | Add service |
| PUT | `/api/notifications/services/:id` | DB | Update service |
| DELETE | `/api/notifications/services/:id` | DB | Delete service |
| POST | `/api/notifications/test/:id` | External | Test notification |
| GET | `/api/smart-startup` | DB | List smart startup configs |
| PUT | `/api/smart-startup/:id` | DB | Update config |
| GET | `/api/health` | Docker+DB | Health check |
| WS | `/ws/logs/:id` | Docker | Stream container logs |
| WS | `/ws/stats/:id` | Docker | Stream container stats |
| WS | `/ws/events` | Docker | Stream Docker events |

---

## 7. Key Technology Decisions

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React 19 + Vite + TailwindCSS 4 | Already in use, mature, fast |
| UI Components | shadcn/ui (Radix) | Already in use, copy-paste friendly |
| State/Fetching | @tanstack/react-query | Already a dependency, handles caching + refetching |
| Backend | Node.js + Express + TypeScript | Same language as frontend, huge ecosystem |
| Docker API | Dockerode | Most popular Node.js Docker client |
| Database | PostgreSQL 16 | Reliable, JSONB for flexible configs |
| DB Client | pg (node-postgres) | Lightweight, no ORM overhead |
| WebSocket | ws | Fast, lightweight WebSocket server |
| Validation | Zod | Already a dependency, shared types possible |
| Scheduling | node-cron | Lightweight cron scheduler for backups |
| Icons | lucide-react OR @phosphor-icons/react | Both available; lucide already a dep |
| Notifications | nodemailer + axios | Email + webhook-based notifications |

---

## 8. What Gets Removed from Spark Version

| Item | Reason |
|------|--------|
| `@github/spark` package | Platform-specific, not available outside Spark |
| `useKV` hook | Replaced by React Query + API calls |
| `window.spark.llm()` calls | Replaced by optional local LLM endpoint or removed |
| `sparkPlugin` (Vite) | Spark-specific |
| `phosphorIconProxy` (Vite) | Spark-specific; use direct Phosphor imports or switch to lucide |
| `demoData.ts` | Entirely removed — all data from Docker daemon / DB |
| `spark.meta.json` | Spark metadata |
| `runtime.config.json` | Spark runtime config |
| Fake `setTimeout`-based actions | Replaced by real async API calls |
| Random metric jitter (`Math.random()`) | Replaced by real Docker stats streaming |

---

## 9. What Gets Kept / Reused

| Item | Notes |
|------|-------|
| All `src/components/ui/*` | shadcn/ui components — copy directly |
| All custom components (19) | Adapt props to use API data instead of demo data |
| `src/lib/types.ts` | Extend for API responses, keep core interfaces |
| `src/lib/utils.ts` | `cn()` utility — copy directly |
| `src/styles/theme.css` | Theming — copy directly |
| `index.css`, `main.css` | Styles — copy directly |
| Tailwind config | Adapt for v4 without Spark plugin |
| Component layout & UX | Tab structure, card layouts, dialog patterns |
| All icons | Keep Phosphor or migrate to lucide |

---

## 10. Docker Compose File (Target)

```yaml
services:
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "${HLC_PORT:-3000}:80"
    depends_on:
      backend:
        condition: service_healthy
    restart: unless-stopped

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "3001:3001"
    environment:
      - DATABASE_URL=postgresql://hlc:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-hlc}
      - DOCKER_SOCKET=/var/run/docker.sock
      - NODE_ENV=production
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ${STACKS_PATH:-./stacks}:/opt/stacks
      - ${BACKUPS_PATH:-./backups}:/mnt/backups
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3001/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=hlc
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=${POSTGRES_DB:-hlc}
    volumes:
      - hlc_pgdata:/var/lib/postgresql/data
      - ./db/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U hlc"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  hlc_pgdata:
```

---

## 11. Implementation Order & Priority

```
Phase 1 (Scaffolding)          ███░░░░░░░  ~1 unit of work
Phase 2 (Docker API Backend)   █████████░  ~3 units (CRITICAL PATH)
Phase 3 (Database Layer)       ██████░░░░  ~2 units
Phase 4 (Frontend Migration)   █████████░  ~3 units (LARGEST)
Phase 5 (Background Services)  ████░░░░░░  ~1.5 units
Phase 6 (Security & Polish)    ███░░░░░░░  ~1 unit
```

**Recommended start order:**
1. Phase 1 → get `docker-compose up` working with empty services
2. Phase 2 → backend can list real containers, images, etc.
3. Phase 3 → settings and stack metadata persist in DB
4. Phase 4 → frontend talks to real backend (start with containers tab, then stacks, then remaining tabs)
5. Phase 5 → background jobs (backups, update checking)
6. Phase 6 → harden everything

---

## 12. Open Decisions

| Decision | Options | Recommendation |
|----------|---------|----------------|
| Authentication | None / Basic Auth / JWT | Basic Auth via env var (optional) for v1 |
| AI features | Remove / Local LLM / OpenAI API key | Optional: env var `LLM_API_URL` for compose generation; skip for v1 |
| Icon library | Keep Phosphor / Switch to Lucide | Keep Phosphor (install directly, no Spark proxy) |
| Stack file storage | Host filesystem / Docker volumes | Host filesystem (bind mount) — user needs to see/edit compose files |
| Terminal access | xterm.js + WebSocket | Phase 2+ feature — attach to container exec session |
| Multi-host | Single Docker socket / Multiple | Single host for v1, extensible later |

---

## 13. Getting Started (After Plan Approval)

```bash
cd DOCKERVERSION

# 1. Copy .env.example to .env and set POSTGRES_PASSWORD
cp .env.example .env

# 2. Build and start
docker compose up --build -d

# 3. Access HLC
open http://localhost:3000
```

---

*This plan transforms the Spark prototype into a production-grade, self-hosted Docker management platform. Every data point will come from the real Docker daemon or PostgreSQL — zero mock data.*
