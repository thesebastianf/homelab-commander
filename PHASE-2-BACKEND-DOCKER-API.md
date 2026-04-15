# Phase 2: Backend Core — Docker Daemon Integration

> **Goal:** Build the Express API that communicates with the real Docker daemon via Dockerode. After this phase, every Docker resource (containers, images, volumes, networks, system stats) is accessible via REST API and WebSocket streams — with ZERO mock data.

## Prerequisites
- Phase 1 complete (3 containers running, health check passing)
- Docker socket accessible at `/var/run/docker.sock`

## Completion Criteria
- [ ] `GET /api/containers` returns real containers from Docker daemon
- [ ] `POST /api/containers/:id/start|stop|restart` performs real actions
- [ ] `DELETE /api/containers/:id` removes real containers
- [ ] `GET /api/images` returns real local images
- [ ] `POST /api/images/pull` pulls real images with progress
- [ ] `GET /api/volumes` returns real volumes with usage info
- [ ] `GET /api/networks` returns real networks with connected containers
- [ ] `GET /api/system/info` returns real CPU, memory, disk stats
- [ ] `POST /api/system/prune` performs real Docker system prune
- [ ] WebSocket `/ws/logs/:id` streams real container logs
- [ ] WebSocket `/ws/stats/:id` streams real container stats
- [ ] WebSocket `/ws/events` streams real Docker events

---

## Task 2.1 — Backend Project Structure

Expand the backend from Phase 1's single `index.ts` into a proper structure:

```
backend/src/
├── index.ts              # App bootstrap + server start
├── config.ts             # Environment configuration
├── app.ts                # Express app setup (middleware, routes)
├── routes/
│   ├── containers.ts
│   ├── images.ts
│   ├── volumes.ts
│   ├── networks.ts
│   ├── system.ts
│   └── health.ts
├── services/
│   └── docker.ts         # Dockerode singleton + helper methods
├── websocket.ts          # WebSocket server setup
└── middleware/
    ├── errorHandler.ts   # Global async error handler
    └── validation.ts     # Zod validation middleware
```

---

## Task 2.2 — Configuration Module

**File:** `backend/src/config.ts`

```typescript
export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://hlc:password@localhost:5432/hlc',
  dockerSocket: process.env.DOCKER_SOCKET || '/var/run/docker.sock',
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  stacksBasePath: process.env.STACKS_BASE_PATH || '/opt/stacks',
  backupsBasePath: process.env.BACKUPS_BASE_PATH || '/mnt/backups',
  basicAuthUser: process.env.BASIC_AUTH_USER || '',
  basicAuthPass: process.env.BASIC_AUTH_PASS || '',
} as const;
```

---

## Task 2.3 — Docker Service (Dockerode Wrapper)

**File:** `backend/src/services/docker.ts`

This is the central Docker communication layer. All routes use this service — never Dockerode directly.

### Methods to implement:

```typescript
import Dockerode from 'dockerode';
import { config } from '../config.js';

const docker = new Dockerode({ socketPath: config.dockerSocket });

export const dockerService = {
  // Connection
  ping(): Promise<void>;

  // Containers
  listContainers(): Promise<ContainerInfo[]>;
  getContainer(id: string): Promise<ContainerInspectInfo>;
  startContainer(id: string): Promise<void>;
  stopContainer(id: string): Promise<void>;
  restartContainer(id: string): Promise<void>;
  removeContainer(id: string, force?: boolean): Promise<void>;
  getContainerLogs(id: string, opts: LogOptions): NodeJS.ReadableStream;
  getContainerStats(id: string): NodeJS.ReadableStream;

  // Images
  listImages(): Promise<ImageInfo[]>;
  pullImage(name: string, tag: string): EventEmitter;  // progress events
  removeImage(id: string, force?: boolean): Promise<void>;
  tagImage(id: string, repo: string, tag: string): Promise<void>;

  // Volumes
  listVolumes(): Promise<VolumeInfo[]>;
  createVolume(name: string, driver?: string): Promise<void>;
  removeVolume(name: string): Promise<void>;

  // Networks
  listNetworks(): Promise<NetworkInfo[]>;
  createNetwork(name: string, driver?: string): Promise<void>;
  removeNetwork(id: string): Promise<void>;

  // System
  getSystemInfo(): Promise<SystemInfo>;
  getDiskUsage(): Promise<DiskUsageInfo>;
  pruneContainers(): Promise<PruneResult>;
  pruneImages(): Promise<PruneResult>;
  pruneVolumes(): Promise<PruneResult>;
  pruneNetworks(): Promise<PruneResult>;

  // Events stream
  getEvents(): NodeJS.ReadableStream;
};
```

### Container list transformation

Map Dockerode's raw container data to the HLC `Container` type the frontend expects:

```typescript
interface ContainerResponse {
  id: string;            // container.Id (first 12 chars)
  name: string;          // container.Names[0] (strip leading /)
  image: string;         // container.Image
  status: 'running' | 'stopped' | 'paused' | 'restarting' | 'created';
  state: string;         // container.Status (e.g., "Up 3 days")
  created: string;       // ISO timestamp from container.Created
  ports: string[];       // ["80:80", "443:443"] from container.Ports
  cpu: number;           // 0 initially, live from stats stream
  memory: number;        // 0 initially, live from stats stream
  network: { rx: number; tx: number }; // 0 initially
  restartPolicy: string; // from HostConfig.RestartPolicy.Name
}
```

### Image list transformation

```typescript
interface ImageResponse {
  id: string;            // image.Id (first 12 chars after sha256:)
  repository: string;    // RepoTags[0] split by ':'
  tag: string;           // RepoTags[0] split by ':'
  size: string;          // Human-readable (formatBytes)
  created: string;       // ISO timestamp
  inUse: boolean;        // Cross-reference with running containers
}
```

### Volume list transformation

```typescript
interface VolumeResponse {
  id: string;            // Volume.Name (use as ID)
  name: string;          // Volume.Name
  driver: string;        // Volume.Driver
  mountpoint: string;    // Volume.Mountpoint
  size: string;          // From system df or "N/A"
  containers: string[];  // Container names using this volume
}
```

### Network list transformation

```typescript
interface NetworkResponse {
  id: string;            // Network.Id (first 12 chars)
  name: string;          // Network.Name
  driver: string;        // Network.Driver
  scope: string;         // Network.Scope
  containers: string[];  // Names of connected containers
}
```

---

## Task 2.4 — Error Handler Middleware

**File:** `backend/src/middleware/errorHandler.ts`

```typescript
import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error('Unhandled error:', err.message);

  // Docker-specific errors
  if ('statusCode' in err) {
    const statusCode = (err as any).statusCode;
    return res.status(statusCode).json({
      error: err.message,
      code: statusCode
    });
  }

  res.status(500).json({ error: 'Internal server error' });
}
```

Use a wrapper for async route handlers:

```typescript
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
```

---

## Task 2.5 — Containers Routes

**File:** `backend/src/routes/containers.ts`

### Endpoints:

#### `GET /api/containers`
- Calls `dockerService.listContainers()` with `all: true` to include stopped containers
- Returns `ContainerResponse[]`

#### `GET /api/containers/:id`
- Calls `dockerService.getContainer(id)`
- Returns full container inspect data

#### `POST /api/containers/:id/start`
- Calls `dockerService.startContainer(id)`
- Returns `{ success: true }`
- Error if already running → 409

#### `POST /api/containers/:id/stop`
- Calls `dockerService.stopContainer(id)`
- Returns `{ success: true }`
- Error if already stopped → 409

#### `POST /api/containers/:id/restart`
- Calls `dockerService.restartContainer(id)`
- Returns `{ success: true }`

#### `DELETE /api/containers/:id`
- Query param: `?force=true` to force remove running containers
- Calls `dockerService.removeContainer(id, force)`
- Returns `{ success: true }`
- Error if running and no force → 409

#### `GET /api/containers/:id/logs`
- Query params: `?tail=100&timestamps=true`
- Calls `dockerService.getContainerLogs(id, opts)`
- Returns log text (not JSON) with `Content-Type: text/plain`

---

## Task 2.6 — Images Routes

**File:** `backend/src/routes/images.ts`

### Endpoints:

#### `GET /api/images`
- Calls `dockerService.listImages()`
- Cross-references with running containers to set `inUse`
- Returns `ImageResponse[]`

#### `POST /api/images/pull`
- Body: `{ name: string, tag?: string }`
- Validates input with zod
- Calls `dockerService.pullImage(name, tag || 'latest')`
- Streams progress events as newline-delimited JSON (`Transfer-Encoding: chunked`)
- Final message: `{ status: "complete" }`

#### `DELETE /api/images/:id`
- Query param: `?force=true`
- Calls `dockerService.removeImage(id, force)`
- Returns `{ success: true }`

#### `POST /api/images/:id/tag`
- Body: `{ repo: string, tag: string }`
- Calls `dockerService.tagImage(id, repo, tag)`
- Returns `{ success: true }`

---

## Task 2.7 — Volumes Routes

**File:** `backend/src/routes/volumes.ts`

### Endpoints:

#### `GET /api/volumes`
- Calls `dockerService.listVolumes()`
- Cross-references with containers for usage info
- Returns `VolumeResponse[]`

#### `POST /api/volumes`
- Body: `{ name: string, driver?: string }`
- Calls `dockerService.createVolume(name, driver)`
- Returns `{ success: true, name }`

#### `DELETE /api/volumes/:name`
- Calls `dockerService.removeVolume(name)`
- Returns `{ success: true }`
- Error if in use → 409

---

## Task 2.8 — Networks Routes

**File:** `backend/src/routes/networks.ts`

### Endpoints:

#### `GET /api/networks`
- Calls `dockerService.listNetworks()`
- Includes connected container names
- Returns `NetworkResponse[]`

#### `POST /api/networks`
- Body: `{ name: string, driver?: string }`
- Calls `dockerService.createNetwork(name, driver)`
- Returns `{ success: true, id }`

#### `DELETE /api/networks/:id`
- Calls `dockerService.removeNetwork(id)`
- Returns `{ success: true }`
- Error if system network (bridge/host/none) → 403
- Error if in use → 409

---

## Task 2.9 — System Routes

**File:** `backend/src/routes/system.ts`

### Endpoints:

#### `GET /api/system/info`
Returns real system resource usage:

```typescript
interface SystemInfoResponse {
  containers: {
    running: number;
    stopped: number;
    total: number;
  };
  images: number;
  volumes: number;
  networks: number;
  cpuUsage: number;       // From host /proc/stat or Docker info
  memoryUsage: number;    // Percentage used
  memoryTotal: string;    // "16 GB"
  diskUsage: number;      // Percentage used
  diskTotal: string;      // "500 GB"
}
```

**Implementation notes:**
- `containers.*` → from `docker.listContainers()` counts
- `images` → from `docker.listImages()` count
- `volumes` → from `docker.listVolumes()` count
- `networks` → from `docker.listNetworks()` count
- `cpuUsage` → read from `/proc/stat` or `os.cpus()` (host CPU)
- `memoryUsage/Total` → from `os.totalmem()` / `os.freemem()` 
- `diskUsage/Total` → from `docker.df()` or `child_process` running `df -h /`

#### `GET /api/system/df`
- Calls Docker system df
- Returns breakdown of space used by containers, images, volumes

#### `POST /api/system/prune`
- Body: `{ containers?: boolean, images?: boolean, volumes?: boolean, networks?: boolean }`
- Calls appropriate prune methods
- Returns `{ spaceReclaimed: string, details: { ... } }`

---

## Task 2.10 — Health Route (enhance from Phase 1)

**File:** `backend/src/routes/health.ts`

```typescript
app.get('/api/health', async (_req, res) => {
  const dockerOk = await dockerService.ping().then(() => true).catch(() => false);
  const dbOk = await pool.query('SELECT 1').then(() => true).catch(() => false);

  res.status(dockerOk && dbOk ? 200 : 503).json({
    status: dockerOk && dbOk ? 'ok' : 'degraded',
    docker: dockerOk,
    database: dbOk,
    uptime: process.uptime(),
    version: '1.0.0'
  });
});
```

---

## Task 2.11 — WebSocket Server

**File:** `backend/src/websocket.ts`

Integrate `ws` with the Express HTTP server via `upgrade` event.

### WebSocket Endpoints:

#### `WS /ws/logs/:containerId`
- Opens a streaming connection to container logs via `dockerService.getContainerLogs(id, { follow: true, tail: 100, timestamps: true })`
- Demultiplexes Docker's stdout/stderr stream
- Sends each line as a JSON message: `{ timestamp, stream: "stdout"|"stderr", message }`
- On container stop → sends `{ type: "end", reason: "container_stopped" }` and closes
- On client disconnect → destroys Docker stream

#### `WS /ws/stats/:containerId`
- Opens a streaming connection to container stats via `dockerService.getContainerStats(id)`
- Sends parsed stats every ~2 seconds:
```json
{
  "cpu": 12.4,
  "memory": 256.3,
  "memoryLimit": 8192,
  "network": { "rx": 5432, "tx": 3210 },
  "timestamp": "2024-01-19T14:23:05Z"
}
```
- CPU calculation: `(cpuDelta / systemDelta) * numCPUs * 100`

#### `WS /ws/events`
- Opens a stream to Docker events via `dockerService.getEvents()`
- Filters to container-related events
- Sends:
```json
{
  "type": "container",
  "action": "start|stop|die|create|destroy|restart|pause|unpause",
  "id": "container_id",
  "name": "container_name",
  "timestamp": "ISO"
}
```
- Frontend uses this to invalidate React Query caches and show real-time updates

### Implementation:

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { dockerService } from './services/docker.js';

export function setupWebSocket(server: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request: IncomingMessage, socket, head) => {
    const url = new URL(request.url!, `http://${request.headers.host}`);

    if (url.pathname.startsWith('/ws/')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        handleConnection(ws, url.pathname);
      });
    } else {
      socket.destroy();
    }
  });
}

function handleConnection(ws: WebSocket, path: string) {
  // Parse path: /ws/logs/:id, /ws/stats/:id, /ws/events
  // Open appropriate Docker stream
  // Pipe data to WebSocket
  // Clean up on close
}
```

---

## Task 2.12 — Wire Everything Together

**File:** `backend/src/app.ts`

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { containersRouter } from './routes/containers.js';
import { imagesRouter } from './routes/images.js';
import { volumesRouter } from './routes/volumes.js';
import { networksRouter } from './routes/networks.js';
import { systemRouter } from './routes/system.js';
import { healthRouter } from './routes/health.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', healthRouter);
app.use('/api/containers', containersRouter);
app.use('/api/images', imagesRouter);
app.use('/api/volumes', volumesRouter);
app.use('/api/networks', networksRouter);
app.use('/api/system', systemRouter);

// Global error handler (must be last)
app.use(errorHandler);

export { app };
```

**File:** `backend/src/index.ts` (updated)

```typescript
import { createServer } from 'http';
import { app } from './app.js';
import { config } from './config.js';
import { setupWebSocket } from './websocket.js';

const server = createServer(app);
setupWebSocket(server);

server.listen(config.port, '0.0.0.0', () => {
  console.log(`HLC Backend listening on port ${config.port}`);
});
```

---

## Task 2.13 — Add Backend Dependencies

Update `backend/package.json` to ensure all dependencies are present:

**Required npm packages:**
- `express`, `cors`, `helmet` — HTTP server
- `dockerode` — Docker API client
- `pg` — PostgreSQL (already from Phase 1)
- `ws` — WebSocket server
- `zod` — Request validation
- `pino`, `pino-pretty` — Logging

**Dev dependencies:**
- `@types/express`, `@types/cors`, `@types/dockerode`, `@types/ws`, `@types/pg`, `@types/node`
- `tsx` — TypeScript execution for dev
- `typescript` — Compiler

---

## Verification Steps

After implementation, test each endpoint:

```bash
# List real containers
curl http://localhost:3001/api/containers | jq

# List real images
curl http://localhost:3001/api/images | jq

# List real volumes
curl http://localhost:3001/api/volumes | jq

# List real networks
curl http://localhost:3001/api/networks | jq

# System info
curl http://localhost:3001/api/system/info | jq

# Disk usage
curl http://localhost:3001/api/system/df | jq

# Health
curl http://localhost:3001/api/health | jq

# Test WebSocket (using wscat)
npx wscat -c ws://localhost:3001/ws/events

# Start/stop a test container
docker run -d --name test-ping alpine sleep 3600
curl -X POST http://localhost:3001/api/containers/test-ping/stop
curl -X POST http://localhost:3001/api/containers/test-ping/start
curl -X DELETE http://localhost:3001/api/containers/test-ping?force=true
```

---

## Files Created / Modified in This Phase

```
backend/src/
├── index.ts              (modified — creates HTTP server + WebSocket)
├── app.ts                (new — Express app with all middleware and routes)
├── config.ts             (new)
├── websocket.ts          (new — WebSocket server for logs/stats/events)
├── routes/
│   ├── health.ts         (new)
│   ├── containers.ts     (new)
│   ├── images.ts         (new)
│   ├── volumes.ts        (new)
│   ├── networks.ts       (new)
│   └── system.ts         (new)
├── services/
│   └── docker.ts         (new — Dockerode wrapper)
└── middleware/
    ├── errorHandler.ts   (new)
    └── validation.ts     (new — Zod middleware factory)
```

---

## Important Implementation Notes

### Docker Stream Demultiplexing
Docker multiplexes stdout/stderr in container logs. Use Dockerode's `container.logs()` with `{ follow: true, stdout: true, stderr: true }` and `container.modem.demuxStream()` to split them.

### CPU Calculation from Stats
```typescript
function calculateCPU(stats: any): number {
  const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
  const numCPUs = stats.cpu_stats.online_cpus || stats.cpu_stats.cpu_usage.percpu_usage?.length || 1;
  return systemDelta > 0 ? (cpuDelta / systemDelta) * numCPUs * 100 : 0;
}
```

### Memory Calculation from Stats
```typescript
function calculateMemory(stats: any): { used: number; limit: number } {
  const used = stats.memory_stats.usage - (stats.memory_stats.stats?.cache || 0);
  return { used: used / (1024 * 1024), limit: stats.memory_stats.limit / (1024 * 1024) };
}
```

### Volume Usage Cross-Reference
To determine which containers use a volume, inspect each container and check `Mounts[].Name` against volume names.

### Image In-Use Detection
Cross-reference `image.Id` against all containers' `ImageID` to set `inUse: true`.
