# 🛸 HomeLab Commander (HLC) — V2 Master Charter

## Vision
An **intelligent operator** for Docker-based HomeLabs. Not a dashboard — a policy-driven,
NAS-aware, self-healing command center that replaces Portainer (management), Dockge (stacks),
and Dozzle (logs) while adding resilience, backup-first safety, and migration readiness.

## Core Idea
A system that:
- understands context (labels, roles, dependencies, mount states)
- protects data (backup-first, rollback on failure)
- automates safely (policy engine, conditional startup, risk detection)
- manages stacks as first-class citizens (compose files, env injection, YAML editing)

## Pillars
1. **Event-driven core** — Event Bus as central nervous system
2. **Policy-based automation** — Max Stability Mode (MSM), quiet hours, safe-update rules
3. **Backup-first philosophy** — nothing mutates without a verified backup path
4. **Label-driven intelligence** — container behavior driven by `hlc.*` Docker labels
5. **NAS-awareness** — conditional startup, mount health monitoring
6. **Stack-first management** — compose files, global env injection, filesystem-based discovery

## Key Systems
| System | Purpose |
|--------|---------|
| Event Bus | Central nervous system — pub/sub for all internal events |
| Policy Engine | Decision-making — MSM, quiet hours, update rules |
| Global Env Hub | Central store for shared variables — API keys, paths, TZ, PUID |
| NAS Gatekeeper | Mount condition checker — blocks stack startup until mounts ready |
| Stack Manager | Compose file discovery, YAML editing, env injection, stack ops |
| Backup Engine | Volume snapshots, DB-aware dumps (Postgres, MariaDB), metadata |
| Update Engine | Registry digest comparison, risk detection, backup→update→rollback |
| Notification Dispatcher | Multi-channel alerts (Telegram, Discord, Gotify, Ntfy, Email, Webhook) |
| Migration Wizard | Full server migration — export/import all stacks, DB, configs |

## Max Stability Mode (MSM)
Global protection switch for absence/vacation scenarios:
> "Blocks updates, non-critical restarts, and config changes to guarantee system integrity during absence."

When MSM is active:
- All updates blocked
- Non-critical restarts suppressed
- Config changes blocked
- Critical backups (DB dumps) continue
- Health monitoring continues
- Notifications still fire

## NAS-Awareness
**Problem**: Stacks fail when NAS is still booting during system startup.
**Solution**: Stacks declare mount conditions via `hlc.wait_for_mount` label. HLC checks
anchor files or ping results before executing `docker compose up`.

## Ecosystem Integration
- **Homepage (gethomepage.dev)**: Cross-link in header, Status API endpoint for widgets
- **Status API**: Compact JSON: `{ msm_active, backup_status, updates_pending, nas_status }`
- **Notifications**: Telegram bot for mount status, backup results, crash loops

## Design Language
Glassmorphic dark theme built for immersive operator experience:
- **Mesh gradient background** with layered radial overlays (blue, purple, green tints)
- **Glass cards**: semi-transparent surfaces with backdrop-filter blur, ultra-thin white borders
- **72px icon-only rail** sidebar with SVG icons, tooltip labels, gradient logo, active accent bar
- **Color system**: accent `#6c8cff`, green `#3ee8b5`, yellow `#f0c050`, red `#ff6b6b`, purple `#a78bfa`
- **Typography**: Inter font family, gradient headings, 14px base
- **Interactions**: Hover glow on glass borders, smooth transitions, animated progress indicators
- **Layout**: Bento grid for dashboard, 3-panel editor, tabbed settings, vertical timeline for audit

See `mockups/` for full HTML reference implementations of all 8 screens.

## Long-Term Direction
Toward a self-healing, context-aware, multi-node homelab operator with S3 backup targets
and federated event buses.
