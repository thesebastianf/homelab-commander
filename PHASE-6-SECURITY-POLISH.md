# Phase 6: Security, Polish & Documentation

> **Goal:** Harden the application for self-hosted production use. Add input validation, security headers, error handling, structured logging, health checks, and comprehensive documentation.

## Prerequisites
- All previous phases complete and working

## Completion Criteria
- [ ] All API inputs validated with zod schemas
- [ ] Helmet security headers applied
- [ ] Global Express error handler catches all unhandled errors
- [ ] Frontend ErrorBoundary catches render crashes
- [ ] Health check endpoint used by Docker HEALTHCHECK
- [ ] Structured logging via pino
- [ ] README.md with installation, configuration, and usage docs
- [ ] docker-compose.yml has proper healthchecks for all services

---

## Task 6.1 — Input Validation with Zod

**File:** `backend/src/validation/schemas.ts`

Create zod schemas for every API endpoint that accepts a body or params.

```typescript
import { z } from 'zod';

// Container actions
export const containerIdParam = z.object({
  id: z.string().regex(/^[a-f0-9]{12,64}$/i, 'Invalid container ID')
});

// Stack schemas
export const createStackBody = z.object({
  name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/, 'Alphanumeric, hyphens, underscores only'),
  description: z.string().max(500).optional(),
  composeContent: z.string().min(1).max(100_000),
  envContent: z.string().max(50_000).optional(),
});

export const updateStackBody = createStackBody.partial().extend({
  autoUpdate: z.boolean().optional(),
});

// Settings
export const updateSettingsBody = z.object({
  dockerHost: z.string().max(500).optional(),
  refreshInterval: z.number().int().min(1).max(3600).optional(),
  maxLogLines: z.number().int().min(10).max(10000).optional(),
  autoUpdate: z.boolean().optional(),
  globalUpdateFreeze: z.boolean().optional(),
  notificationConfig: z.object({
    enabled: z.boolean(),
    events: z.record(z.boolean()).optional(),
    thresholds: z.object({
      cpuPercent: z.number().min(0).max(100),
      memoryPercent: z.number().min(0).max(100),
    }).optional(),
  }).optional(),
  stacksBasePath: z.string().min(1).max(500).optional(),
  backupsBasePath: z.string().min(1).max(500).optional(),
});

// Backup config
export const backupConfigBody = z.object({
  enabled: z.boolean(),
  cronSchedule: z.string().max(100).optional(),
  retentionDays: z.number().int().min(1).max(3650),
  includeStackFolder: z.boolean().optional(),
  includeVolumes: z.boolean().optional(),
  includeDatabases: z.boolean().optional(),
  databaseType: z.enum(['postgresql', 'mysql', 'mongodb', 'redis', 'none']).optional(),
  compressionLevel: z.number().int().min(0).max(9).optional(),
  useAdvancedRetention: z.boolean().optional(),
  retentionPolicy: z.object({
    daily: z.number().int().min(0).max(365),
    weekly: z.number().int().min(0).max(52),
    monthly: z.number().int().min(0).max(120),
    yearly: z.number().int().min(0).max(10),
  }).optional(),
});

// Notification service
export const notificationServiceBody = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['telegram', 'discord', 'slack', 'email', 'webhook']),
  enabled: z.boolean(),
  config: z.record(z.string()).refine(
    (val) => Object.keys(val).length <= 20,
    'Too many config keys'
  ),
});

// Port reservation
export const portReservationBody = z.object({
  portRangeStart: z.number().int().min(1).max(65535),
  portRangeEnd: z.number().int().min(1).max(65535),
  purpose: z.string().min(1).max(200),
  stackName: z.string().max(100).optional(),
}).refine(
  (data) => data.portRangeEnd >= data.portRangeStart,
  'End port must be >= start port'
);

// Smart startup
export const smartStartupBody = z.object({
  triggerType: z.enum(['ping', 'ip', 'nas', 'device']),
  triggerValue: z.string().min(1).max(200).regex(
    /^[a-zA-Z0-9._:-]+$/,
    'Invalid trigger value'
  ),
  targetType: z.enum(['container', 'stack']),
  targetId: z.string().min(1).max(100),
  autoStart: z.boolean(),
  startDelay: z.number().int().min(0).max(3600),
  enabled: z.boolean(),
});
```

### Validation Middleware

**File:** `backend/src/middleware/validate.ts`

```typescript
import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          details: err.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message
          }))
        });
      } else {
        next(err);
      }
    }
  };
}

export function validateParams(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.params = schema.parse(req.params) as any;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: 'Invalid parameters',
          details: err.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message
          }))
        });
      } else {
        next(err);
      }
    }
  };
}
```

### Apply to Routes

Example on stacks routes:
```typescript
import { validateBody, validateParams } from '../middleware/validate.js';
import { createStackBody, containerIdParam } from '../validation/schemas.js';

router.post('/', validateBody(createStackBody), async (req, res) => { ... });
```

Apply `validateBody` or `validateParams` to **every** POST/PUT route.

---

## Task 6.2 — Security Headers with Helmet

**File:** `backend/src/index.ts` (modify)

```typescript
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
    }
  },
  crossOriginEmbedderPolicy: false, // Needed for WebSocket
}));
```

**Add dependency:** `npm install helmet`

### CORS Configuration

```typescript
import cors from 'cors';

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
```

### Rate Limiting (optional but recommended)

```typescript
import rateLimit from 'express-rate-limit';

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per window
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);
```

**Add dependency:** `npm install express-rate-limit`

---

## Task 6.3 — Global Error Handler

**File:** `backend/src/middleware/error-handler.ts`

```typescript
import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger.js';

export function globalErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error({
    err,
    method: req.method,
    path: req.path,
    body: req.body,
  }, 'Unhandled error');

  // Don't leak internal error details
  if (err.name === 'DockerError' || (err as any).statusCode) {
    res.status((err as any).statusCode || 500).json({
      error: err.message
    });
    return;
  }

  res.status(500).json({
    error: 'Internal server error'
  });
}
```

Register **after** all routes in `index.ts`:
```typescript
app.use(globalErrorHandler);
```

### Async Route Wrapper

To catch async errors in route handlers:

```typescript
// backend/src/lib/asyncHandler.ts
import { Request, Response, NextFunction, RequestHandler } from 'express';

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
```

Usage:
```typescript
router.get('/', asyncHandler(async (req, res) => {
  const containers = await dockerService.listContainers();
  res.json(containers);
}));
```

Wrap **every** async route handler with `asyncHandler()`.

---

## Task 6.4 — Structured Logging with Pino

**File:** `backend/src/logger.ts`

```typescript
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
});
```

**Add dependencies:** `npm install pino pino-pretty pino-http`

### HTTP Request Logging

```typescript
import pinoHttp from 'pino-http';
import { logger } from './logger.js';

app.use(pinoHttp({ logger }));
```

### Replace all `console.log/error/warn` across backend:

```typescript
// Before
console.log('Server started on port 3001');
console.error('Failed to connect:', err);

// After
logger.info({ port: 3001 }, 'Server started');
logger.error({ err }, 'Failed to connect');
```

---

## Task 6.5 — Health Check Endpoints

**File:** `backend/src/routes/health.ts`

```typescript
import { Router } from 'express';
import { pool } from '../database.js';
import { dockerService } from '../services/docker.js';

const router = Router();

// Simple liveness check
router.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Deep readiness check
router.get('/readyz', async (_req, res) => {
  const checks: Record<string, string> = {};

  // Database
  try {
    await pool.query('SELECT 1');
    checks.database = 'ok';
  } catch {
    checks.database = 'error';
  }

  // Docker socket
  try {
    await dockerService.ping();
    checks.docker = 'ok';
  } catch {
    checks.docker = 'error';
  }

  const allOk = Object.values(checks).every(v => v === 'ok');
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ready' : 'degraded',
    checks,
    timestamp: new Date().toISOString()
  });
});

export default router;
```

### Docker Compose Healthchecks

Update `docker-compose.yml`:

```yaml
services:
  backend:
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3001/healthz"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s

  db:
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U hlc"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s

  frontend:
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:80"]
      interval: 30s
      timeout: 10s
      retries: 3
    depends_on:
      backend:
        condition: service_healthy
```

---

## Task 6.6 — Frontend Error Boundaries

The Spark prototype already has `ErrorFallback.tsx`. Ensure it is wired into the migrated app:

**File:** `frontend/src/main.tsx`

```tsx
import { ErrorBoundary } from 'react-error-boundary';
import ErrorFallback from './ErrorFallback';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary FallbackComponent={ErrorFallback}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </ErrorBoundary>
);
```

Also wrap individual tab contents with error boundaries so one tab crashing doesn't bring down the entire app:

```tsx
<ErrorBoundary FallbackComponent={ErrorFallback}>
  <TabsContent value="containers">
    <ContainersTab />
  </TabsContent>
</ErrorBoundary>
```

---

## Task 6.7 — Docker Socket Security Documentation

Create **SECURITY.md** in the project:

```markdown
# Security Considerations

## Docker Socket Access

This application requires access to the Docker daemon socket (`/var/run/docker.sock`).
This grants the container **root-equivalent access** to the host's Docker daemon.

### Mitigations:
- The backend container runs as a non-root user (node) where possible
- The Docker socket is mounted read-write only because management operations require it
- No shell access is exposed to end users
- All container operations go through validated API endpoints with zod schemas
- Command execution (docker compose) uses `execFile` with argument arrays,
  never string interpolation, to prevent command injection

### Recommendations:
- Run HLC on a dedicated management network
- Use a reverse proxy (Traefik, nginx proxy manager) with HTTPS
- Consider docker socket proxy (tecnativa/docker-socket-proxy) for restricted access
- Keep HLC behind VPN/firewall, not exposed to public internet
```

---

## Task 6.8 — Optional Basic Authentication

For users who want a login gate without full user management:

**File:** `backend/src/middleware/basic-auth.ts`

```typescript
import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';

export function basicAuth(req: Request, res: Response, next: NextFunction): void {
  const authUser = process.env.AUTH_USER;
  const authPass = process.env.AUTH_PASS;

  // If not configured, skip authentication
  if (!authUser || !authPass) {
    next();
    return;
  }

  // Skip health checks
  if (req.path === '/healthz' || req.path === '/readyz') {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="HLC"');
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const credentials = Buffer.from(authHeader.slice(6), 'base64').toString();
  const [user, pass] = credentials.split(':');

  const userMatch = user.length === authUser.length &&
    timingSafeEqual(Buffer.from(user), Buffer.from(authUser));
  const passMatch = pass.length === authPass.length &&
    timingSafeEqual(Buffer.from(pass), Buffer.from(authPass));

  if (userMatch && passMatch) {
    next();
  } else {
    res.setHeader('WWW-Authenticate', 'Basic realm="HLC"');
    res.status(401).json({ error: 'Invalid credentials' });
  }
}
```

Add to `.env.example`:
```env
# Optional basic auth (leave blank to disable)
AUTH_USER=
AUTH_PASS=
```

Register early in `index.ts`:
```typescript
app.use(basicAuth);
```

---

## Task 6.9 — Process Signals & Graceful Shutdown

**File:** `backend/src/index.ts` (modify)

```typescript
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down gracefully');

  // Stop accepting new connections
  server.close();

  // Close WebSocket connections
  wss.clients.forEach(client => client.terminate());

  // Close database pool
  await pool.end();

  logger.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Catch unhandled rejections
process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled rejection');
  process.exit(1);
});
```

---

## Task 6.10 — README.md

**File:** `DOCKERVERSION/README.md`

Create comprehensive documentation covering:

```markdown
# HLC — Homelab Command

A self-hosted Docker container management platform with a modern web UI.

## Features
- Real-time container monitoring with CPU/memory/network stats
- Stack management with inline compose editor
- Automated backups with configurable retention
- Docker image update detection
- Smart startup (auto-start containers when network devices come online)
- Multi-channel notifications (Telegram, Discord, Slack, Email, Webhook)
- Port registry to track port allocations across stacks
- Dark theme with glassmorphism UI

## Quick Start

### Prerequisites
- Docker Engine 24+
- Docker Compose v2

### Installation

```bash
git clone <repo-url>
cd DOCKERVERSION
cp .env.example .env
# Edit .env with your preferences
docker compose up -d
```

Open `http://localhost:3000`

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_USER` | hlc | Database user |
| `POSTGRES_PASSWORD` | hlc_secret | Database password |
| `POSTGRES_DB` | hlc | Database name |
| `BACKEND_PORT` | 3001 | Backend API port |
| `FRONTEND_PORT` | 3000 | Web UI port |
| `STACKS_PATH` | ./data/stacks | Where stack compose files are stored |
| `BACKUPS_PATH` | ./data/backups | Where backups are stored |
| `AUTH_USER` | | Optional basic auth username |
| `AUTH_PASS` | | Optional basic auth password |
| `LOG_LEVEL` | info | Logging level (debug, info, warn, error) |

### Development

```bash
# Start with hot reload
docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# Frontend dev server
cd frontend && npm run dev

# Backend dev server
cd backend && npm run dev
```

## Architecture

Three-container Docker Compose stack:
- **frontend** (nginx) — Serves React SPA, proxies API and WebSocket
- **backend** (Node.js) — Express REST API + WebSocket + background services
- **db** (PostgreSQL 16) — Persistent configuration storage

See ARCHITECTURE.md for detailed system design.

## Security

See SECURITY.md for Docker socket security considerations.

## License

See LICENSE.
```

---

## Task 6.11 — Final docker-compose.yml Review

Ensure the production `docker-compose.yml` includes all hardening:

```yaml
services:
  frontend:
    restart: unless-stopped
    read_only: true
    tmpfs:
      - /var/cache/nginx
      - /var/run
      - /tmp
    security_opt:
      - no-new-privileges:true

  backend:
    restart: unless-stopped
    security_opt:
      - no-new-privileges:true
    environment:
      - NODE_ENV=production

  db:
    restart: unless-stopped
    security_opt:
      - no-new-privileges:true
    shm_size: '256mb'
```

---

## Files Created / Modified in This Phase

```
backend/src/
├── logger.ts                         (new — pino structured logging)
├── index.ts                          (modified — helmet, cors, rate-limit, graceful shutdown)
├── validation/
│   └── schemas.ts                    (new — all zod schemas)
├── middleware/
│   ├── validate.ts                   (new — body/params validation middleware)
│   ├── error-handler.ts              (new — global Express error handler)
│   └── basic-auth.ts                 (new — optional HTTP basic auth)
├── lib/
│   └── asyncHandler.ts               (new — async route error wrapper)
├── routes/
│   ├── health.ts                     (new — /healthz + /readyz endpoints)
│   └── *.ts                          (modified — add validate middleware + asyncHandler)
frontend/src/
├── main.tsx                          (modified — wrap with ErrorBoundary)
├── App.tsx                           (modified — per-tab ErrorBoundary)
DOCKERVERSION/
├── docker-compose.yml                (modified — healthchecks, security options)
├── .env.example                      (modified — add AUTH_USER, AUTH_PASS, LOG_LEVEL)
├── SECURITY.md                       (new)
└── README.md                         (new or rewritten)
```

### New Dependencies (backend)

```json
{
  "helmet": "^8.0.0",
  "express-rate-limit": "^7.5.0",
  "pino": "^9.6.0",
  "pino-http": "^10.4.0",
  "pino-pretty": "^13.0.0"
}
```
