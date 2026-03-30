package stacks

import (
	"context"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/thesebastianf/hlc/internal/docker"
)

// StackStatus describes the aggregate running state of a stack's containers.
type StackStatus string

const (
	StackRunning StackStatus = "running"
	StackPartial StackStatus = "partial"
	StackStopped StackStatus = "stopped"
	StackUnknown StackStatus = "unknown"
)

// StackInfo describes a discovered compose stack.
type StackInfo struct {
	Name        string
	Dir         string
	ComposeFile string
	EnvFile     string
	HasEnvFile  bool
	Containers  []docker.Container
	Status      StackStatus
}

var composeFileNames = []string{
	"docker-compose.yml",
	"docker-compose.yaml",
	"compose.yml",
	"compose.yaml",
}

// ScanStacks walks baseDir looking for compose files and returns a StackInfo
// for each subdirectory that contains one.
func ScanStacks(ctx context.Context, baseDir string, containers []docker.Container) ([]StackInfo, error) {
	var stacks []StackInfo

	entries, err := os.ReadDir(baseDir)
	if err != nil {
		return nil, fmt.Errorf("scan stacks %s: %w", baseDir, err)
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		stackDir := filepath.Join(baseDir, entry.Name())
		composePath, found := findComposeFile(stackDir)
		if !found {
			continue
		}

		envPath := filepath.Join(stackDir, ".env")
		_, envErr := os.Stat(envPath)

		// Find containers belonging to this stack via compose project label.
		stackContainers := filterContainersForStack(containers, entry.Name())
		status := deriveStatus(stackContainers)

		stacks = append(stacks, StackInfo{
			Name:        entry.Name(),
			Dir:         stackDir,
			ComposeFile: composePath,
			EnvFile:     envPath,
			HasEnvFile:  envErr == nil,
			Containers:  stackContainers,
			Status:      status,
		})
	}

	return stacks, nil
}

// findComposeFile returns the path to the first compose file found in dir.
func findComposeFile(dir string) (string, bool) {
	for _, name := range composeFileNames {
		path := filepath.Join(dir, name)
		if _, err := os.Stat(path); err == nil {
			return path, true
		}
	}
	return "", false
}

// filterContainersForStack returns containers whose com.docker.compose.project
// label matches stackName, or whose name starts with the stackName prefix.
func filterContainersForStack(containers []docker.Container, stackName string) []docker.Container {
	var result []docker.Container
	for _, c := range containers {
		project := c.Labels["com.docker.compose.project"]
		if project == stackName || strings.HasPrefix(c.Name, stackName+"-") || strings.HasPrefix(c.Name, stackName+"_") {
			result = append(result, c)
		}
	}
	return result
}

// deriveStatus determines a stack's aggregate status.
func deriveStatus(containers []docker.Container) StackStatus {
	if len(containers) == 0 {
		return StackUnknown
	}
	running := 0
	for _, c := range containers {
		if c.State == "running" {
			running++
		}
	}
	switch {
	case running == len(containers):
		return StackRunning
	case running == 0:
		return StackStopped
	default:
		return StackPartial
	}
}

// walkDir is a helper for finding .env files under baseDir.
func walkDir(baseDir string, fn func(path string, d fs.DirEntry) error) error {
	return filepath.WalkDir(baseDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		return fn(path, d)
	})
}
