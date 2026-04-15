# Phase 4: Frontend Migration

> **Update 2026-04-15:** All feature gaps between Spark prototype and iteration0 frontend resolved: stack template selector + port conflict detection in NewStackDialog, full Git Sync + Compare tabs in StackEditor, advanced retention/DB dump/NAS script in BackupManagement, granular prune + system health in Maintenance, complete Port Registry with 3 tabs (Timeline/Mappings/Reservations) + range reservations + 6 presets, restartPolicy + smart start indicator in ContainerCard, `useBackups` hook added.

> **Goal:** Transform the existing Spark prototype UI into a real application that fetches all data from the backend API. Remove all Spark dependencies, demo data generators, and fake state management. Keep every UI component, layout, and interaction identical.

## Prerequisites
- Phase 3 complete (all backend APIs working: Docker + DB)
- Backend accessible at `http://backend:3001/api/*`

## Completion Criteria
- [ ] Zero imports from `@github/spark`
- [ ] `demoData.ts` deleted — no mock data anywhere
- [ ] All 6 tabs show real data from backend API
- [ ] Container actions (start/stop/restart/remove) work against real containers
- [ ] Stack deploy/stop/restart runs real `docker compose` commands
- [ ] Settings persist across page reloads (stored in PostgreSQL)
- [ ] Logs stream in real-time via WebSocket
- [ ] Docker events update container status in real-time
- [ ] All 8 dialogs function with real backend data

---

## Task 4.1 — Install Frontend Dependencies

Update `DOCKERVERSION/frontend/package.json` with all needed dependencies (carry over from Spark prototype minus `@github/spark`):

### Dependencies to ADD:
```json
{
  "@phosphor-icons/react": "^2.1.7",
  "@radix-ui/react-accordion": "^1.2.3",
  "@radix-ui/react-alert-dialog": "^1.1.6",
  "@radix-ui/react-avatar": "^1.1.3",
  "@radix-ui/react-checkbox": "^1.1.4",
  "@radix-ui/react-collapsible": "^1.1.3",
  "@radix-ui/react-context-menu": "^2.2.6",
  "@radix-ui/react-dialog": "^1.1.6",
  "@radix-ui/react-dropdown-menu": "^2.1.6",
  "@radix-ui/react-label": "^2.1.2",
  "@radix-ui/react-popover": "^1.1.6",
  "@radix-ui/react-progress": "^1.1.2",
  "@radix-ui/react-scroll-area": "^1.2.9",
  "@radix-ui/react-select": "^2.1.6",
  "@radix-ui/react-separator": "^1.1.2",
  "@radix-ui/react-slot": "^1.1.2",
  "@radix-ui/react-switch": "^1.1.3",
  "@radix-ui/react-tabs": "^1.1.3",
  "@radix-ui/react-toggle": "^1.1.2",
  "@radix-ui/react-toggle-group": "^1.1.2",
  "@radix-ui/react-tooltip": "^1.1.8",
  "@tanstack/react-query": "^5.83.1",
  "class-variance-authority": "^0.7.1",
  "clsx": "^2.1.1",
  "cmdk": "^1.1.1",
  "date-fns": "^3.6.0",
  "framer-motion": "^12.6.2",
  "lucide-react": "^0.484.0",
  "react-error-boundary": "^6.0.0",
  "react-hook-form": "^7.54.2",
  "recharts": "^2.15.1",
  "sonner": "^2.0.1",
  "tailwind-merge": "^3.0.2",
  "tw-animate-css": "^1.2.4",
  "vaul": "^1.1.2",
  "zod": "^3.25.0"
}
```

### Dependencies to NOT install:
- `@github/spark` — Spark platform SDK (not available outside Spark)
- `@hookform/resolvers` — can re-add if needed
- `three` — not used
- `uuid` — use `crypto.randomUUID()` instead
- `d3` — not actively used
- `octokit`, `@octokit/core` — Spark-specific
- `marked` — not used
- `next-themes` — handle theme via CSS only

---

## Task 4.2 — Copy UI Components (as-is)

Copy the entire `src/components/ui/` directory from the Spark prototype to `DOCKERVERSION/frontend/src/components/ui/`.

**All 40+ shadcn/ui components copy unchanged:**
accordion, alert-dialog, alert, badge, breadcrumb, button, card, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input, label, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, skeleton, slider, sonner, switch, table, tabs, textarea, toggle, toggle-group, tooltip, etc.

These have no Spark dependencies — they're standard Radix + Tailwind.

---

## Task 4.3 — Copy Styles

Copy these files from Spark prototype to frontend:

| Source | Destination | Notes |
|--------|------------|-------|
| `src/index.css` | `frontend/src/index.css` | The dark theme CSS variables — copy the `:root` block and `@theme` block |
| `src/styles/theme.css` | `frontend/src/styles/theme.css` | Radix color imports — simplify, remove Spark `#spark-app` references |
| `src/main.css` | `frontend/src/main.css` | Import chain — simplify |

**Key change in `index.css`:** Keep the `:root` custom properties (background, foreground, primary, success, warning, etc.) and the `@theme` block. Remove any `#spark-app` scoping.

**Key change in `main.css`:** Remove `@import './styles/theme.css'` if it pulls in excessive Radix color imports. Keep only colors actually used.

---

## Task 4.4 — Copy Utility Files

| Source | Destination | Changes |
|--------|------------|---------|
| `src/lib/utils.ts` | `frontend/src/lib/utils.ts` | None — `cn()` utility is framework-agnostic |
| `src/lib/types.ts` | `frontend/src/lib/types.ts` | Review and keep all types. Remove `useKV`-specific patterns. |
| `src/hooks/use-mobile.ts` | `frontend/src/hooks/use-mobile.ts` | None |

---

## Task 4.5 — Create API Client

**File:** `frontend/src/lib/api.ts`

```typescript
const API_BASE = '/api';

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || `API error: ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Containers
  getContainers: () => fetchAPI<Container[]>('/containers'),
  startContainer: (id: string) => fetchAPI<void>(`/containers/${id}/start`, { method: 'POST' }),
  stopContainer: (id: string) => fetchAPI<void>(`/containers/${id}/stop`, { method: 'POST' }),
  restartContainer: (id: string) => fetchAPI<void>(`/containers/${id}/restart`, { method: 'POST' }),
  removeContainer: (id: string) => fetchAPI<void>(`/containers/${id}`, { method: 'DELETE' }),

  // Images
  getImages: () => fetchAPI<Image[]>('/images'),
  pullImage: (name: string, tag: string) => fetchAPI<void>('/images/pull', {
    method: 'POST', body: JSON.stringify({ name, tag })
  }),
  removeImage: (id: string) => fetchAPI<void>(`/images/${id}`, { method: 'DELETE' }),
  tagImage: (id: string, repo: string, tag: string) => fetchAPI<void>(`/images/${id}/tag`, {
    method: 'POST', body: JSON.stringify({ repo, tag })
  }),

  // Volumes
  getVolumes: () => fetchAPI<Volume[]>('/volumes'),
  removeVolume: (name: string) => fetchAPI<void>(`/volumes/${name}`, { method: 'DELETE' }),

  // Networks
  getNetworks: () => fetchAPI<Network[]>('/networks'),
  removeNetwork: (id: string) => fetchAPI<void>(`/networks/${id}`, { method: 'DELETE' }),

  // System
  getSystemInfo: () => fetchAPI<SystemStats>('/system/info'),
  getSystemDf: () => fetchAPI<any>('/system/df'),
  systemPrune: (opts: PruneOptions) => fetchAPI<PruneResult>('/system/prune', {
    method: 'POST', body: JSON.stringify(opts)
  }),

  // Stacks
  getStacks: () => fetchAPI<Stack[]>('/stacks'),
  createStack: (data: CreateStackRequest) => fetchAPI<Stack>('/stacks', {
    method: 'POST', body: JSON.stringify(data)
  }),
  updateStack: (id: string, data: UpdateStackRequest) => fetchAPI<Stack>(`/stacks/${id}`, {
    method: 'PUT', body: JSON.stringify(data)
  }),
  deleteStack: (id: string) => fetchAPI<void>(`/stacks/${id}`, { method: 'DELETE' }),
  deployStack: (id: string) => fetchAPI<DeployResult>(`/stacks/${id}/deploy`, { method: 'POST' }),
  stopStack: (id: string) => fetchAPI<void>(`/stacks/${id}/stop`, { method: 'POST' }),
  restartStack: (id: string) => fetchAPI<void>(`/stacks/${id}/restart`, { method: 'POST' }),
  getStackVersions: (id: string) => fetchAPI<StackVersion[]>(`/stacks/${id}/versions`),
  restoreStackVersion: (id: string, version: number) => fetchAPI<void>(
    `/stacks/${id}/restore/${version}`, { method: 'POST' }
  ),

  // Settings
  getSettings: () => fetchAPI<AppSettings>('/settings'),
  updateSettings: (data: AppSettings) => fetchAPI<AppSettings>('/settings', {
    method: 'PUT', body: JSON.stringify(data)
  }),

  // Backups
  getBackups: () => fetchAPI<BackupJob[]>('/backups'),
  runBackup: (stackId: string) => fetchAPI<BackupJob>(`/backups/${stackId}/run`, { method: 'POST' }),
  updateBackupConfig: (stackId: string, config: BackupConfig) => fetchAPI<void>(
    `/backups/${stackId}/config`, { method: 'PUT', body: JSON.stringify(config) }
  ),

  // Notifications
  getNotificationServices: () => fetchAPI<NotificationService[]>('/notifications/services'),
  createNotificationService: (data: Partial<NotificationService>) => fetchAPI<NotificationService>(
    '/notifications/services', { method: 'POST', body: JSON.stringify(data) }
  ),
  updateNotificationService: (id: string, data: Partial<NotificationService>) => fetchAPI<void>(
    `/notifications/services/${id}`, { method: 'PUT', body: JSON.stringify(data) }
  ),
  deleteNotificationService: (id: string) => fetchAPI<void>(
    `/notifications/services/${id}`, { method: 'DELETE' }
  ),
  testNotificationService: (id: string) => fetchAPI<void>(
    `/notifications/test/${id}`, { method: 'POST' }
  ),

  // Ports
  getPorts: () => fetchAPI<PortsResponse>('/ports'),
  createPortReservation: (data: Partial<PortRangeReservation>) => fetchAPI<PortRangeReservation>(
    '/ports/reservations', { method: 'POST', body: JSON.stringify(data) }
  ),
  deletePortReservation: (id: string) => fetchAPI<void>(
    `/ports/reservations/${id}`, { method: 'DELETE' }
  ),

  // Smart Startup
  getSmartStartup: () => fetchAPI<SmartStartupConfig[]>('/smart-startup'),
  updateSmartStartup: (id: string, data: Partial<SmartStartupConfig>) => fetchAPI<void>(
    `/smart-startup/${id}`, { method: 'PUT', body: JSON.stringify(data) }
  ),

  // Health
  getHealth: () => fetchAPI<HealthResponse>('/health'),
};
```

---

## Task 4.6 — Create React Query Hooks

### Hook Pattern (template for all hooks):

```typescript
// frontend/src/hooks/useContainers.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from 'sonner';

export function useContainers() {
  return useQuery({
    queryKey: ['containers'],
    queryFn: api.getContainers,
    refetchInterval: 5000,  // Refresh every 5 seconds
  });
}

export function useStartContainer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.startContainer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['containers'] });
      toast.success('Container started successfully');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ... similar for stop, restart, remove
```

### Hooks to create:

| File | Queries | Mutations | Refetch Interval |
|------|---------|-----------|-----------------|
| `useContainers.ts` | `useContainers()` | `useStartContainer()`, `useStopContainer()`, `useRestartContainer()`, `useRemoveContainer()` | 5s |
| `useImages.ts` | `useImages()` | `usePullImage()`, `useRemoveImage()`, `useTagImage()` | 30s |
| `useStacks.ts` | `useStacks()` | `useCreateStack()`, `useUpdateStack()`, `useDeleteStack()`, `useDeployStack()`, `useStopStack()`, `useRestartStack()`, `useRestoreVersion()` | 5s |
| `useVolumes.ts` | `useVolumes()` | `useRemoveVolume()` | 30s |
| `useNetworks.ts` | `useNetworks()` | `useRemoveNetwork()` | 30s |
| `useSystemStats.ts` | `useSystemStats()` | `useSystemPrune()` | 10s |
| `useSettings.ts` | `useSettings()` | `useUpdateSettings()` | never (manual) |
| `useBackups.ts` | `useBackups()` | `useRunBackup()`, `useUpdateBackupConfig()` | 30s |
| `useNotifications.ts` | `useNotificationServices()` | `useCreateService()`, `useUpdateService()`, `useDeleteService()`, `useTestService()` | never |
| `usePorts.ts` | `usePorts()` | `useCreateReservation()`, `useDeleteReservation()` | 30s |
| `useSmartStartup.ts` | `useSmartStartup()` | `useUpdateSmartStartup()` | never |

---

## Task 4.7 — Create WebSocket Hook for Logs

**File:** `frontend/src/hooks/useLogs.ts`

```typescript
import { useState, useEffect, useRef, useCallback } from 'react';

interface LogMessage {
  timestamp: string;
  stream: 'stdout' | 'stderr';
  message: string;
  container?: string;
}

export function useContainerLogs(containerId?: string) {
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!containerId) return;

    const ws = new WebSocket(`ws://${window.location.host}/ws/logs/${containerId}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      setLogs(prev => [...prev.slice(-199), msg]); // Keep last 200
    };

    ws.onclose = () => { wsRef.current = null; };

    return () => { ws.close(); };
  }, [containerId]);

  return { logs, clear: () => setLogs([]) };
}
```

**File:** `frontend/src/hooks/useDockerEvents.ts`

```typescript
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useDockerEvents() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const ws = new WebSocket(`ws://${window.location.host}/ws/events`);

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      // Invalidate relevant queries when Docker events occur
      if (msg.type === 'container') {
        queryClient.invalidateQueries({ queryKey: ['containers'] });
        queryClient.invalidateQueries({ queryKey: ['systemInfo'] });
      }
    };

    return () => { ws.close(); };
  }, [queryClient]);
}
```

---

## Task 4.8 — Create Query Provider Wrapper

**File:** `frontend/src/main.tsx`

```tsx
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from 'react-error-boundary'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { ErrorFallback } from './ErrorFallback'
import './main.css'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5000,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary FallbackComponent={ErrorFallback}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </ErrorBoundary>
)
```

Copy `ErrorFallback.tsx` from Spark prototype (remove any Spark-specific imports).

---

## Task 4.9 — Rewrite App.tsx

This is the biggest single change. Replace ALL `useKV` calls and demo data with React Query hooks.

### What to REMOVE from App.tsx:

```typescript
// DELETE these imports:
import { useKV } from '@github/spark/hooks'
import { generateDemoContainers, generateDemoImages, ... } from '@/lib/demoData'

// DELETE these state declarations:
const [containers, setContainers] = useKV<Container[]>('hlc-containers', [])
// ... all useKV calls

// DELETE the useEffect that seeds demo data
useEffect(() => {
  if (!containers || containers.length === 0) {
    setContainers(generateDemoContainers())
  }
  // ... all demo data seeding
}, [])

// DELETE the fake stats interval
useEffect(() => {
  const interval = setInterval(() => {
    setContainers(current => (current || []).map(c => ({
      ...c,
      cpu: Math.max(0, c.cpu + (Math.random() - 0.5) * 10), ...
    })))
  }, 3000)
}, [])

// DELETE all fake action handlers that just set local state
```

### What to ADD to App.tsx:

```typescript
import { useContainers, useStartContainer, useStopContainer, useRestartContainer, useRemoveContainer } from '@/hooks/useContainers'
import { useImages } from '@/hooks/useImages'
import { useStacks, useDeployStack, useStopStack, useRestartStack } from '@/hooks/useStacks'
import { useVolumes } from '@/hooks/useVolumes'
import { useNetworks } from '@/hooks/useNetworks'
import { useSystemStats, useSystemPrune } from '@/hooks/useSystemStats'
import { useSettings, useUpdateSettings } from '@/hooks/useSettings'
import { useDockerEvents } from '@/hooks/useDockerEvents'

function App() {
  // Real data from API
  const { data: containers = [] } = useContainers()
  const { data: images = [] } = useImages()
  const { data: stacks = [] } = useStacks()
  const { data: volumes = [] } = useVolumes()
  const { data: networks = [] } = useNetworks()
  const { data: systemStats } = useSystemStats()
  const { data: settings } = useSettings()

  // Real mutations
  const startContainer = useStartContainer()
  const stopContainer = useStopContainer()
  const restartContainer = useRestartContainer()
  const removeContainer = useRemoveContainer()
  const updateSettings = useUpdateSettings()
  const systemPrune = useSystemPrune()

  // Real-time Docker events (invalidates queries)
  useDockerEvents()

  // UI state (kept as local state)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState('dashboard')
  const [settingsOpen, setSettingsOpen] = useState(false)
  // ... all dialog open/close state remains the same

  // Handlers now call mutations
  const handleStartContainer = (id: string) => startContainer.mutate(id)
  const handleStopContainer = (id: string) => stopContainer.mutate(id)
  const handleRestartContainer = (id: string) => restartContainer.mutate(id)
  const handleRemoveContainer = (id: string) => removeContainer.mutate(id)

  // ... rest of JSX remains IDENTICAL
}
```

### What STAYS the same in App.tsx:
- All JSX layout and structure
- Tab structure (dashboard, stacks, containers, volumes, images, networks)
- Header with status badges and toolbar buttons
- Dialog mounting and open/close state
- Search filtering logic (computed from query data)
- All component props and callbacks

---

## Task 4.10 — Adapt Each Component

### Component-by-component changes:

#### ContainerCard.tsx
- **No changes needed** — this is a pure display component that receives props
- Callbacks (`onStart`, `onStop`, etc.) are passed from App.tsx which now calls mutations

#### ImageCard.tsx
- **No changes needed** — pure display component with callbacks

#### StackCard.tsx
- **No changes needed** — pure display component

#### StacksList.tsx
- Replace inline `setStacks` state mutations with API mutation callbacks from props
- The compose edit/save in the right panel needs to call `api.updateStack()`
- Deploy/Update buttons need to call `api.deployStack()`

#### VolumeCard.tsx
- **No changes needed** — pure display component

#### NetworkCard.tsx
- **No changes needed** — pure display component

#### MetricCard.tsx
- **No changes needed** — pure display component

#### AggregatedLogs.tsx
- **Major change:** Replace static `logs` prop with WebSocket data
- Use `useContainerLogs()` or a new aggregated logs WebSocket endpoint
- Keep all filtering/search/pause UI logic
- Alternative: backend provides `GET /api/logs/aggregated?tail=200` endpoint that aggregates recent logs from all containers

#### SettingsDialog.tsx
- Replace `onSave` prop with `useUpdateSettings()` mutation
- Load initial state from `useSettings()` query data
- No other changes to UI

#### MaintenanceDialog.tsx
- Replace `onPurgeUnusedImages`/`onPruneSystems` with `useSystemPrune()` mutation
- Real prune results show actual reclaimed space

#### NotificationServicesDialog.tsx
- Use `useNotificationServices()` query for initial data
- Use `useCreateService()`, `useUpdateService()`, `useDeleteService()` mutations
- Add "Test" button that calls `useTestService()` mutation

#### BackupManagementDialog.tsx
- Use `useBackups()` for job history
- Use `useUpdateBackupConfig()` for schedule changes
- Use `useRunBackup()` for manual backup triggers

#### SmartStartupDialog.tsx
- Use `useSmartStartup()` query + `useUpdateSmartStartup()` mutation

#### PortRegistryDialog.tsx
- Use `usePorts()` query (returns reservations + Docker port mappings + conflicts)
- Use `useCreateReservation()`, `useDeleteReservation()` mutations
- Remove `useKV` for reservations storage

#### EnhancedStackEditorDialog.tsx
- Use `useUpdateStack()` mutation for save
- Use `useDeployStack()` mutation for deploy
- Version restore via `useRestoreVersion()` mutation
- Remove `window.spark.llm()` from AI features (see Task 4.11)

#### NewStackDialog.tsx
- Use `useCreateStack()` mutation for save
- Use `useDeployStack()` mutation for deploy after creation
- Remove `window.spark.llm()` from AI features (see Task 4.11)

#### AiEnvSuggestions.tsx
- **Decision point:** Remove entirely OR replace `window.spark.llm()` with optional backend endpoint
- Recommended: Remove for v1. The AI suggestion feature can be added later as an optional backend integration.
- If removing: The `.env` tab in editors just shows the textarea without the AI sidebar

---

## Task 4.11 — Handle AI Features

The Spark prototype uses `window.spark.llm()` in two places:
1. **AiEnvSuggestions.tsx** — Generates environment variable suggestions from compose content
2. **NewStackDialog.tsx** — "Generate with AI" button to create compose from description

**Option A (Recommended for v1):** Remove AI features entirely
- Delete `AiEnvSuggestions.tsx`
- Remove "Generate with AI" button from NewStackDialog
- The `.env` tab becomes a simple full-width textarea

**Option B (Future):** Add optional backend AI endpoint
- Settings gets a new field: `aiEndpoint` (URL to OpenAI-compatible API)
- Backend proxies requests to configured AI endpoint
- Frontend calls `/api/ai/suggest-env` instead of `window.spark.llm()`

---

## Task 4.12 — Delete demoData.ts

Delete `frontend/src/lib/demoData.ts` entirely. Every reference to `generateDemo*` functions has been replaced with API calls.

---

## Task 4.13 — Update vite.config.ts

Ensure the frontend Vite config is clean (no Spark plugins):

```typescript
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import { resolve } from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  server: {
    proxy: {
      '/api': 'http://backend:3001',
      '/ws': { target: 'ws://backend:3001', ws: true }
    }
  }
});
```

**Removed:**
- `sparkPlugin()` 
- `createIconImportProxy()`
- `@github/spark/spark-vite-plugin` import
- `@github/spark/vitePhosphorIconProxyPlugin` import

---

## Task 4.14 — Update main.tsx Entry Point

```tsx
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from 'react-error-boundary'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { ErrorFallback } from './ErrorFallback'
import './main.css'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 5000 } },
});

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary FallbackComponent={ErrorFallback}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </ErrorBoundary>
)
```

**Removed:**
- `import "@github/spark/spark"` — Spark runtime
- `import "./styles/theme.css"` — if not needed or consolidated into main.css

---

## Migration Checklist per Component

Use this checklist when adapting each component:

- [ ] Remove `import { useKV } from '@github/spark/hooks'`
- [ ] Remove `import { ... } from '@github/spark'`
- [ ] Remove `window.spark.llm()` calls
- [ ] Replace `useKV<T>(key, default)` with React Query hook or local state
- [ ] Replace `generateDemo*()` calls with API data
- [ ] Replace `setTimeout` fake actions with real API mutations
- [ ] Replace `toast.success('...')` for fake actions with mutation `onSuccess` toasts
- [ ] Verify all Phosphor icons import from `@phosphor-icons/react` directly (not through Spark proxy)
- [ ] Test that the component renders with empty data (loading state)
- [ ] Test that the component renders with real data

---

## Verification Steps

After completing frontend migration:

1. Start the full stack: `docker compose up --build`
2. Open `http://localhost:3000`
3. **Dashboard tab:** Shows real CPU/Memory/Disk from host, real container/image/volume counts
4. **Containers tab:** Shows real Docker containers. Click Start/Stop — container actually starts/stops
5. **Stacks tab:** Create a new stack (e.g., nginx), deploy it — real containers appear
6. **Images tab:** Shows real local Docker images. Pull a new image — it downloads
7. **Volumes tab:** Shows real Docker volumes
8. **Networks tab:** Shows real Docker networks
9. **Settings dialog:** Change a setting, refresh page — setting persists
10. **Backup dialog:** Configure backup for a stack — config persists in DB
11. **Notification dialog:** Add a Discord service — persists in DB
12. **Port Registry:** Shows real port mappings from Docker + reservations from DB

---

## Files Created / Modified in This Phase

```
frontend/
├── package.json                    (modified — new deps, no Spark)
├── vite.config.ts                  (modified — no Spark plugins)
├── src/
│   ├── main.tsx                    (modified — QueryClientProvider, no Spark)
│   ├── App.tsx                     (REWRITTEN — React Query hooks, no demo data)
│   ├── ErrorFallback.tsx           (copied, cleaned)
│   ├── index.css                   (copied, cleaned)
│   ├── main.css                    (copied, cleaned)
│   ├── styles/
│   │   └── theme.css               (copied, cleaned)
│   ├── lib/
│   │   ├── api.ts                  (NEW — fetch wrapper)
│   │   ├── types.ts                (copied, reviewed)
│   │   ├── utils.ts                (copied as-is)
│   │   └── demoData.ts             (DELETED)
│   ├── hooks/
│   │   ├── use-mobile.ts           (copied as-is)
│   │   ├── useContainers.ts        (NEW)
│   │   ├── useImages.ts            (NEW)
│   │   ├── useStacks.ts            (NEW)
│   │   ├── useVolumes.ts           (NEW)
│   │   ├── useNetworks.ts          (NEW)
│   │   ├── useSystemStats.ts       (NEW)
│   │   ├── useSettings.ts          (NEW)
│   │   ├── useBackups.ts           (NEW)
│   │   ├── useNotifications.ts     (NEW)
│   │   ├── usePorts.ts             (NEW)
│   │   ├── useSmartStartup.ts      (NEW)
│   │   ├── useLogs.ts              (NEW — WebSocket)
│   │   └── useDockerEvents.ts      (NEW — WebSocket)
│   └── components/
│       ├── AggregatedLogs.tsx       (modified — WebSocket logs)
│       ├── AiEnvSuggestions.tsx     (DELETED or placeholder)
│       ├── BackupManagementDialog.tsx (modified — API mutations)
│       ├── ContainerCard.tsx        (no changes)
│       ├── EnhancedStackEditorDialog.tsx (modified — API mutations)
│       ├── ImageCard.tsx            (no changes)
│       ├── MaintenanceDialog.tsx    (modified — real prune)
│       ├── MetricCard.tsx           (no changes)
│       ├── NetworkCard.tsx          (no changes)
│       ├── NewStackDialog.tsx       (modified — API mutations)
│       ├── NotificationServicesDialog.tsx (modified — API mutations)
│       ├── PortRegistryDialog.tsx   (modified — API data)
│       ├── SettingsDialog.tsx       (modified — API mutations)
│       ├── SmartStartupDialog.tsx   (modified — API mutations)
│       ├── StackCard.tsx            (no changes)
│       ├── StackEditorDialog.tsx    (modified — API mutations)
│       ├── StacksList.tsx           (modified — API mutations)
│       ├── ThemeSelector.tsx        (no changes)
│       ├── VolumeCard.tsx           (no changes)
│       └── ui/                      (ALL COPIED AS-IS)
```
