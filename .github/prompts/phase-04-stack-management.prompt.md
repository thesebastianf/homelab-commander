---
mode: "agent"
description: "Implement Phase 4: Stack Management — Compose file scanning, stack CRUD, env injection, Dockge-style operations"
tools: ["run_in_terminal", "create_file", "replace_string_in_file", "read_file", "grep_search", "file_search", "get_errors"]
---

# Phase 4 — Stack Management (Dockge-Style)

First-class compose file management: discover stacks from filesystem, CRUD operations, env injection from Global Env Hub.

## Prerequisites
Phase 3 complete — Label Intelligence and Env Hub working.

## Tasks

### 4.1 — Stack Scanner (`internal/stacks/scanner.go`)
```go
type StackInfo struct {
    Name          string
    Dir           string              // absolute path to stack directory
    ComposeFile   string              // path to compose file
    EnvFile       string              // path to .env file (may not exist)
    HasEnvFile    bool
    Containers    []docker.Container   // running containers for this stack
    Status        StackStatus
}

type StackStatus string
const (
    StackRunning  StackStatus = "running"
    StackPartial  StackStatus = "partial"   // some containers running
    StackStopped  StackStatus = "stopped"
    StackUnknown  StackStatus = "unknown"
)

func ScanStacks(ctx context.Context, baseDir string) ([]StackInfo, error)
```
- Walk `baseDir` (from `base_stack_path` setting).
- For each subdirectory, check for `docker-compose.yml`, `docker-compose.yaml`, or `compose.yml`.
- Read compose file to extract service names.
- Correlate with running containers via `com.docker.compose.project` label.
- Determine stack status from container states.

### 4.2 — Stack Operations (`internal/stacks/operations.go`)
```go
type Operator struct {
    baseDir      string
    dockerClient *docker.Client
    envInjector  *envhub.Injector
    eventBus     core.EventBus
    policyEngine core.PolicyEngine
}

func (o *Operator) Up(ctx context.Context, stackName string) error
func (o *Operator) Down(ctx context.Context, stackName string) error
func (o *Operator) Restart(ctx context.Context, stackName string) error
func (o *Operator) Pull(ctx context.Context, stackName string) error
func (o *Operator) Logs(ctx context.Context, stackName string, tail int) (string, error)
```
- All operations run `docker compose` CLI via `os/exec`.
- Before `Up`: check Policy Engine (MSM blocks), inject global envs if needed.
- Publish events: `StackStarted`, `StackStopped`, `StackRestarted`.

### 4.3 — Compose File CRUD (`internal/stacks/compose.go`)
```go
// Read compose file as raw YAML string (for Monaco editor)
func (o *Operator) ReadCompose(ctx context.Context, stackName string) (string, error)

// Write compose file from raw YAML string (from Monaco editor)
func (o *Operator) WriteCompose(ctx context.Context, stackName string, content string) error

// Create a new stack directory with compose file and optional .env
func (o *Operator) CreateStack(ctx context.Context, name string, composeContent string) error

// Delete a stack (stop first, then remove directory)
func (o *Operator) DeleteStack(ctx context.Context, stackName string) error

// Validate compose file syntax before writing
func ValidateCompose(content string) error
```
- Validate YAML syntax before writing.
- `WriteCompose` creates a timestamped backup of the old file before overwriting.
- `DeleteStack` requires confirmation / stack must be stopped.

### 4.4 — Env File Management (`internal/stacks/envfile.go`)
```go
// ReadEnvFile reads a stack's .env file and returns key-value pairs
func ReadEnvFile(path string) (map[string]string, error)

// WriteEnvFile writes key-value pairs to a .env file
func WriteEnvFile(path string, vars map[string]string) error

// MergeEnvFiles merges global env vars into local .env (local overrides global)
func MergeEnvFiles(global, local map[string]string) map[string]string
```

### 4.5 — API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/stacks` | List all discovered stacks with status |
| GET | `/api/v1/stacks/:name` | Stack detail (containers, mounts, env) |
| POST | `/api/v1/stacks` | Create new stack (name + compose YAML) |
| DELETE | `/api/v1/stacks/:name` | Delete stack (must be stopped) |
| GET | `/api/v1/stacks/:name/compose` | Get compose file content (raw YAML) |
| PUT | `/api/v1/stacks/:name/compose` | Update compose file (validates first) |
| GET | `/api/v1/stacks/:name/env` | Get stack .env variables |
| PUT | `/api/v1/stacks/:name/env` | Update stack .env variables |
| POST | `/api/v1/stacks/:name/inject-env` | Inject global envs into stack .env |
| POST | `/api/v1/stacks/:name/up` | Start stack |
| POST | `/api/v1/stacks/:name/down` | Stop stack |
| POST | `/api/v1/stacks/:name/restart` | Restart stack |
| POST | `/api/v1/stacks/:name/pull` | Pull latest images |
| GET | `/api/v1/stacks/:name/logs` | Get stack logs (tail N lines) |

### 4.6 — Tests
- Scan directory with multiple valid stacks and non-stack dirs.
- Compose read/write round-trip.
- Env injection merges correctly (local overrides global).
- Validate rejects invalid YAML.
- Stack CRUD lifecycle (create → read → update → delete).

## Acceptance Criteria
- [ ] Stacks discovered from filesystem by scanning compose files
- [ ] Compose file CRUD works with validation and backup
- [ ] Env injection merges global env vars into stack .env
- [ ] Stack operations (up/down/restart/pull) work via docker compose CLI
- [ ] Policy Engine checked before stack operations
- [ ] Events published for stack state changes
- [ ] `go test ./...` passes
