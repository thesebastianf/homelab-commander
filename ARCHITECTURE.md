# HLC Architecture & Tech Stack

> **Update 2026-04-15:** Backend now exposes granular prune endpoints (`POST /api/system/prune/images`, `/prune/volumes`, `/prune/containers`), Home Assistant config persistence, `restartPolicy` in container listings, and `git_repo_config` on stacks. Frontend hooks include `useBackups`, `useDockerEvents`. See PLAN.md changelog.

## 1. System Architecture

```
                          ┌──────────────────────────────┐
                          │         User Browser         │
                          │     http://localhost:3210     │
                          └──────────────┬───────────────┘
                                         │
                          ┌──────────────▼───────────────┐
                          │   Frontend Container (Nginx) │
                          │   - Serves React SPA build   │
                          │   - Proxies /api → backend   │
                          │   - Proxies /ws  → backend   │
                          │   Port: 3210 (external)      │
                          └──────────────┬───────────────┘
                                         │
                   ┌─────────────────────▼──────────────────────┐
                   │          Backend Container (Node.js)       │
                   │                                            │
                   │  ┌──────────────────────────────────────┐  │
                   │  │           Express Server             │  │
                   │  │  - REST API  (/api/*)                │  │
                   │  │  - WebSocket (/ws/*)                 │  │
                   │  │  - Background Services               │  │
                   │  └──────┬──────────────┬────────────────┘  │
                   │         │              │                    │
                   │  ┌──────▼──────┐ ┌─────▼──────────┐       │
                   │  │  Dockerode  │ │   pg (Pool)     │       │
                   │  │  (Docker    │ │  (PostgreSQL    │       │
                   │  │   client)   │ │   client)       │       │
                   │  └──────┬──────┘ └─────┬──────────┘       │
                   │         │              │                    │
                   └─────────┼──────────────┼────────────────────┘
                             │              │
              ┌──────────────▼──┐    ┌──────▼────────────────┐
              │  Docker Socket  │    │  PostgreSQL Container  │
              │  /var/run/      │    │  - Settings            │
              │  docker.sock    │    │  - Stack metadata      │
              │  (bind mount)   │    │  - Version history     │
              └─────────────────┘    │  - Backup configs      │
                                     │  - Notifications       │
                                     │  - Port reservations   │
                                     │  - Audit log           │
                                     └────────────────────────┘
```

## 2. Tech Stack Decisions

### Frontend

| Choice | Technology | Rationale |
|--------|-----------|-----------|
| **Framework** | React 19 | Already used in Spark prototype; component reuse |
| **Build Tool** | Vite 6 | Already used; fastest HMR, ESBuild powered |
| **Styling** | TailwindCSS 4 | Already used; utility-first, dark theme built-in |
| **UI Library** | shadcn/ui (Radix primitives) | Already used; 40+ components already in src/components/ui/ |
| **State / Fetching** | @tanstack/react-query v5 | Already a dependency; caching, refetch intervals, mutations |
| **Icons** | @phosphor-icons/react | Already used across all components; 6000+ icons, duotone style |
| **Charts** | recharts | Already a dependency; used for future metric graphs |
| **Forms** | react-hook-form + zod | Both already dependencies; validation consistency with backend |
| **Notifications** | sonner (toast) | Already used throughout; rich toast UI |
| **Animations** | framer-motion | Already a dependency; micro-interactions |
| **Date Formatting** | date-fns | Already a dependency; relative time, formatting |

### Backend

| Choice | Technology | Rationale |
|--------|-----------|-----------|
| **Runtime** | Node.js 20 LTS | Same language as frontend; async I/O matches Docker streams |
| **Framework** | Express 4 | Minimal, well-known, easy to add routes incrementally |
| **Language** | TypeScript 5 | Type safety, shared interfaces with frontend possible |
| **Docker Client** | Dockerode | Most popular Node Docker client; supports streams, exec, events |
| **Database Client** | pg (node-postgres) | Lightweight pool-based client; no ORM overhead |
| **WebSocket** | ws | RFC 6455 compliant; works with Express `upgrade` |
| **Validation** | zod | Shared with frontend; parse-don't-validate pattern |
| **Scheduling** | node-cron | Lightweight cron for backup scheduling |
| **Email** | nodemailer | Standard for SMTP notifications |
| **HTTP Client** | undici (built-in) | Discord/Slack/Telegram webhooks; no axios needed |
| **Security** | helmet + cors | Standard Express security headers |
| **Logging** | pino | Fast structured JSON logging |
| **Process Exec** | execa | Docker compose up/down via CLI (stack management) |

### Database

| Choice | Technology | Rationale |
|--------|-----------|-----------|
| **Database** | PostgreSQL 16-alpine | JSONB for flexible configs; reliable; tiny image |
| **Migrations** | Hand-written SQL | Simple; no migration framework needed for 8 tables |
| **Connection** | pg Pool | Connection pooling; auto-reconnect |

### Infrastructure

| Choice | Technology | Rationale |
|--------|-----------|-----------|
| **Orchestration** | Docker Compose v2 | Target deployment environment |
| **Frontend Server** | Nginx Alpine | Tiny, fast static file server + reverse proxy |
| **Container Base** | Alpine Linux | Smallest possible images |

## 3. Data Flow Patterns

### Pattern A: Docker Resources (Containers, Images, Volumes, Networks)

```
Frontend (React Query)                Backend (Express)                  Docker Daemon
       │                                     │                                │
       │  GET /api/containers                │                                │
       ├────────────────────────────────────►│  dockerode.listContainers()    │
       │                                     ├───────────────────────────────►│
       │                                     │◄───────────────────────────────┤
       │  JSON response                      │  Transform to HLC types        │
       │◄────────────────────────────────────┤                                │
       │                                     │                                │
       │  POST /api/containers/:id/start     │                                │
       ├────────────────────────────────────►│  container.start()             │
       │                                     ├───────────────────────────────►│
       │                                     │◄───────────────────────────────┤
       │  { success: true }                  │                                │
       │◄────────────────────────────────────┤                                │
```

### Pattern B: Persisted Configuration (Settings, Stacks, Backups)

```
Frontend (React Query)                Backend (Express)                  PostgreSQL
       │                                     │                                │
       │  GET /api/settings                  │                                │
       ├────────────────────────────────────►│  SELECT * FROM settings        │
       │                                     ├───────────────────────────────►│
       │                                     │◄───────────────────────────────┤
       │  JSON response                      │                                │
       │◄────────────────────────────────────┤                                │
       │                                     │                                │
       │  PUT /api/settings                  │                                │
       ├────────────────────────────────────►│  UPDATE settings SET ...       │
       │                                     ├───────────────────────────────►│
       │                                     │◄───────────────────────────────┤
       │  { success: true }                  │                                │
       │◄────────────────────────────────────┤                                │
```

### Pattern C: Real-time Streaming (Logs, Stats, Events)

```
Frontend (WebSocket)                  Backend (ws Server)                Docker Daemon
       │                                     │                                │
       │  WS connect /ws/logs/:id            │                                │
       ├────────────────────────────────────►│  container.logs({ follow })    │
       │                                     ├───────────────────────────────►│
       │                                     │◄─── stream chunk ──────────────┤
       │  ◄─── ws message ──────────────────┤                                │
       │                                     │◄─── stream chunk ──────────────┤
       │  ◄─── ws message ──────────────────┤                                │
       │  ...continues until disconnect...   │                                │
```

### Pattern D: Stack Operations (Compose Up/Down)

```
Frontend                              Backend                             Host Filesystem + Docker
       │                                     │                                │
       │  POST /api/stacks                   │                                │
       ├────────────────────────────────────►│  1. INSERT INTO stacks         │
       │                                     │  2. Write compose file to disk │
       │                                     │  3. Write .env file to disk    │
       │                                     │  4. INSERT INTO stack_versions │
       │  { stack }                          │                                │
       │◄────────────────────────────────────┤                                │
       │                                     │                                │
       │  POST /api/stacks/:id/deploy        │                                │
       ├────────────────────────────────────►│  execa('docker', ['compose',   │
       │                                     │    '-f', path, 'up', '-d'])    │
       │                                     ├───────────────────────────────►│
       │                                     │◄───────────────────────────────┤
       │  { status, output }                 │                                │
       │◄────────────────────────────────────┤                                │
```

## 4. Frontend Architecture

### Component Hierarchy

```
App.tsx
├── Header (sticky)
│   ├── Logo + Title
│   ├── Status Badges (Update Freeze, Auto-Update, Updates Count)
│   └── Toolbar Buttons
│       ├── PortRegistryDialog
│       ├── SmartStartupDialog
│       ├── BackupManagementDialog
│       ├── NotificationServicesDialog
│       ├── MaintenanceDialog
│       └── SettingsDialog
│
├── Tabs
│   ├── Dashboard Tab
│   │   ├── Resource Usage Grid (3 MetricCards: CPU, Memory, Disk)
│   │   ├── System Overview Grid (4 MetricCards: Containers, Running, Images, Volumes)
│   │   └── AggregatedLogs
│   │
│   ├── Stacks Tab
│   │   ├── Header + "New Stack" Button → NewStackDialog
│   │   └── StacksList (grid-cols-12)
│   │       ├── Left Panel (col-span-4): Stack cards with search/filter
│   │       └── Right Panel (col-span-8): Selected stack details + tabs
│   │           ├── docker-compose.yml (editable textarea)
│   │           ├── .env (readonly textarea)
│   │           └── Info (paths, ports, version history)
│   │
│   ├── Containers Tab
│   │   ├── Search Bar
│   │   └── ContainerCard list (vertical stack)
│   │
│   ├── Volumes Tab
│   │   └── VolumeCard list
│   │
│   ├── Images Tab
│   │   └── ImageCard list
│   │
│   └── Networks Tab
│       └── NetworkCard list
│
└── Dialogs (mounted always, toggled by state)
    ├── SettingsDialog (3 tabs: General, Notifications, Integrations)
    ├── MaintenanceDialog (4 action cards)
    ├── NotificationServicesDialog (service CRUD)
    ├── NewStackDialog (4 tabs: Compose, .env, Git, Backup)
    ├── EnhancedStackEditorDialog (5 tabs: Compose, .env, Git, Versions, Compare)
    ├── BackupManagementDialog (3 tabs: Stacks, History, Settings)
    ├── SmartStartupDialog (Stacks + Containers sections)
    └── PortRegistryDialog (3 tabs: Timeline, Mappings, Reservations)
```

### React Query Hook Architecture

```
hooks/
├── useContainers.ts
│   ├── useQuery('containers')           → GET /api/containers
│   ├── useMutation(startContainer)      → POST /api/containers/:id/start
│   ├── useMutation(stopContainer)       → POST /api/containers/:id/stop
│   ├── useMutation(restartContainer)    → POST /api/containers/:id/restart
│   └── useMutation(removeContainer)     → DELETE /api/containers/:id
│
├── useImages.ts
│   ├── useQuery('images')               → GET /api/images
│   ├── useMutation(pullImage)           → POST /api/images/pull
│   ├── useMutation(removeImage)         → DELETE /api/images/:id
│   └── useMutation(tagImage)            → POST /api/images/:id/tag
│
├── useStacks.ts
│   ├── useQuery('stacks')               → GET /api/stacks
│   ├── useMutation(createStack)         → POST /api/stacks
│   ├── useMutation(updateStack)         → PUT /api/stacks/:id
│   ├── useMutation(deleteStack)         → DELETE /api/stacks/:id
│   ├── useMutation(deployStack)         → POST /api/stacks/:id/deploy
│   ├── useMutation(stopStack)           → POST /api/stacks/:id/stop
│   ├── useMutation(restartStack)        → POST /api/stacks/:id/restart
│   ├── useQuery('stackVersions')        → GET /api/stacks/:id/versions
│   └── useMutation(restoreVersion)      → POST /api/stacks/:id/restore/:v
│
├── useVolumes.ts
│   ├── useQuery('volumes')              → GET /api/volumes
│   ├── useMutation(createVolume)        → POST /api/volumes
│   └── useMutation(removeVolume)        → DELETE /api/volumes/:name
│
├── useNetworks.ts
│   ├── useQuery('networks')             → GET /api/networks
│   ├── useMutation(createNetwork)       → POST /api/networks
│   └── useMutation(removeNetwork)       → DELETE /api/networks/:id
│
├── useSystemStats.ts
│   ├── useQuery('systemInfo')           → GET /api/system/info
│   ├── useQuery('systemDf')             → GET /api/system/df
│   └── useMutation(systemPrune)         → POST /api/system/prune
│
├── useSettings.ts
│   ├── useQuery('settings')             → GET /api/settings
│   └── useMutation(updateSettings)      → PUT /api/settings
│
├── useBackups.ts
│   ├── useQuery('backups')              → GET /api/backups
│   ├── useMutation(runBackup)           → POST /api/backups/:stackId/run
│   ├── useMutation(updateBackupConfig)  → PUT /api/backups/:stackId/config
│   └── useMutation(restoreBackup)       → POST /api/backups/:jobId/restore
│
├── useNotifications.ts
│   ├── useQuery('notificationServices') → GET /api/notifications/services
│   ├── useMutation(addService)          → POST /api/notifications/services
│   ├── useMutation(updateService)       → PUT /api/notifications/services/:id
│   ├── useMutation(deleteService)       → DELETE /api/notifications/services/:id
│   └── useMutation(testService)         → POST /api/notifications/test/:id
│
├── usePorts.ts
│   ├── useQuery('ports')                → GET /api/ports
│   ├── useMutation(createReservation)   → POST /api/ports/reservations
│   └── useMutation(deleteReservation)   → DELETE /api/ports/reservations/:id
│
├── useSmartStartup.ts
│   ├── useQuery('smartStartup')         → GET /api/smart-startup
│   └── useMutation(updateConfig)        → PUT /api/smart-startup/:id
│
└── useLogs.ts (WebSocket-based)
    ├── useContainerLogs(containerId)    → WS /ws/logs/:id
    ├── useContainerStats(containerId)   → WS /ws/stats/:id
    └── useDockerEvents()                → WS /ws/events
```

## 5. Backend Route Architecture

```
backend/src/
├── index.ts                    # Express app + WebSocket upgrade
├── config.ts                   # Env vars, defaults
├── database.ts                 # pg Pool, migration runner
│
├── routes/
│   ├── containers.ts           # Router for /api/containers
│   ├── images.ts               # Router for /api/images
│   ├── stacks.ts               # Router for /api/stacks
│   ├── volumes.ts              # Router for /api/volumes
│   ├── networks.ts             # Router for /api/networks
│   ├── system.ts               # Router for /api/system
│   ├── settings.ts             # Router for /api/settings
│   ├── backups.ts              # Router for /api/backups
│   ├── notifications.ts        # Router for /api/notifications
│   ├── ports.ts                # Router for /api/ports
│   ├── smart-startup.ts        # Router for /api/smart-startup
│   └── health.ts               # Router for /api/health
│
├── services/
│   ├── docker.ts               # Dockerode singleton + helper methods
│   ├── stacks.ts               # Compose file management + exec
│   ├── backups.ts              # Backup execute + schedule logic
│   ├── notifications.ts        # Send to Telegram/Discord/Slack/Email/Webhook
│   ├── updates.ts              # Compare image digests with registry
│   └── smart-startup.ts        # Ping/monitor trigger devices
│
├── websocket.ts                # WebSocket handler (logs, stats, events)
│
├── middleware/
│   ├── errorHandler.ts         # Global async error catch
│   └── validation.ts           # Zod middleware factory
│
└── migrations/
    └── 001_initial.sql         # Full schema
```

## 6. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| Docker socket access | Backend runs as privileged container; socket mounted read-only where possible. Documented that this grants root-equivalent access to Docker host. |
| No authentication (v1) | Single-user homelab use case. Optional `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` env vars for basic HTTP auth. |
| SQL injection | Parameterized queries via pg ($1, $2 placeholders). No string concatenation. |
| Command injection | Stack names validated (alphanumeric + hyphens only). Compose files written via fs, executed via execa with explicit args (no shell). |
| XSS | React escapes by default. CSP headers via Helmet. |
| SSRF | User-provided URLs (notification webhooks, git repos) validated for format only — can reach internal network by design (homelab context). |
| Secrets in DB | Notification tokens and passwords stored in PostgreSQL. For v1 this is acceptable (single-user, private network). Future: encrypt at rest. |
| Path traversal | All file paths built from validated stack names joined to configured base paths. No user-controlled path segments reach the filesystem directly. |

## 7. Deployment Model

### Production (docker compose up)
```
docker compose up -d --build
```
- Frontend built at image build time (Vite → static files)
- Backend compiled at image build time (tsc → JavaScript)
- PostgreSQL data persisted via named volume
- Stack compose files stored on host via bind mount
- Backups stored on host via bind mount

### Development (docker compose -f ... up)
```
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```
- Frontend: Vite dev server with HMR (port 5173)
- Backend: tsx watch mode with auto-restart
- PostgreSQL: same as production
- Source code bind-mounted into containers

## 8. Environment Variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `POSTGRES_PASSWORD` | — | Yes | PostgreSQL password |
| `POSTGRES_DB` | `hlc` | No | Database name |
| `HLC_PORT` | `3210` | No | External port for frontend |
| `DOCKER_SOCKET` | `/var/run/docker.sock` | No | Docker socket path |
| `STACKS_PATH` | `./stacks` | No | Host path for stack compose files |
| `BACKUPS_PATH` | `./backups` | No | Host path for backup archives |
| `NODE_ENV` | `production` | No | Node environment |
| `LOG_LEVEL` | `info` | No | Backend log level (debug/info/warn/error) |
| `BASIC_AUTH_USER` | — | No | Optional HTTP basic auth username |
| `BASIC_AUTH_PASS` | — | No | Optional HTTP basic auth password |
