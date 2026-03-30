---
mode: "agent"
description: "Implement Phase 12: UI — Tactical dashboard, Dockge-style stack editor with Monaco, Homepage integration, SSE live updates"
tools: ["run_in_terminal", "create_file", "replace_string_in_file", "read_file", "grep_search", "file_search", "get_errors"]
---

# Phase 12 — UI (Tactical Dashboard)

Theme: "Tactical Dark Blue" (Slate-900 / Zinc). Replace Portainer + Dockge + Dozzle.

## Prerequisites
Phase 11 complete — all backend APIs working.

## Tasks

### 12.1 — Template & Static Setup (`backend/web/`)
```
backend/web/
  templates/
    layout.html          # base template (head, sidebar nav, footer)
    dashboard.html       # container grid + stats + MSM banner
    stack-editor.html    # Dockge-style: YAML + logs + env editor
    container.html       # single container detail
    backups.html         # backup history table
    settings.html        # settings + paths + env hub + policies + mounts
    notifications.html   # channel management
    audit.html           # audit log timeline
    migration.html       # export/import wizard
  static/
    style.css            # tactical dark blue theme
    htmx.min.js          # HTMX library
```

Use Go `html/template` for server-side rendering. Monaco Editor loaded from CDN for YAML editing only.

### 12.2 — Sidebar Navigation
Fixed sidebar with:
- 🛸 HLC logo + instance name
- 📊 Dashboard (active default)
- 📦 Stacks
- 💾 Backups
- ⚙️ Settings
- 🔔 Notifications
- 📜 Audit Log
- ↗️ Homepage link (configurable URL, opens in new tab)
- Footer: version + container count

### 12.3 — Dashboard View
- **MSM Banner**: Prominent yellow banner when Max Stability Mode active, with toggle button.
- **NAS Mount Indicators**: 🟢/🔴 status dots for each tracked mount path.
- **Stats Row**: Running / Stopped / Unhealthy / Updates Available counts.
- **Stack Groups**: Container cards grouped by stack.
- **Container Cards**: Name, image, state dot (green/yellow/red), role badge, update badge, last backup time.
- **Action Buttons**: Per-container (Backup, Check Update, Logs), per-stack (Backup Stack, Update Stack).
- **SSE Live Updates**: Container state changes update cards in real-time.

### 12.4 — Stack Editor (Dockge-Style)
Three-panel layout:
- **Left (60%)**: Monaco YAML editor for `docker-compose.yml`
  - Load via CDN: `https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/...`
  - Syntax validation before save
  - Save button writes to filesystem via API
- **Top-Right (40%)**: Env Variable Editor
  - Stack-local `.env` variables as editable key-value list
  - "Inject Global" button to merge from Env Hub
  - Visual indicator for values that differ from global
- **Bottom-Right**: Live container logs (streaming via SSE)
  - Tail last N lines
  - Auto-scroll, pause on hover
- **Action Bar**: Up / Down / Restart / Pull / Backup / Delete buttons

### 12.5 — Container Detail View
- Status + resource gauges (CPU bar, RAM bar)
- HLC labels table
- Volumes list with mount type
- NAS mount status (if applicable) — 🟢/🔴 indicator
- Recent backups list
- Log tail (streaming)
- Action buttons (Backup, Check Update, Restart, Stop)

### 12.6 — Live Updates (SSE)
```go
func (s *Server) HandleSSE(w http.ResponseWriter, r *http.Request)
```
- Subscribe to Event Bus.
- Stream events as SSE to browsers.
- HTMX `hx-ext="sse"` for auto-updating elements.
- Events: container state, backup progress, update progress, mount status changes.

### 12.7 — Homepage Integration
- `homepage_url` setting → rendered as external link in sidebar.
- `GET /api/v1/status` — compact JSON for gethomepage custom widget:
```json
{
  "msm_active": true,
  "containers": { "running": 9, "stopped": 2, "unhealthy": 1 },
  "backups": { "last_success": "2026-03-30T01:00:00Z", "failures_24h": 0 },
  "updates": { "available": 3 },
  "mounts": { "healthy": 2, "degraded": 0, "offline": 0 }
}
```

### 12.8 — Static File Serving
```go
func ServeUI(mux *http.ServeMux, templatesDir, staticDir string)
```
- `/static/` for CSS, JS, Monaco loader.
- Page routes separate from `/api/v1/` routes.
- Progressive enhancement: basic viewing works without JS.

## Acceptance Criteria
- [ ] Dashboard renders container grid grouped by stack
- [ ] MSM banner toggles policy
- [ ] NAS mount indicators show real-time status (🟢/🔴)
- [ ] Stack editor: Monaco YAML editing works with save
- [ ] Stack editor: Env variable editor with global injection
- [ ] Stack editor: Live logs streaming
- [ ] SSE delivers live updates to browser
- [ ] Container detail shows stats, labels, logs, backups
- [ ] Homepage cross-link works
- [ ] Status API returns compact JSON
- [ ] Works without JavaScript for basic viewing
