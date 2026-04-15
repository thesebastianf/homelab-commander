# Homelab Commander — Copilot Instructions

## Project Identity

- **Name:** Homelab Commander
- **Type:** Self-hosted Docker management dashboard for homelab operators
- **Monorepo path:** `DOCKERVERSION/iteration0/`
- **Three services:** frontend (React/Vite/NGINX), backend (Node/Express), db (PostgreSQL 16)

## Quick Reference

| Item | Value |
|------|-------|
| Frontend port | 3210 (host) → 80 (nginx) |
| Backend port | 3001 |
| Frontend URL | `http://host:3210` |
| Dev frontend URL | `http://localhost:5173` |
| DB credentials | `hlc` / see `.env` |
| Frontend type-check | `cd frontend && ./node_modules/.bin/tsc --noEmit` |
| Build frontend | `cd frontend && npm run build` |
| Build backend | `cd backend && npm run build` |
| Run full stack | `docker compose up -d --build` |
| Run dev mode | `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build` |

## Architecture Rules

### Backend (`backend/src/`)

- **Runtime:** Node.js 22, Express 5, TypeScript (strict), ESM (`"type": "module"`)
- **Entry point:** `index.ts` — registers middleware stack then 12 route modules
- **Route pattern:** Every route handler MUST be wrapped in `asyncHandler()` from `lib/asyncHandler.ts`
- **Validation:** Request bodies validated with Zod schemas (`validation/schemas.ts`) via `validate()` middleware (`middleware/validate.ts`)
- **Database:** Raw SQL via `pg` Pool (imported from `database.ts`). Always use parameterized queries (`$1`, `$2`). NEVER concatenate user input into SQL strings.
- **Docker:** All Docker operations go through `services/docker.ts` which wraps Dockerode. Never import Dockerode directly in routes.
- **Logging:** Use `logger` from `logger.ts` (Pino). Never `console.log`.
- **Audit:** Call `auditLog(action, resourceType, resourceId?, details?)` from `lib/audit.ts` for write operations.
- **Config:** All env vars accessed through `config.ts`. Never read `process.env` directly elsewhere.
- **File naming:** Routes → `routes/resourceName.ts`, Services → `services/serviceName.ts`
- **Response format:** `res.json(data)` for success, `res.status(code).json({ error: 'message' })` for errors

### Frontend (`frontend/src/`)

- **Runtime:** React 19, Vite 7, TypeScript (strictNullChecks), TailwindCSS 4
- **State management:** `@tanstack/react-query` v5 — no Redux, no Zustand, no Context for server state
- **Path alias:** `@/` maps to `src/`. Always use `@/` in imports.
- **Component library:** shadcn/ui components in `components/ui/`. Do NOT modify files in `ui/` — they are generated.
- **Icons:** Import from `lucide-react`. Do NOT use other icon libraries.
- **Toasts:** Use `toast.success()` / `toast.error()` / `toast.info()` from `sonner`. Never `alert()` or `window.confirm()`.
- **Types:** All shared interfaces live in `lib/types.ts`. Export interfaces, not types, for objects.
- **API layer:** All fetch calls in `lib/api.ts`. These are plain async functions, NOT hooks.
- **Hooks layer:** React Query hooks in `hooks/use*.ts`. One file per resource domain. Pattern:
  ```ts
  export function useThings() {
    return useQuery({ queryKey: ['things'], queryFn: api.fetchThings });
  }
  export function useCreateThing() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: api.createThing,
      onSuccess: () => qc.invalidateQueries({ queryKey: ['things'] }),
    });
  }
  ```
- **File naming:** Components → PascalCase (`ContainerCard.tsx`), hooks → camelCase (`useContainers.ts`), libs → camelCase (`api.ts`)

### Database (`db/init.sql`)

- All tables use `UUID` primary keys via `gen_random_uuid()` (pgcrypto extension)
- `settings` table is singleton (id=1, CHECK constraint)
- Foreign keys use `ON DELETE CASCADE`
- Timestamps are `TIMESTAMPTZ DEFAULT NOW()`
- JSONB columns for flexible config (notification_config, home_assistant_config, git_repo_config, etc.)
- Enums are enforced via CHECK constraints, not PostgreSQL ENUM types

## Key Patterns

### Adding a New Feature End-to-End

1. **Schema:** Add table to `db/init.sql` with UUID PK, timestamps, and appropriate constraints
2. **Types:** Add interface to `frontend/src/lib/types.ts`
3. **Zod schema:** Add validation to `backend/src/validation/schemas.ts`
4. **Service:** If it needs Docker or complex logic, add to `backend/src/services/`
5. **Route:** Create `backend/src/routes/newFeature.ts` — use `asyncHandler`, `validate`, `auditLog`
6. **Register route:** Mount in `backend/src/index.ts`: `app.use('/api/new-feature', newFeatureRoutes)`
7. **API functions:** Add to `frontend/src/lib/api.ts`
8. **Hook:** Create `frontend/src/hooks/useNewFeature.ts` with React Query hooks
9. **Component:** Create UI in `frontend/src/components/NewFeatureDialog.tsx`
10. **Wire up:** Import and render component in `App.tsx`

### Component Structure

Dialogs follow this pattern:
```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { toast } from 'sonner'

interface MyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // domain props
}

export function MyDialog({ open, onOpenChange, ...props }: MyDialogProps) {
  // local state
  // handlers
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>...</DialogTitle>
          <DialogDescription>...</DialogDescription>
        </DialogHeader>
        {/* content */}
      </DialogContent>
    </Dialog>
  )
}
```

### Backend Route Pattern

```ts
import { Router } from 'express';
import { pool } from '../database.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { auditLog } from '../lib/audit.js';
import { validate } from '../middleware/validate.js';
import { mySchema } from '../validation/schemas.js';

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM my_table ORDER BY created_at DESC');
  res.json(rows.map(mapRow));
}));

router.post('/', validate(mySchema), asyncHandler(async (req, res) => {
  const { rows: [row] } = await pool.query(
    'INSERT INTO my_table (col1, col2) VALUES ($1, $2) RETURNING *',
    [req.body.col1, req.body.col2]
  );
  await auditLog('my_table.create', 'my_table', row.id);
  res.status(201).json(mapRow(row));
}));

export default router;
```

## Styling Conventions

- **Theme:** Dark theme with oklch colors, defined via CSS variables in `index.css`
- **Fonts:** JetBrains Mono (monospace/code), Roboto (body text)
- **Layout:** Single-page tabbed interface. No router — tabs managed via shadcn `<Tabs>` component.
- **Cards:** Use `<Card>` from shadcn/ui for resource items with consistent padding
- **Badges:** Status badges use semantic variants: `default` (active), `outline` (inactive), `destructive` (error/conflict)
- **Spacing:** Use Tailwind classes. Standard gaps: `gap-2` (tight), `gap-3` (normal), `gap-4` (loose)
- **Typography:** `font-mono` for technical values (ports, paths, versions). `text-sm` for card content. `text-xs` for metadata.
- **Responsive:** Not a priority (homelab dashboard is desktop-oriented), but avoid hardcoded pixel widths.

## Security Requirements

- All SQL queries MUST be parameterized — never interpolate variables into query strings
- User input MUST be validated with Zod schemas before use
- Container/resource IDs MUST be encoded with `encodeURIComponent()` in API URLs
- Auth header comparison MUST use `timingSafeEqual` (already implemented in basicAuth.ts)
- Never expose database credentials, auth tokens, or internal paths in API responses
- Docker socket access is required but inherently privileged — document this tradeoff

## File Locations Reference

| What | Where |
|------|-------|
| Database schema | `db/init.sql` |
| All TypeScript interfaces | `frontend/src/lib/types.ts` |
| All API fetch functions | `frontend/src/lib/api.ts` |
| All Zod schemas | `backend/src/validation/schemas.ts` |
| Backend config | `backend/src/config.ts` |
| Environment variables | `.env` / `.env.example` |
| Docker setup | `docker-compose.yml` |
| Frontend entry | `frontend/src/App.tsx` |
| Backend entry | `backend/src/index.ts` |
| nginx config | `frontend/nginx.conf` |
| Project docs | `DOCUMENTATION.md` |

## Things NOT to Do

- Do NOT add a client-side router (React Router, etc.) — the app uses tab-based navigation
- Do NOT use `console.log` in backend — use `logger.info/warn/error/debug`
- Do NOT modify `components/ui/*.tsx` files — these are shadcn/ui generated
- Do NOT add new npm packages without justification — the stack is deliberately minimal
- Do NOT add Redux, Zustand, Jotai, or other client state libraries — React Query handles it
- Do NOT create ORM models — we use raw SQL with `pg` for full control
- Do NOT add a separate migration tool — schema is managed via `init.sql` (init on first boot)
- Do NOT store secrets in code — use environment variables via `.env`
- Do NOT use `any` in TypeScript — use proper types or `unknown` with narrowing
