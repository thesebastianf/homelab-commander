# Phase 1: Project Scaffolding & Infrastructure

> **Goal:** Create the complete folder structure, Docker Compose files, Dockerfiles, Nginx config, and database init so that `docker compose up --build` starts all 3 services (frontend serving a blank page, backend returning health check, PostgreSQL accepting connections).

## Prerequisites
- Docker Engine 24+ installed
- Docker Compose v2 installed
- Git

## Completion Criteria
- [ ] `docker compose up --build` starts 3 containers without errors
- [ ] `http://localhost:3000` shows a blank React page with "HLC" title
- [ ] `http://localhost:3000/api/health` returns `{ "status": "ok", "docker": true, "database": true }`
- [ ] PostgreSQL is accessible from backend container
- [ ] Docker socket is mounted and accessible from backend container

---

## Task 1.1 — Create docker-compose.yml

**File:** `DOCKERVERSION/docker-compose.yml`

```yaml
services:
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "${HLC_PORT:-3000}:80"
    depends_on:
      backend:
        condition: service_healthy
    restart: unless-stopped

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "3001:3001"
    environment:
      - DATABASE_URL=postgresql://hlc:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-hlc}
      - DOCKER_SOCKET=${DOCKER_SOCKET:-/var/run/docker.sock}
      - NODE_ENV=production
      - LOG_LEVEL=${LOG_LEVEL:-info}
    volumes:
      - ${DOCKER_SOCKET:-/var/run/docker.sock}:/var/run/docker.sock:ro
      - ${STACKS_PATH:-./data/stacks}:/opt/stacks
      - ${BACKUPS_PATH:-./data/backups}:/mnt/backups
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3001/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=hlc
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=${POSTGRES_DB:-hlc}
    volumes:
      - hlc_pgdata:/var/lib/postgresql/data
      - ./db/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U hlc"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  hlc_pgdata:
```

---

## Task 1.2 — Create docker-compose.dev.yml

**File:** `DOCKERVERSION/docker-compose.dev.yml`

Purpose: Development overrides — hot reload for frontend and backend.

```yaml
services:
  frontend:
    build:
      target: dev
    ports:
      - "5173:5173"
    volumes:
      - ./frontend/src:/app/src
      - ./frontend/index.html:/app/index.html
    environment:
      - VITE_API_URL=http://localhost:3001

  backend:
    build:
      target: dev
    volumes:
      - ./backend/src:/app/src
    environment:
      - NODE_ENV=development
      - LOG_LEVEL=debug
    command: npx tsx watch src/index.ts
```

Usage: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build`

---

## Task 1.3 — Create .env.example

**File:** `DOCKERVERSION/.env.example`

```env
# Required
POSTGRES_PASSWORD=changeme_use_strong_password

# Optional
POSTGRES_DB=hlc
HLC_PORT=3000
DOCKER_SOCKET=/var/run/docker.sock
STACKS_PATH=./data/stacks
BACKUPS_PATH=./data/backups
LOG_LEVEL=info

# Optional: Basic Auth (leave empty to disable)
BASIC_AUTH_USER=
BASIC_AUTH_PASS=
```

---

## Task 1.4 — Create Backend Dockerfile

**File:** `DOCKERVERSION/backend/Dockerfile`

```dockerfile
# ---- Base ----
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache wget

# ---- Dependencies ----
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ---- Build ----
FROM base AS build
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

# ---- Production ----
FROM base AS production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
EXPOSE 3001
CMD ["node", "dist/index.js"]

# ---- Development ----
FROM base AS dev
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
EXPOSE 3001
CMD ["npx", "tsx", "watch", "src/index.ts"]
```

---

## Task 1.5 — Create Frontend Dockerfile

**File:** `DOCKERVERSION/frontend/Dockerfile`

```dockerfile
# ---- Dependencies ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ---- Build ----
FROM deps AS build
COPY . .
RUN npm run build

# ---- Production ----
FROM nginx:alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

# ---- Development ----
FROM deps AS dev
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
```

---

## Task 1.6 — Create Nginx Config

**File:** `DOCKERVERSION/frontend/nginx.conf`

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # SPA routing — all non-file requests go to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to backend
    location /api/ {
        proxy_pass http://backend:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Proxy WebSocket connections to backend
    location /ws/ {
        proxy_pass http://backend:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
    gzip_min_length 256;
}
```

---

## Task 1.7 — Create Database Init Script

**File:** `DOCKERVERSION/db/init.sql`

```sql
-- This runs automatically on first PostgreSQL startup.
-- The database and user are created by POSTGRES_USER/POSTGRES_DB env vars.
-- This file adds extensions and verifies connectivity.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Verify the database is ready
SELECT 'HLC database initialized successfully' AS status;
```

---

## Task 1.8 — Create Backend package.json

**File:** `DOCKERVERSION/backend/package.json`

```json
{
  "name": "hlc-backend",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "dockerode": "^4.0.4",
    "express": "^4.21.1",
    "helmet": "^8.0.0",
    "pg": "^8.13.1",
    "pino": "^9.6.0",
    "pino-pretty": "^13.0.0",
    "ws": "^8.18.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/dockerode": "^3.3.34",
    "@types/express": "^5.0.0",
    "@types/node": "^22.10.0",
    "@types/pg": "^8.11.10",
    "@types/ws": "^8.5.13",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2"
  }
}
```

---

## Task 1.9 — Create Backend tsconfig.json

**File:** `DOCKERVERSION/backend/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Task 1.10 — Create Minimal Backend Entry Point

**File:** `DOCKERVERSION/backend/src/index.ts`

This is a minimal server that proves the build works, Docker socket is accessible, and DB is connected.

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import Dockerode from 'dockerode';
import pg from 'pg';

const app = express();
const port = 3001;

app.use(helmet());
app.use(cors());
app.use(express.json());

// Docker connection
const docker = new Dockerode({ socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock' });

// Database connection
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Health check endpoint
app.get('/api/health', async (_req, res) => {
  let dockerOk = false;
  let dbOk = false;

  try {
    await docker.ping();
    dockerOk = true;
  } catch { /* Docker not accessible */ }

  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    dbOk = true;
  } catch { /* DB not accessible */ }

  const status = dockerOk && dbOk ? 'ok' : 'degraded';
  res.status(dockerOk && dbOk ? 200 : 503).json({ status, docker: dockerOk, database: dbOk });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`HLC Backend listening on port ${port}`);
});
```

---

## Task 1.11 — Create Minimal Frontend

Scaffold a clean Vite + React + TypeScript project. **Do NOT copy Spark dependencies.**

### Files to Create:

**File:** `DOCKERVERSION/frontend/package.json`

```json
{
  "name": "hlc-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "build": "tsc -b --noCheck && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.1.0",
    "@types/react": "^19.0.10",
    "@types/react-dom": "^19.0.4",
    "@vitejs/plugin-react-swc": "^4.1.0",
    "tailwindcss": "^4.1.0",
    "typescript": "^5.7.2",
    "vite": "^6.2.0"
  }
}
```

**File:** `DOCKERVERSION/frontend/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

**File:** `DOCKERVERSION/frontend/vite.config.ts`

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

**File:** `DOCKERVERSION/frontend/index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>HLC - Homelab Command</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**File:** `DOCKERVERSION/frontend/src/main.tsx`

```tsx
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(<App />)
```

**File:** `DOCKERVERSION/frontend/src/App.tsx`

```tsx
function App() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold font-mono">HLC</h1>
        <p className="text-muted-foreground mt-2">Homelab Command — Phase 1 Complete</p>
      </div>
    </div>
  )
}

export default App
```

**File:** `DOCKERVERSION/frontend/src/index.css`

Copy the color system from the Spark prototype's `src/index.css` (the `:root` CSS custom properties and `@theme` block). This establishes the dark theme.

---

## Task 1.12 — Create Data Directories

Create placeholder directories so Docker bind mounts work:

```
DOCKERVERSION/data/stacks/.gitkeep
DOCKERVERSION/data/backups/.gitkeep
```

---

## Task 1.13 — Create DOCKERVERSION README

**File:** `DOCKERVERSION/README.md`

Quick-start instructions:

```markdown
# HLC — Homelab Command (Docker Version)

## Quick Start

1. Copy environment file:
   ```bash
   cp .env.example .env
   ```

2. Set a strong PostgreSQL password in `.env`

3. Build and start:
   ```bash
   docker compose up --build -d
   ```

4. Open http://localhost:3000

## Development

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Frontend: http://localhost:5173
Backend: http://localhost:3001/api/health
```

---

## Verification Steps

After creating all files:

```bash
cd DOCKERVERSION
cp .env.example .env
# Edit .env → set POSTGRES_PASSWORD=testpassword123
docker compose up --build
```

Expected output:
1. PostgreSQL starts, runs `init.sql`
2. Backend starts, connects to DB + Docker
3. Frontend builds, Nginx starts
4. `http://localhost:3000` → blank page with "HLC" title
5. `http://localhost:3000/api/health` → `{"status":"ok","docker":true,"database":true}`

---

## Files Created in This Phase

```
DOCKERVERSION/
├── docker-compose.yml
├── docker-compose.dev.yml
├── .env.example
├── README.md
├── db/
│   └── init.sql
├── data/
│   ├── stacks/.gitkeep
│   └── backups/.gitkeep
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       └── index.ts
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        └── index.css
```
