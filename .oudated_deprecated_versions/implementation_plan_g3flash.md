# 🛸 HomeLab Commander (HLC) — Reimagined

Reimaging HLC from a traditional dashboard to a **Unified Command Center**. This vision blends the stack-first focus of Dockge, the simplicity of Dockpeek, and the power of Portainer into a stunning, minimalist "Status-First" interface.

## User Review Required

> [!IMPORTANT]
> This plan involves a significant shift from "Pages" (Dashboard, Stacks, Backups) to a "Unified Workspace" where everything is accessible from a single, reactive view.

> [!CAUTION]
> Reimaging the structure may require refactoring the backend API to support more real-time, event-streamed data (WebSockets) to ensure the "Live" feel.

## Visual Concept: "The Pulse"
Inspired by the "Red Dot" mockup, the new UI will center around **The Pulse** — a single, dynamic status indicator at the top of the interface that represents the entire infrastructure's health.

- **Extreme Minimalism**: Deep space black background (#020308) with high-contrast accents.
- **Tactile Glass**: Thinned-down glass containers with "Internal Glow" rather than borders.
- **Fluid Typography**: Large, legible headings that scale with the state of the system.
- **Micro-State Animations**: Containers don't just "start"; they "ignite" with a subtle glow transition.

## Proposed Structural Changes

### 1. Unified Navigator [NEW]
A hybrid sidebar/breadcrumb system (72px → 240px expansion) that organizes the lab hierarchically:
- **Level 1**: Nodes (Hosts)
- **Level 2**: Stacks (Compose Projects)
- **Level 3**: Services (Containers)

### 2. The "Command Deck" [MODIFY] [dashboard.html](file:///c:/DEV/homelab-commander/mockups/dashboard.html)
Transition the dashboard from a grid of cards to a **Live Operation Floor**.
- **Left Panel**: The Navigator (Tree view).
- **Center Panel**: The Context View.
- **Right Panel**: The Intelligence Sidecar (Audit log, AI suggestions, Health alerts).

### 3. Integrated Stack Editor [MODIFY] [stack-editor.html](file:///c:/DEV/homelab-commander/mockups/stack-editor.html)
Bring the "Dockge" magic: edit the YAML on the left, see the real-time resource usage and logs on the right. No more switching tabs.

## Recommended Features

| Feature | Inspiration | Purpose |
| :--- | :--- | :--- |
| **One-Click Fix** | AI-Ops | Automatic resolution of common issues (e.g., stale volumes, unhealthy mounts). |
| **Virtual Stacking** | Dockpeek | Auto-group non-compose containers into logical stacks based on user-defined labels. |
| **Dependency Mapping** | Portainer | Visual graph of networks and volume dependencies. |
| **Predictive Scaling** | Custom | Alert when resource trends suggest a container will OOM in the next 24 hours. |
| **The "Rollback" Timeline** | Git-like | 1-click rollback of any Compose file change or container update. |
| **NAS Anchor Guard** | Custom | Prevent any stack with NAS dependencies from starting if the anchor file is missing. |

## Proposed Components

### [Component] UI / Design System
#### [NEW] [hlc_v3_core.css](file:///c:/DEV/homelab-commander/backend/static/css/hlc_v3_core.css)
A new CSS framework for the reimagined UI, focusing on:
- `--hlc-pulse-color`: Dynamically updated based on global health.
- `--hlc-surface-heavy`: For the main command deck.
- `--hlc-surface-light`: For cards and hovering elements.

### [Component] Main Workspace
#### [NEW] [commander.html](file:///c:/DEV/homelab-commander/mockups/commander.html)
A unified HTML structure replacing the separate dashboard/stack/container pages.

## Verification Plan

### Automated Tests
- Browser test: Verify "The Pulse" changes color based on simulated container failures.
- Performance test: Ensure the "Unified Navigator" handles 100+ services without lag.

### Manual Verification
- Verify the "Tactile" feel of hover effects and transitions.
- Check readability of the "Deep Space" theme on different monitors.

## Open Questions

> [!IMPORTANT]
> Should we prioritize **Extreme Minimalism** (mostly empty space, high focus) or **Data Density** (Dashboard style)?
> Do you prefer a **Light Mode** variant or is **Deep Space Black** the definitive choice?
