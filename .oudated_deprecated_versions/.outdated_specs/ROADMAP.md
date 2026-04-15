
# 📍 Roadmap (Operator-Grade)

## Phase 1 – Core Discovery (Foundation)
- Docker socket connection
- Container listing (name, state, labels)
- Docker Events stream (start/stop/die)
- Internal event bus

## Phase 2 – State & Control
- SQLite setup
- Settings table
- Vacation Mode → upgraded to Policy Engine
- API: /settings, /policies

## Phase 3 – Label Intelligence System
- Parse hlc.* labels
- Classification engine:
  - role (db, stateless, cache)
  - update policy
  - backup strategy
- Grouping (stack detection via labels / compose)

## Phase 4 – Backup Engine (Critical Path)
- Volume + bind mount detection
- Backup execution:
  1. optional stop
  2. DB-aware dump (Postgres, MariaDB)
  3. tar/gzip
- Backup metadata storage (JSON + DB)
- Restore simulation (dry-run)

## Phase 5 – Safe Update System
- Registry digest comparison
- Update planner:
  - risk detection (latest vs versioned)
- Execution flow:
  Backup → Update → Health Check → Rollback
- Respect policy engine (Vacation Mode)

## Phase 6 – Observability Lite
- CPU / RAM stats snapshot
- Restart count tracking
- Uptime tracking
- Store minimal history in SQLite

## Phase 7 – Audit & Event System
- Persistent audit log
- Event types:
  - container lifecycle
  - backups
  - updates
- Timeline view capability (API only)

## Phase 8 – Stack Awareness
- Detect compose projects
- Group containers into stacks
- Stack-level operations:
  - backup
  - update
  - logs

## Phase 9 – Safety & Access
- Token-based auth
- Read-only mode
- Safe Mode boot (failsafe if errors detected)

## Phase 10 – UI Evolution
- Start: static + HTMX
- Add:
  - live updates (SSE/WebSocket)
  - status indicators
  - vacation banner
- Optional later: Vue migration

## Phase 11 – Advanced (Later / Fancy)
- Notifications (webhook)
- S3 backup targets
- Multi-node support (very late)
