package stacks

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

// ReadEnvFile parses a .env file and returns key-value pairs.
func ReadEnvFile(path string) (map[string]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("read env file %s: %w", path, err)
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
		if len(v) >= 2 && ((v[0] == '"' && v[len(v)-1] == '"') || (v[0] == '\'' && v[len(v)-1] == '\'')) {
			v = v[1 : len(v)-1]
		}
		result[k] = v
	}
	return result, scanner.Err()
}

// WriteEnvFile writes key-value pairs to a .env file.
func WriteEnvFile(path string, vars map[string]string) error {
	var sb strings.Builder
	for k, v := range vars {
		if strings.ContainsAny(v, " \t\"'#") {
			fmt.Fprintf(&sb, "%s=%q\n", k, v)
		} else {
			fmt.Fprintf(&sb, "%s=%s\n", k, v)
		}
	}
	return os.WriteFile(path, []byte(sb.String()), 0o644)
}

// MergeEnvFiles merges global env vars into local .env (local overrides global).
func MergeEnvFiles(global, local map[string]string) map[string]string {
	merged := make(map[string]string, len(global)+len(local))
	for k, v := range global {
		merged[k] = v
	}
	for k, v := range local {
		merged[k] = v // local wins
	}
	return merged
}
