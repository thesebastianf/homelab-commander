---
mode: "agent"
description: "Implement Phase 10: Safety & Access — Token auth, read-only mode, safe mode boot"
tools: ["run_in_terminal", "create_file", "replace_string_in_file", "read_file", "grep_search", "file_search", "get_errors"]
---

# Phase 10 — Safety & Access

Authentication, authorization modes, and failsafe boot.

## Prerequisites
Phase 9 complete.

## Tasks

### 10.1 — Token Auth (`internal/auth/token.go`)
```go
type TokenAuth struct {
    tokenHash []byte
}

func NewTokenAuth(token string) (*TokenAuth, error)
func (a *TokenAuth) Middleware(next http.Handler) http.Handler
func (a *TokenAuth) ValidateToken(token string) bool
```
- Token from `HLC_API_TOKEN` env var.
- Stored as bcrypt hash, raw token never persisted.
- `Authorization: Bearer <token>` header.
- 401 for missing/invalid.

### 10.2 — Read-Only Mode (`internal/auth/mode.go`)
```go
type AccessMode string
const (
    ModeReadWrite AccessMode = "readwrite"
    ModeReadOnly  AccessMode = "readonly"
)

func ReadOnlyMiddleware(mode *AccessMode) func(http.Handler) http.Handler
```
- Block POST/PUT/DELETE with 403 when readonly.
- Settable via `HLC_MODE` env or settings API.

### 10.3 — Safe Mode Boot (`internal/auth/safemode.go`)
```go
func CheckSafeMode(db *sql.DB, dockerClient *docker.Client) (bool, []string)
```
Auto-activates if:
- Database corrupted / fails integrity check
- Docker socket unreachable
- Last shutdown unclean
- Critical NAS mounts offline at boot

In safe mode: all writes blocked, `X-HLC-SafeMode: true` header, `SystemSafeMode` event.

### 10.4 — Middleware Chain
```
TokenAuth → SafeMode → ReadOnly → Handler
```

## Acceptance Criteria
- [ ] API requires valid token (401 for invalid/missing)
- [ ] Read-only mode blocks mutations (403)
- [ ] Safe mode detects problems and activates automatically
- [ ] NAS offline at boot triggers safe mode
- [ ] Middleware stack works correctly
- [ ] `go test ./...` passes
