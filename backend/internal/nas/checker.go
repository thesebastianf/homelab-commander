// Package nas provides NAS mount verification and boot sequencing.
package nas

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// ErrMountNotReady is returned when a mount is not available.
var ErrMountNotReady = errors.New("mount not ready")

// MountStatus categorises the health of a mount point.
type MountStatus string

const (
	MountHealthy  MountStatus = "healthy"
	MountDegraded MountStatus = "degraded"
	MountOffline  MountStatus = "offline"
)

// MountCheck represents the result of checking a single mount point.
type MountCheck struct {
	Path   string
	Status MountStatus
	Reason string
}

// Checker performs filesystem-based mount health checks.
type Checker struct {
	anchorFile string // filename to look for at mount root (e.g. ".hlc_ready")
}

// NewChecker returns a Checker. anchorFile may be empty to skip anchor verification.
func NewChecker(anchorFile string) *Checker {
	if anchorFile == "" {
		anchorFile = ".hlc_ready"
	}
	return &Checker{anchorFile: anchorFile}
}

// CheckMount checks the health of a mount by:
//  1. os.Stat existence of the root path
//  2. Anchor file presence at mount root
//  3. Read test on anchor file
func (c *Checker) CheckMount(_ context.Context, mountPath string) MountCheck {
	mc := MountCheck{Path: mountPath}

	// Step 1: path existence.
	info, err := os.Stat(mountPath)
	if err != nil {
		mc.Status = MountOffline
		mc.Reason = fmt.Sprintf("path not accessible: %v", err)
		return mc
	}
	if !info.IsDir() {
		mc.Status = MountOffline
		mc.Reason = "path is not a directory"
		return mc
	}

	// Step 2: anchor file presence.
	anchorPath := filepath.Join(mountPath, c.anchorFile)
	anchorInfo, err := os.Stat(anchorPath)
	if err != nil {
		if os.IsNotExist(err) {
			// Path exists but no anchor — degraded (mounted but not ready).
			mc.Status = MountDegraded
			mc.Reason = fmt.Sprintf("anchor file %q not found", c.anchorFile)
			return mc
		}
		mc.Status = MountDegraded
		mc.Reason = fmt.Sprintf("anchor file stat error: %v", err)
		return mc
	}
	if anchorInfo.IsDir() {
		mc.Status = MountDegraded
		mc.Reason = fmt.Sprintf("anchor %q is a directory, not a file", c.anchorFile)
		return mc
	}

	// Step 3: read test.
	f, err := os.Open(anchorPath)
	if err != nil {
		mc.Status = MountDegraded
		mc.Reason = fmt.Sprintf("cannot read anchor file: %v", err)
		return mc
	}
	f.Close()

	mc.Status = MountHealthy
	return mc
}

// CheckAll checks multiple mount paths and returns a list of results.
func (c *Checker) CheckAll(ctx context.Context, paths []string) []MountCheck {
	results := make([]MountCheck, 0, len(paths))
	for _, p := range paths {
		results = append(results, c.CheckMount(ctx, p))
	}
	return results
}
