---
mode: "agent"
description: "Implement Phase 13: Migration Wizard — Full server export/import, path mapping, stack portability"
tools: ["run_in_terminal", "create_file", "replace_string_in_file", "read_file", "grep_search", "file_search", "get_errors"]
---

# Phase 13 — Migration Wizard

One-click server migration: export everything, transfer, import with path remapping.

## Prerequisites
Phase 12 complete.

## Tasks

### 13.1 — Export Engine (`internal/migrate/export.go`)
```go
type ExportManifest struct {
    Version     string              `json:"version"`
    ExportedAt  time.Time           `json:"exported_at"`
    InstanceName string             `json:"instance_name"`
    Settings    map[string]string   `json:"settings"`
    GlobalEnvs  []envhub.EnvVar     `json:"global_envs"`
    Policies    []core.Policy       `json:"policies"`
    Stacks      []StackExport       `json:"stacks"`
    Notifications []NotificationExport `json:"notifications"`
}

type StackExport struct {
    Name        string            `json:"name"`
    ComposeFile string            `json:"compose_file"` // raw content
    EnvFile     string            `json:"env_file"`     // raw content
    Labels      map[string]string `json:"labels"`       // hlc.* labels
}

func Export(ctx context.Context, opts ExportOptions) (*ExportManifest, string, error)
```

Export creates a `.tar.gz` archive containing:
```
hlc-export-2026-03-30/
  manifest.json          # ExportManifest
  hlc.db                 # SQLite database copy
  stacks/
    media-stack/
      docker-compose.yml
      .env
    infra-stack/
      docker-compose.yml
      .env
  backups/               # optional: include backup archives
    ...
```

Options:
- `IncludeBackups bool` — include backup archives (can be large)
- `IncludeDatabase bool` — include hlc.db copy

### 13.2 — Import Engine (`internal/migrate/import.go`)
```go
type ImportPlan struct {
    Manifest     ExportManifest
    PathMappings map[string]string // old path → new path
    Conflicts    []string          // warnings
    Ready        bool
}

func AnalyzeImport(ctx context.Context, archivePath string) (*ImportPlan, error)
func ExecuteImport(ctx context.Context, plan *ImportPlan) error
```

Import flow:
1. Extract archive to temp directory.
2. Parse manifest.
3. Detect path conflicts (old base paths vs new).
4. Present path mapping UI (old → new).
5. Apply:
   - Copy stack compose files to new `base_stack_path`
   - Remap paths in compose files (volume mounts, etc.)
   - Import settings (merge, don't overwrite)
   - Import global envs (merge)
   - Import policies
   - Import notification channels
6. Optionally restore hlc.db (full replace or merge).

### 13.3 — Path Remapper
```go
func RemapPaths(content string, mappings map[string]string) string
```
- Replace old paths with new paths in compose files and .env files.
- Handle both absolute paths and template variables.
- Preview changes before applying.

### 13.4 — API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/migrate/export` | Generate export archive |
| GET | `/api/v1/migrate/export/:id` | Download export archive |
| POST | `/api/v1/migrate/import/analyze` | Upload + analyze archive |
| POST | `/api/v1/migrate/import/execute` | Execute import with mappings |

### 13.5 — UI Wizard (in Phase 12 migration.html)
3-step wizard:
1. **Export** or **Import** choice
2. **Export**: Select options (include backups? include DB?) → Download
3. **Import**: Upload archive → Review path mappings → Confirm → Apply

## Acceptance Criteria
- [ ] Export creates valid .tar.gz with manifest, stacks, and optional backups
- [ ] Import analyzes archive and detects path conflicts
- [ ] Path remapping works in compose files and .env files
- [ ] Settings, envs, policies, and notification channels imported correctly
- [ ] Migration wizard UI guides through export and import
- [ ] `go test ./...` passes
