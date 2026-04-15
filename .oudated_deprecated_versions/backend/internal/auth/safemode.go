package auth

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/thesebastianf/hlc/internal/docker"
)

// SafeCheckResult summarises the system health at startup.
type SafeCheckResult struct {
	DBIntegrity  bool
	DockerSocket bool
	Problems     []string
}

// CheckSafeMode verifies DB integrity and Docker socket reachability.
func CheckSafeMode(ctx context.Context, db *sql.DB, dc *docker.Client) SafeCheckResult {
	result := SafeCheckResult{DBIntegrity: true, DockerSocket: true}

	// Check DB integrity.
	var integrityResult string
	err := db.QueryRowContext(ctx, `PRAGMA integrity_check`).Scan(&integrityResult)
	if err != nil || integrityResult != "ok" {
		result.DBIntegrity = false
		result.Problems = append(result.Problems, fmt.Sprintf("DB integrity check failed: %v (result=%s)", err, integrityResult))
	}

	// Check Docker socket.
	_, err = dc.Get(ctx, "/version")
	if err != nil {
		result.DockerSocket = false
		result.Problems = append(result.Problems, fmt.Sprintf("Docker socket unreachable: %v", err))
	}

	return result
}
