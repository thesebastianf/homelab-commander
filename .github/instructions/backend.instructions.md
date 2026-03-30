---
applyTo: "backend/**/*.go"
---

# Backend Go Instructions (V2)

## Package Layout

Each package under `internal/` is a bounded context. Do not import across sibling packages
except through interfaces or the Event Bus.

Dependency flow (allowed imports):
```
cmd/hlc → api → (backup, update, docker, labels, stacks, nas, envhub, scheduler,
                  observability, audit, auth, notification, migrate)
                  ↕ all publish/subscribe via core.EventBus
                  ↕ all persist via db
                  ↕ envhub provides shared config to stacks, backup, scheduler
```

## Docker Integration

- Use the Docker Engine API via unix socket (`/var/run/docker.sock`).
- Use `net/http` with a Unix socket transport — avoid heavy SDK dependencies.
- Parse `hlc.*` labels from container inspect responses.
- Stream events via Docker `/events` endpoint (SSE-style, long-lived connection).

### Exception: Compose CLI
For stack-level operations (`up`, `down`, `restart`, `pull`), shell out to `docker compose`:
```go
func RunCompose(ctx context.Context, projectDir string, args ...string) (string, error)
```
- Use `os/exec` with context cancellation.
- Capture stdout/stderr.
- Set working directory to the stack's compose file location.
- This is the **only** place where we shell out — all other Docker interaction uses the socket API.

## Database (SQLite)

- Use `modernc.org/sqlite` (pure Go, no CGO).
- Migrations: numbered SQL files in `db/migrations/`, applied at startup.
- Use `database/sql` standard interface.
- All writes through transactions.
- DB file location: configurable via `HLC_DB_PATH`, default `./data/hlc.db`.

## Global Env Hub

- Env vars stored in `global_envs` SQLite table.
- Path presets stored in `settings` table (`base_stack_path`, `base_volume_path`).
- Template syntax: `{{BASE_STACK}}`, `{{BASE_VOL}}`, `{{TZ}}`, etc.
- Injection writes resolved values into stack `.env` files.
- On global value change, query all stack `.env` files for affected references.

## NAS / Mount Handling

- Check mount readiness via:
  1. Path existence (`os.Stat`)
  2. Anchor file check (e.g., `.hlc_ready` file at mount root)
  3. Read test (attempt to read anchor file contents)
- Do NOT use `ping` for mount verification — use filesystem checks.
- Mount checks run on a configurable interval (default: 10s during boot, 60s steady-state).
- Emit `MountReady` / `MountLost` events to Event Bus.

## Error Handling

- Wrap errors: `fmt.Errorf("backup container %s: %w", name, err)`.
- Return errors, don't panic.
- Use sentinel errors for expected conditions (e.g., `ErrContainerNotFound`, `ErrMountNotReady`).

## Testing

- Table-driven tests with `t.Run()`.
- Mock Docker, DB, and filesystem via interfaces.
- Test file naming: `*_test.go` in the same package.
- Use `t.TempDir()` for file system tests.
- For NAS tests: create temp dirs with/without anchor files.

## Concurrency

- Event Bus subscriptions run in separate goroutines.
- Use `context.Context` for cancellation.
- Protect shared state with `sync.Mutex` or channels.
- Scheduler runs jobs in separate goroutines with context.
- Graceful shutdown: listen for `SIGTERM`/`SIGINT`, drain Event Bus, stop scheduler.
