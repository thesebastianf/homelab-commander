package envhub

import (
	"bufio"
	"context"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// EnvUpdate describes a proposed change to a stack's .env file when a global
// env var value changes.
type EnvUpdate struct {
	StackName string
	FilePath  string
	OldValue  string
	NewValue  string
}

// Injector handles writing global env vars into stack .env files.
type Injector struct {
	store         Store
	baseStackPath string
}

// NewInjector creates a new Injector.
func NewInjector(store Store, baseStackPath string) *Injector {
	return &Injector{store: store, baseStackPath: baseStackPath}
}

// InjectIntoStack writes global env vars into a stack's .env file.
// Existing local values take priority unless force is true.
func (i *Injector) InjectIntoStack(ctx context.Context, stackDir string, force bool) error {
	globals, err := i.store.List(ctx)
	if err != nil {
		return fmt.Errorf("inject into stack %s: list globals: %w", stackDir, err)
	}

	envPath := filepath.Join(stackDir, ".env")

	local, err := readEnvFile(envPath)
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("inject into stack %s: read .env: %w", stackDir, err)
	}
	if local == nil {
		local = make(map[string]string)
	}

	merged := make(map[string]string)
	for _, g := range globals {
		merged[g.Key] = g.Value
	}
	if !force {
		for k, v := range local {
			merged[k] = v // local overrides global
		}
	}

	return writeEnvFile(envPath, merged)
}

// FindAffectedStacks returns paths of stack .env files that reference the given key.
func (i *Injector) FindAffectedStacks(ctx context.Context, key string) ([]string, error) {
	var affected []string

	err := filepath.WalkDir(i.baseStackPath, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil // skip inaccessible dirs
		}
		if d.IsDir() || d.Name() != ".env" {
			return nil
		}

		vars, readErr := readEnvFile(path)
		if readErr != nil {
			return nil
		}
		if _, ok := vars[key]; ok {
			affected = append(affected, path)
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("find affected stacks: %w", err)
	}
	return affected, nil
}

// ProposeUpdates returns stacks that reference key and would receive a new value.
func (i *Injector) ProposeUpdates(ctx context.Context, key, newValue string) ([]EnvUpdate, error) {
	affected, err := i.FindAffectedStacks(ctx, key)
	if err != nil {
		return nil, err
	}

	var updates []EnvUpdate
	for _, path := range affected {
		vars, _ := readEnvFile(path)
		stackName := filepath.Base(filepath.Dir(path))
		updates = append(updates, EnvUpdate{
			StackName: stackName,
			FilePath:  path,
			OldValue:  vars[key],
			NewValue:  newValue,
		})
	}
	return updates, nil
}

// readEnvFile parses a .env file into a key-value map.
func readEnvFile(path string) (map[string]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	result := make(map[string]string)
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		idx := strings.IndexByte(line, '=')
		if idx < 0 {
			continue
		}
		k := strings.TrimSpace(line[:idx])
		v := strings.TrimSpace(line[idx+1:])
		// Strip surrounding quotes.
		if len(v) >= 2 && ((v[0] == '"' && v[len(v)-1] == '"') || (v[0] == '\'' && v[len(v)-1] == '\'')) {
			v = v[1 : len(v)-1]
		}
		result[k] = v
	}
	return result, scanner.Err()
}

// writeEnvFile writes a key-value map to a .env file.
func writeEnvFile(path string, vars map[string]string) error {
	var sb strings.Builder
	for k, v := range vars {
		// Quote values that contain spaces or special characters.
		if strings.ContainsAny(v, " \t\"'#") {
			fmt.Fprintf(&sb, "%s=%q\n", k, v)
		} else {
			fmt.Fprintf(&sb, "%s=%s\n", k, v)
		}
	}
	return os.WriteFile(path, []byte(sb.String()), 0o644)
}
