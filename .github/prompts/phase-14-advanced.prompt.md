---
mode: "agent"
description: "Implement Phase 14: Advanced — S3 backup targets, webhook templates, multi-node design"
tools: ["run_in_terminal", "create_file", "replace_string_in_file", "read_file", "grep_search", "file_search", "get_errors"]
---

# Phase 14 — Advanced Features (Future)

Optional enhancements. Only pursue after Phases 1–13 are solid.

## Prerequisites
Phases 1–13 complete and stable.

## Tasks

### 14.1 — S3 Backup Targets (`internal/backup/s3.go`)
```go
type S3Target struct {
    Endpoint  string
    Bucket    string
    AccessKey string
    SecretKey string
    Region    string
}

func (t *S3Target) Upload(ctx context.Context, localPath, remotePath string) error
func (t *S3Target) List(ctx context.Context, prefix string) ([]string, error)
func (t *S3Target) Download(ctx context.Context, remotePath, localPath string) error
```
- Support S3-compatible storage (AWS S3, MinIO, Backblaze B2).
- Upload after local backup completes.
- Use minimal S3 client (avoid full AWS SDK).
- Configurable via settings.

### 14.2 — Webhook Templates
- Extend generic webhook channel with Go template support.
- Customizable payload format per channel.
- Template variables: `{{.Title}}`, `{{.Body}}`, `{{.Level}}`, `{{.Container}}`, `{{.Event}}`.

### 14.3 — Multi-Node Support (Design Only)
Document architecture decisions — do not implement:
- Agent per node, central coordinator.
- gRPC or REST communication between nodes.
- Shared database or event bus federation.
- Node discovery and health.

## Acceptance Criteria
- [ ] S3 upload works for backup archives
- [ ] S3 download enables remote restore
- [ ] Webhook templates customizable per channel
- [ ] Multi-node architecture documented (not implemented)
