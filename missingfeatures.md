# Missing Features — Homelab Commander

Extracted by comparing all SVGmocks against the current implementation.
Priority: **High** = layout-breaking or clearly visible; **Medium** = functionality gap; **Low** = polish.

---

## 01 — Dashboard Layout `HIGH`

**Mockup:** Two rows of 6 compact metric cards, then full-width Aggregated Logs.
**Current:** 3-card Resource row, 2×2 System Overview grid placed in a half-width column *next to* the Logs.

### Resource Usage Row (6 cards, single row)
| # | Card | Missing? |
|---|------|---------|
| 1 | CPU % | No — present |
| 2 | Memory % | No — present |
| 3 | Disk % | No — present |
| 4 | **Memory Total** (e.g. 16 GB) | ✅ MISSING |
| 5 | **Disk Total** (e.g. 500 GB) | ✅ MISSING |
| 6 | **Networks** (count) | ✅ MISSING (wasn't in Resource row) |

### System Overview Row (6 cards, single row)
| # | Card | Missing? |
|---|------|---------|
| 1 | Containers (total) | No — present |
| 2 | Running (green left border) | No — present |
| 3 | **Stopped** (red left border) | ✅ MISSING |
| 4 | Images | No — present |
| 5 | Volumes | No — present |
| 6 | **Stacks** | ✅ MISSING |

### Aggregated Logs
- **Current:** rendered at half-width inside a 2-column grid alongside System Overview.
- **Required:** full-width, below both metric rows.

---

## 02 — Header Buttons `HIGH`

**Mockup:** Each header button shows **icon + text label** in a compact two-line button style.

| Button | Current | Required |
|--------|---------|---------|
| Ports | Icon only | "Ports" label |
| Startup | Icon only | "Startup" label |
| Backup | Icon only | "Backup" label |
| Alerts | Icon only | "Alerts" label |
| Cleanup | Icon only | "Cleanup" label |
| Settings | Icon only | "Settings" label |

---

## 03 — Container Cards `MEDIUM`

**Mockup:** Cards are compact/horizontal. All metrics inline in one row. Actions right-aligned.

### Missing / different:
- **Restart policy badge** shown next to status badge (e.g. `🔄 unless-stopped`) — present in current code but very small/hidden
- **Smart Start badge** (`⚡ Smart Start`) — present but not wired to real data
- **Metrics row** should be single inline row: `CPU 12.4% | MEM 245 MB | NET ↓ 1.2 MB/s | NET ↑ 856 KB/s` — current shows 4 large stat blocks
- **Actions** should be icon-only buttons right-aligned on the card, not a full bottom row of text buttons
- **Update available** badge positioned on the right side near metrics, not inline with the name
- **Logs button** shown as a clipboard icon in the mockup (not "Logs" text button)
- **Terminal button** styled with accent color (purple border) when running

---

## 04 — Network Cards `MEDIUM`

**Mockup:** Each card shows subnet, gateway, and connected containers as **green chips**.

### Missing:
- **Subnet info** line (`Subnet: 172.20.0.0/16 · Gateway: 172.20.0.1`) — not rendered at all currently
- **Connected containers** shown as green-tinted chips with green text — current shows generic outline badges
- **Inspect** and **Remove** as direct buttons (not hidden in dropdown menu)
- **System network badge** (`system`) distinct from driver/scope badges

---

## 05 — Image Cards `LOW`

**Mockup:** Shows `Created: X days ago` and colour-coded In use / Unused badge.

### Missing:
- **Created date** displayed as relative text (`Created: 3 days ago`) — current shows raw `image.created` value
- **In Use / Unused** badge: green `In use`, grey `Unused` — current uses `variant="secondary"` with no colour difference
- **Tag button** appears in current code but is NOT shown in the mockup — should be removed

---

## 06 — Volume Cards `LOW`

**Mockup:** Orphaned (unused) volumes show a **red Remove button** that is fully active.

### Missing:
- Orphaned volume red Remove button styling — current disables the button for in-use volumes (correct) but no visual distinction for unused ones
- Size displayed inline next to the driver badge — present in current code ✅

---

## 07 — Logs WebSocket Connection `HIGH`

The `AggregatedLogs` component receives a static `logs` array prop that is always empty (`const [logs] = useState<LogEntry[]>([])`). The backend has a WebSocket server and a `/api/containers/:id/logs` endpoint.

### Missing:
- Connect the Aggregated Logs component to the **WebSocket** (or poll container logs) so it shows real log data

---

## 08 — System Info — Real CPU/Memory/Disk % `HIGH`

`systemStats.cpuUsage`, `systemStats.memoryUsage`, `systemStats.diskUsage` are all hardcoded to `0` in App.tsx because the `/api/system/info` endpoint doesn't return these values, or the frontend doesn't read them.

### Required:
- Backend `/api/system/info` should return real CPU %, memory %, disk %, disk total
- Frontend reads and displays them in the metric cards

---

## 09 — Stopped Containers Count in System Overview `HIGH`

**Mockup:** Dedicated "Stopped" metric card with red left border.
**Current:** Only `Running` and `Total` cards; stopped count is never shown.

*(Note: this overlaps with item 01 above — documenting separately for tracking purposes.)*

---

## Summary

| # | Area | Priority | Status |
|---|------|---------|--------|
| 01 | Dashboard layout (6+6 rows, full-width logs) | HIGH | ❌ Not done |
| 02 | Header button labels | HIGH | ❌ Not done |
| 03 | Compact ContainerCard | MEDIUM | ❌ Not done |
| 04 | NetworkCard (subnet, gateway, green chips, direct buttons) | MEDIUM | ❌ Not done |
| 05 | ImageCard (created date, In use badge, remove Tag btn) | LOW | ❌ Not done |
| 06 | VolumeCard (orphan red Remove) | LOW | ❌ Not done |
| 07 | Logs WebSocket / real data | HIGH | ❌ Not done |
| 08 | Real CPU/memory/disk % in system info | HIGH | ❌ Not done |
| 09 | Stopped container count card | HIGH | ❌ Not done (part of 01) |
