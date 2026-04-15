# HomeLab Commander V2 — Implementation Plan

## How to Use This Plan with GitHub Copilot

This output folder is structured to be **copy-pasted directly** into your project's git root.

### 1. Global Instructions (`.github/copilot-instructions.md`)
Automatically loaded by Copilot in every conversation. Contains:
- Architecture principles (event-driven, backup-first, NAS-aware, stack-first)
- Tech stack decisions (Go, SQLite, HTMX + Monaco)
- Project structure & package layout
- Code style & naming conventions

### 2. Scoped Instructions (`.github/instructions/backend.instructions.md`)
Automatically applied to `backend/**/*.go` files. Contains:
- Go-specific patterns (error handling, testing, concurrency)
- Package dependency rules
- Docker, compose, and SQLite integration guidelines

### 3. Phase Prompts (`.github/prompts/phase-*.prompt.md`)
**Invoke these sequentially** in Copilot Chat to implement each phase:
- Open Copilot Chat → click the prompt icon → select the phase
- Each prompt is self-contained with tasks, code signatures, and acceptance criteria
- Each declares prerequisites so Copilot won't skip ahead

## V2 Merge Decisions

This V2 spec merges two concepts — the original V1 operator architecture and the
"Power-User Dossier" — taking the best from each:

| Decision | V1 (Kept) | Dossier (Merged In) |
|----------|-----------|---------------------|
| Architecture | Event Bus + Policy Engine | — |
| Backend | Go + stdlib + minimal deps | — |
| Database | `database/sql` + raw SQL | ~~GORM~~ (too heavy) |
| Frontend | HTMX base + progressive | Monaco editor for YAML editing |
| Docker | Socket API (`net/http` unix) | `docker compose` CLI for stack ops (single exception) |
| Labels | `hlc.*` namespace | Added `hlc.wait_for_mount`, `hlc.homepage.url` |
| Policies | Policy Engine (flexible rules) | MSM branding (renamed from Vacation Mode) |
| Stacks | Detection from labels | **Filesystem-based discovery + compose CRUD** |
| NAS | Not covered | **NAS Gatekeeper + conditional startup** |
| Env Mgmt | Not covered | **Global Env Hub + injection + propagation** |
| Migration | Not covered | **Migration Wizard (export/import)** |
| Homepage | Not covered | **Cross-link + Status API** |
| Notifications | 6 channels (Telegram, Discord, etc.) | — |
| Theme | Dark operator | **Glassmorphic dark (mesh gradients, backdrop-blur, 72px icon rail)** |

## Phase Overview

| Phase | Prompt File | What It Builds |
|-------|------------|----------------|
| 1 | `phase-01-core-discovery.prompt.md` | Docker socket, container listing, Event Bus |
| 2 | `phase-02-state-config.prompt.md` | SQLite, settings, Global Path/Env Hub, Policy Engine |
| 3 | `phase-03-label-intelligence.prompt.md` | `hlc.*` label parser, NAS labels, classification |
| 4 | `phase-04-stack-management.prompt.md` | Compose file scanning, stack CRUD, env injection |
| 5 | `phase-05-nas-gatekeeper.prompt.md` | Mount conditions, conditional startup, scheduler |
| 6 | `phase-06-backup-engine.prompt.md` | Volume backup, DB dumps, metadata, restore |
| 7 | `phase-07-update-system.prompt.md` | Registry check, risk detection, backup→update→rollback |
| 8 | `phase-08-observability.prompt.md` | CPU/RAM stats, restart tracking, mount health |
| 9 | `phase-09-audit-events.prompt.md` | Persistent audit log, timeline API |
| 10 | `phase-10-safety-access.prompt.md` | Token auth, read-only mode, safe mode |
| 11 | `phase-11-notifications.prompt.md` | Multi-channel notifications, Telegram, Discord, etc. |
| 12 | `phase-12-ui.prompt.md` | Tactical dashboard, stack editor, Homepage integration |
| 13 | `phase-13-migration.prompt.md` | Export/import wizard, server move |
| 14 | `phase-14-advanced.prompt.md` | S3 backups, multi-node (design only) |

## Copy Instructions

```bash
# From this output/V2 folder, copy everything to your project root:
cp -r .github/ /path/to/your/hlc-project/
```

The resulting structure in your project:
```
your-project/
  .github/
    copilot-instructions.md
    instructions/
      backend.instructions.md
    prompts/
      phase-01-core-discovery.prompt.md
      phase-02-state-config.prompt.md
      phase-03-label-intelligence.prompt.md
      phase-04-stack-management.prompt.md
      phase-05-nas-gatekeeper.prompt.md
      phase-06-backup-engine.prompt.md
      phase-07-update-system.prompt.md
      phase-08-observability.prompt.md
      phase-09-audit-events.prompt.md
      phase-10-safety-access.prompt.md
      phase-11-notifications.prompt.md
      phase-12-ui.prompt.md
      phase-13-migration.prompt.md
      phase-14-advanced.prompt.md
  backend/
    cmd/hlc/main.go
    internal/
      core/          # Event Bus, Policy Engine
      docker/        # Docker socket client
      db/            # SQLite, migrations
      envhub/        # Global env store, path presets
      labels/        # hlc.* label parser
      stacks/        # Compose management, stack ops
      nas/           # NAS Gatekeeper, mount checker
      scheduler/     # Cron jobs, periodic tasks
      backup/        # Backup engine, DB dumps
      update/        # Update engine, rollback
      observability/ # Stats collection
      audit/         # Audit log
      auth/          # Token auth, safe mode
      notification/  # Multi-channel dispatcher
      migrate/       # Export/import wizard
      api/           # HTTP handlers, SSE, routes
    web/             # Templates + static
  data/              # Runtime: hlc.db, configs
  mockups/           # HTML mockups for all pages
```

## Workflow

1. Copy `.github/` folder to your project root
2. Open your project in VS Code with Copilot
3. Start with **Phase 1** — open the prompt from the Copilot Chat prompt picker
4. Review generated code, run tests, commit
5. Move to the next phase
6. Repeat until done

Each phase builds on the last. Don't skip ahead — the dependency chain matters.
