# HLC UI Specification

> Derived 1:1 from the Spark prototype. Every element, layout, interaction, and color documented below must be reproduced exactly in the Docker version.

---

## 1. Global Layout

### Shell Structure
```
┌──────────────────────────────────────────────────────────┐
│  HEADER (sticky top, z-50, backdrop-blur, border-bottom) │
│  ┌─────────────────────┐   ┌────────────────────────────┐│
│  │ Logo + "HLC" title  │   │ Status Badges + Toolbar    ││
│  │ "Homelab Commander" │   │ Buttons (6 icon buttons)   ││
│  └─────────────────────┘   └────────────────────────────┘│
├──────────────────────────────────────────────────────────┤
│  MAIN (container mx-auto px-6 py-8)                      │
│  ┌──────────────────────────────────────────────────────┐│
│  │  TAB BAR (6 tabs with icons + count badges)          ││
│  └──────────────────────────────────────────────────────┘│
│  ┌──────────────────────────────────────────────────────┐│
│  │                                                      ││
│  │              TAB CONTENT AREA                        ││
│  │                                                      ││
│  └──────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

### Header Specification

**Left side:**
- Gradient icon container (`bg-gradient-to-br from-primary to-accent`)
- Cube icon (28px, duotone, `text-primary-foreground`)
- Title: "HLC" (`text-2xl font-bold font-mono tracking-tight`)
- Subtitle: "Homelab Commander" (`text-xs text-muted-foreground`)

**Right side — Status Badges (conditional):**

| Badge | Condition | Style | Icon |
|-------|-----------|-------|------|
| UPDATE FREEZE | `settings.globalUpdateFreeze` | `variant="destructive" animate-pulse` | Snowflake 14px |
| Auto-Update ON | `autoUpdate && !freeze` | `variant="secondary"` | CloudArrowDown 14px |
| {N} Updates | `containersWithUpdates > 0` | `variant="outline" border-warning text-warning` | CloudArrowDown 14px |

**Right side — Toolbar Buttons (always visible):**

| Order | Icon | Title | Opens Dialog |
|-------|------|-------|-------------|
| 1 | ListNumbers 20px bold | "Port Registry" | PortRegistryDialog |
| 2 | Lightning 20px bold | "Smart Startup" | SmartStartupDialog |
| 3 | FloppyDisk 20px bold | "Backup Management" | BackupManagementDialog |
| 4 | Bell 20px bold | "Notifications" | NotificationServicesDialog |
| 5 | Broom 20px bold | "Maintenance" | MaintenanceDialog |
| 6 | Gear 20px bold | "Settings" | SettingsDialog |

All buttons: `variant="ghost" size="icon"`

### Tab Bar

| Order | Tab ID | Label | Icon | Count Badge |
|-------|--------|-------|------|-------------|
| 1 | dashboard | Dashboard | House 18px duotone | — |
| 2 | stacks | Stacks | Stack 18px duotone | `stacks.length` |
| 3 | containers | Containers | Cube 18px duotone | `containers.total` |
| 4 | volumes | Volumes | HardDrive 18px duotone | — |
| 5 | images | Images | Image 18px duotone | — |
| 6 | networks | Networks | Network 18px duotone | — |

Count badges: `bg-primary text-primary-foreground text-xs font-mono rounded-full px-2 py-0.5`

---

## 2. Dashboard Tab

### Resource Usage Section
- Section header: "Resource Usage" (`text-xl font-semibold font-mono`)
- Grid: `grid-cols-1 md:grid-cols-3 gap-4`

| Card | Value Source | Icon | Trend |
|------|-------------|------|-------|
| CPU Usage | `systemStats.cpuUsage.toFixed(1)%` | ChartLine 24px duotone | {value}% vs last hour |
| Memory | `systemStats.memoryUsage.toFixed(1)%` | ChartLine 24px duotone | {value}% vs last hour |
| Disk | `systemStats.diskUsage.toFixed(1)%` | ChartLine 24px duotone | {value}% vs last hour |

### System Overview + Logs Section
- Grid: `grid-cols-1 lg:grid-cols-2 gap-6`

**Left column — System Overview:**
- Section header: "System Overview" (`text-xl font-semibold font-mono`)
- Grid: `grid-cols-2 gap-4`

| Card | Value | Icon | Extra |
|------|-------|------|-------|
| Containers | `containers.total` | Cube 24px duotone | `pulse` if running > 0 |
| Running | `containers.running` | ChartLine 24px duotone | `border-l-4 border-l-success` |
| Images | `images.length` | Image 24px duotone | — |
| Volumes | `volumes.length` | HardDrive 24px duotone | — |

**Right column — Aggregated Logs** (component)

---

## 3. MetricCard Component

```
┌──────────────────────────────────────┐
│  LABEL (uppercase, tracking-wide)    │
│  VALUE (text-3xl font-bold mono)     │   [ICON]
│  ↑ 5.2% vs last hour                │   (p-3 rounded bg-primary/10)
├──────────────────────────────────────┤
│▓▓▓▓▓▓▓▓▓ gradient accent bar ▓▓▓▓▓▓│ ← visible on hover
└──────────────────────────────────────┘
```

- Card: `p-6`, hover shadow, `relative overflow-hidden`
- Trend arrow: `↑` (success) or `↓` (destructive) + `{abs(value)}%`
- Icon hover: `scale-110` transition
- Pulse: `animate-pulse-glow` on icon container

---

## 4. Containers Tab

### Layout
```
┌────────────────────────────────────────────┐
│  [🔎 Search containers...              ]  │
├────────────────────────────────────────────┤
│  ContainerCard                             │
│  ContainerCard                             │
│  ContainerCard                             │
│  ...                                       │
└────────────────────────────────────────────┘
```

- Search: MagnifyingGlass icon left, `pl-10 font-mono`
- Filter: name or image (case-insensitive)
- Empty state: Cube icon 64px opacity-50 + "No containers found"

### ContainerCard Layout

```
┌─ border-l-4 (status color) ──────────────────────────────┐
│                                                           │
│  [🔲] container-name         [Update] [Auto] ● running   │
│                                                           │
│  ┌──────────┬──────────┬──────────┬──────────┐           │
│  │ CPU      │ Memory   │ Net RX   │ Net TX   │           │
│  │ 12.4%    │ 128 MB   │ 5.3 KB/s │ 3.1 KB/s│           │
│  └──────────┴──────────┴──────────┴──────────┘           │
│                                                           │
│  Ports: [80:80] [443:443]                                │
│                                                           │
│  Restart: always  |  Smart Startup: Enabled              │
│                                                           │
│  [▶ Start] [⏹ Stop] [⟳ Restart] [📄 Logs] [💻 Terminal] │
│                                                      [⋯] │
└───────────────────────────────────────────────────────────┘
```

**Status border-l-4 colors:**
| Status | Color | Special |
|--------|-------|---------|
| running | `border-l-success` | Badge pulsing animation |
| stopped | `border-l-muted` | — |
| paused | `border-l-warning` | — |
| restarting | `border-l-info` | — |

**Metrics grid:** `grid-cols-2 md:grid-cols-4 gap-4`
- Label: `text-xs uppercase tracking-wider text-muted-foreground`
- Value: `text-xl font-bold font-mono tabular-nums`
- Unit: `text-sm text-muted-foreground`

**Action buttons (conditional):**
| Status | Visible Buttons |
|--------|----------------|
| stopped/paused | Start |
| running | Stop, Restart |
| any | Logs (always), Terminal (disabled if not running) |

**Dropdown (⋯):** "Remove" (text-destructive, Trash icon)

---

## 5. Stacks Tab

### Layout (grid-cols-12)

```
┌──── col-span-4 ────┬──────── col-span-8 ─────────┐
│                     │                              │
│  STACKS (N/M)       │  stack-name                  │
│  [🔎 Search...]     │  3 services • Version 5      │
│  [Filter by Status] │  [Start] [Stop] [Edit Stack] │
│                     │                              │
│  ┌───────────────┐  │  ┌─────────────────────────┐ │
│  │ ● web-stack   │  │  │ Tabs:                   │ │
│  │   running     │◄─┤  │  compose.yml | .env | i │ │
│  │   :80 :443    │  │  │                         │ │
│  ├───────────────┤  │  │  version: '3.8'         │ │
│  │ ○ db-stack    │  │  │  services:              │ │
│  │   stopped     │  │  │    nginx:               │ │
│  │   :5432       │  │  │      image: nginx       │ │
│  ├───────────────┤  │  │      ...                │ │
│  │ ...           │  │  │                         │ │
│  └───────────────┘  │  └─────────────────────────┘ │
│                     │                              │
└─────────────────────┴──────────────────────────────┘
```

**Left panel — Stack list:**
- Header: "STACKS" + badge `{filtered}/{total}`
- Search: MagnifyingGlass, `font-mono`, clear button
- Filter dropdown: 4 status checkboxes (running/stopped/deploying/failed) with color dots
- Sorting: active stacks first, then alphabetical
- Card: border-l-4 (status), selected = `bg-accent/30 shadow-md`
- Port badges: outline, `animate-pulse` if conflict, tooltip with conflict details

**Right panel — Stack details (3 tabs):**

| Tab | Content |
|-----|---------|
| docker-compose.yml | Toolbar (Edit/Save/Update/Deploy/Start) + monospace textarea |
| .env | Readonly textarea or empty state |
| Info | Stack/Volume paths + Exposed ports + Version history (last 5, newest first) |

---

## 6. Images Tab

### ImageCard Layout

```
┌──────────────────────────────────────────────────────────┐
│  [📦] nginx                          [✓ In Use]    [⋯]  │
│       :latest • 142 MB • 3 months ago                    │
│                                                          │
│  ID: img-1                                               │
└──────────────────────────────────────────────────────────┘
```

- Icon container: `bg-accent/10 text-accent`
- "In Use" badge: `bg-success/10 text-success border-success/20`
- Dropdown: Pull Latest, Add Tag, separator, Remove (disabled if in use)
- Date: relative format (Today, Yesterday, X days ago, etc.)

---

## 7. Volumes Tab

### VolumeCard Layout

```
┌──────────────────────────────────────────────────────────┐
│  [💾] postgres_data          [🔗 1 Connected]       [⋯]  │
│       local • 2.4 GB                                     │
│                                                          │
│  Mountpoint: /var/lib/docker/volumes/postgres_data/_data │
│  Used by: [postgres-db]                                  │
└──────────────────────────────────────────────────────────┘
```

- Icon: `bg-info/10 text-info`, HardDrive
- Connected badge: `bg-success/10 text-success`
- Dropdown: Inspect, separator, Remove (disabled if in use)

---

## 8. Networks Tab

### NetworkCard Layout

```
┌──────────────────────────────────────────────────────────┐
│  [🌐] bridge          [System] [🔗 3 Connected]    [⋯]  │
│       bridge • Local                                     │
│                                                          │
│  Connected: [nginx-proxy] [app-backend] [redis-cache]    │
└──────────────────────────────────────────────────────────┘
```

- Icon: `bg-accent/10 text-accent`, Network
- "System" badge: outline, for bridge/host/none networks
- Remove hidden for system networks, disabled if in use

---

## 9. AggregatedLogs Component

```
┌──────────────────────────────────────────────────────────┐
│  Aggregated Logs               [⏸ Pause] [⟳ Refresh]    │
│  Real-time logs from all containers                      │
│                                                          │
│  [Total: 150] [Errors: 3] [Warnings: 12] [Debug: 45]   │
│                                                          │
│  [All] [Info] [Warning] [Error] [Debug]                  │
│  [🔎 Search logs...] [Container ▾]                       │
├──────────────────────────────────────────────────────────┤
│  ERROR  14:23:05  [nginx]    Connection refused port 80  │
│  WARN   14:23:02  [redis]    Memory usage above 80%     │
│  INFO   14:22:58  [app]      Request completed 200      │
│  DEBUG  14:22:55  [postgres] Checkpoint complete        │
│  ...                                                     │
│                                                          │
│  Height: 400px, auto-scroll, monospace text-xs           │
│                                         ┌──────────────┐ │
│                                         │ ⏸ PAUSED     │ │
│                                         └──────────────┘ │
└──────────────────────────────────────────────────────────┘
```

**Log level colors:**
| Level | Badge Color | Row Background | Icon |
|-------|------------|----------------|------|
| error | `bg-destructive text-destructive-foreground` | `bg-destructive/5` | X bold |
| warn | `bg-warning text-warning-foreground` | `bg-warning/5` | Warning bold |
| debug | `bg-info text-info-foreground` | — | Bug bold |
| info | `bg-muted text-muted-foreground` | — | Info bold |

**Timestamp format:** `HH:mm:ss` (24-hour)

---

## 10. Dialog Specifications

### 10.1 SettingsDialog

**3 tabs: General | Notifications | Integrations**

**General tab:**
- Stacks Base Path input (`font-mono`, placeholder: `/path/to/stacks`)
- Volumes Base Path input
- Backups Base Path input
- Separator
- Update Management section:
  - Global Update Freeze card (`border-2 border-destructive bg-destructive/10` when active, toggle + "FROZEN" badge)
  - Auto-Update card (disabled when freeze active)

**Notifications tab:**
- Master enable toggle
- 9 event toggles (updateAvailable, containerAutoUpdated, containerFailed, containerStarted, containerStopped, stackDeployed, stackFailed, highMemory, highCpu)
- Threshold inputs: Memory % and CPU % (`grid-cols-2 gap-4`)

**Integrations tab:**
- Home Assistant card with enable toggle
- When enabled: Base URL, Access Token (password), Entity Prefix inputs
- Entity preview list + example YAML automation

### 10.2 MaintenanceDialog

**4 action cards:**

| Card | Icon Color | Button | Estimated Size |
|------|-----------|--------|---------------|
| Purge Unused Images | `text-accent` | "Purge" / "Purging..." | ~2.4 GB |
| Prune Unused Volumes | `text-warning` | "Prune" / "Pruning..." | ~850 MB |
| Remove Stopped Containers | `text-info` | "Remove" | 3 containers |
| System Health | `text-success` | — (display only) | Disk: 38.7% progress bar |

Loading states: button text changes, spinner icon, disabled

### 10.3 NotificationServicesDialog

**Service types:** Telegram, Discord, Slack, Email, Webhook

**Per service card:**
- Icon (service-specific), name (inline edit), type label
- Enable/disable toggle + delete button
- Config fields per type:
  - Telegram: botToken (password), chatId (text)
  - Discord: webhookUrl (password)
  - Slack: webhookUrl (password)
  - Email: smtpHost, smtpPort, username, password, from, to
  - Webhook: url, method

**Add service:** Type selector + "Add Service" button

### 10.4 NewStackDialog

**Top:** Stack name input + Template selector (5 templates: Blank, Nginx, WordPress+MySQL, PostgreSQL+pgAdmin, Prometheus+Grafana)

**Path display:** Stack path + Volume path (readonly, with copy)

**Port conflicts alert:** Warning with auto-resolve button

**4 tabs:**
| Tab | Content |
|-----|---------|
| docker-compose.yml | Textarea + context menu (right-click path insert) + "Generate with AI" button |
| .env | Textarea + AiEnvSuggestions sidebar |
| GitHub Sync | Enable toggle + repo URL, branch, compose path, auto-sync |
| Backup Config | Enable toggle + cron schedule, what to backup, retention days, compression |

### 10.5 EnhancedStackEditorDialog

**Path display:** Stack path + Volume path (readonly, with copy)

**Port conflicts alert:** Same as NewStackDialog

**5 tabs:**
| Tab | Content |
|-----|---------|
| docker-compose.yml | Edit/Save toggle + context menu + Update/Deploy/Start buttons |
| .env | Textarea + AiEnvSuggestions sidebar |
| GitHub Sync | Enable toggle + repo config + Sync Now / Push Changes buttons |
| Versions | Version cards (last 5, newest first) + Compare/Restore buttons |
| Compare | Side-by-side textareas (selected version vs current) |

### 10.6 BackupManagementDialog

**3 tabs: Stack Backups | Backup History | Settings**

**Stack Backups tab:**
Per stack: Toggle + Configure + Backup Now buttons
Accordion sections:
1. Schedule & Timing (cron presets + next run)
2. Retention Policy (simple days OR advanced daily/weekly/monthly/yearly)
3. Backup Contents (stack folder + volumes + databases toggles)
4. Advanced Options (compression, incremental, encryption)

**Backup History tab:**
Job cards with status indicators, timestamps, sizes, restore/delete buttons

**Settings tab:**
Backup storage path + NAS sync script example

### 10.7 SmartStartupDialog

**Sections:** Info card + Stack triggers + Container triggers + Network monitoring

Per item card: Enable toggle, then expanded fields:
- Trigger Type (NAS Device, Network Device, IP Address, Ping Response)
- Device Name/IP input
- Start Delay (seconds) input
- Auto-start containers toggle

### 10.8 PortRegistryDialog

**Stats row:** 6 metric boxes (Total Ports, Mappings, Conflicts, Available, Reservations, Reserved)

**Search + filter:** Search input + All/Conflicts/Available filter buttons

**3 tabs:**
| Tab | Content |
|-----|---------|
| Timeline | Port range visualization with colored boxes per reservation |
| Port Mappings | Card list with conflict indicators, reservation tags |
| Range Reservations | Create form (6 preset templates) + existing reservation list with progress bars |

---

## 11. Color System (from index.css)

### CSS Custom Properties

```css
:root {
  --background: oklch(0.15 0.02 250);     /* Deep Navy */
  --foreground: oklch(0.85 0.02 250);     /* Light Gray */
  --card: oklch(0.25 0.01 250);           /* Slate Gray */
  --primary: oklch(0.65 0.25 250);        /* Electric Blue */
  --secondary: oklch(0.35 0.01 250);      /* Charcoal */
  --muted: oklch(0.30 0.01 250);          /* Dark Muted */
  --accent: oklch(0.75 0.15 200);         /* Neon Cyan */
  --destructive: oklch(0.60 0.22 25);     /* Crimson */
  --success: oklch(0.70 0.18 150);        /* Emerald Green */
  --warning: oklch(0.75 0.15 85);         /* Amber */
  --info: oklch(0.70 0.12 230);           /* Sky Blue */
  --border: oklch(0.35 0.02 250);
  --ring: oklch(0.75 0.15 200);           /* Cyan (matches accent) */
  --radius: 0.5rem;
}
```

### Status Color Usage

| State | Background | Text | Animation |
|-------|-----------|------|-----------|
| running/active | `bg-success` | `text-success-foreground` | `animate-pulse-glow` |
| stopped/disabled | `bg-muted` | `text-muted-foreground` | — |
| paused/warning | `bg-warning` | `text-warning-foreground` | — |
| error/failed | `bg-destructive` | `text-destructive-foreground` | — |
| deploying/info | `bg-info` | `text-info-foreground` | — |
| accent/highlight | `bg-accent/10` | `text-accent` | — |

---

## 12. Typography

| Element | Font | Size | Weight | Tracking |
|---------|------|------|--------|----------|
| Page titles (H1) | JetBrains Mono | text-2xl (24px) | bold | tight |
| Section headers (H2) | JetBrains Mono | text-xl (20px) | semibold | normal |
| Card titles | JetBrains Mono | text-lg (18px) | semibold | normal |
| Body text | Roboto (sans) | text-sm (14px) | medium | normal |
| Small/metadata | Roboto (sans) | text-xs (12px) | normal | wide |
| Metric values | JetBrains Mono | text-3xl (30px) | bold | tabular-nums |
| Code/logs/paths | JetBrains Mono | text-xs–text-sm | normal | monospace |
| Labels | Roboto (sans) | text-xs (12px) | medium | uppercase tracking-wider |

Font loading: `font-mono` class maps to JetBrains Mono, `font-sans` to Roboto.

---

## 13. Common Patterns

### Card Pattern
- Padding: `p-4` to `p-6`
- Background: `bg-card`
- Border: `border border-border`, optional `border-l-4` for status
- Hover: shadow effect, optional border glow
- Selected: `bg-accent/30 shadow-md`

### Badge Pattern
- Status: filled backgrounds with foreground text
- Conditional: `bg-success/10 text-success border-success/20` for connected/in-use
- Data: `variant="outline" font-mono` for ports, tags, counts

### Empty State Pattern
- Centered icon (48–64px, `opacity-50`)
- Primary message (`text-lg font-mono`)
- Secondary help text (`text-sm text-muted-foreground`)

### Action Dropdown Pattern
- Trigger: DotsThree icon (20px), `variant="ghost" size="icon"`
- Items: icon (16px) + label
- Destructive items: `text-destructive`
- Disabled items: opacity 50% + "(In Use)" text

### Toast Notification Pattern
- Position: top-right
- Success: operation completed
- Error: validation/execution failure
- Info: long-running process started

---

## 14. Responsive Breakpoints

| Breakpoint | Layout Changes |
|-----------|---------------|
| Default (mobile) | Single column, stack everything |
| `md` (768px) | Metrics: 3-col, Container metrics: 4-col |
| `lg` (1024px) | Dashboard: 2-col (overview + logs) |
| Stacks tab | Always `grid-cols-12` (4+8 split) |

---

## 15. Animations & Transitions

| Element | Animation | Duration |
|---------|-----------|----------|
| Status badges (running) | `animate-pulse-glow` | Continuous |
| Header badges (freeze) | `animate-pulse` | Continuous |
| MetricCard icon | `group-hover:scale-110 transition` | 200ms |
| MetricCard accent bar | Opacity 0→100 on hover | 200ms |
| Card hover | Shadow increase | 200ms |
| Port conflict badges | `animate-pulse` | Continuous |
| Pause overlay | Static position | — |
| Loading buttons | Spinner icon rotation | Continuous |
| Dialog open/close | Radix default (fade + scale) | 200ms |
