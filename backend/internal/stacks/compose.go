package stacks

import (
	"fmt"
	"os"
	"time"

	"gopkg.in/yaml.v3"
)

// ReadCompose returns the raw YAML content of a stack's compose file.
func ReadCompose(composePath string) (string, error) {
	data, err := os.ReadFile(composePath)
	if err != nil {
		return "", fmt.Errorf("read compose %s: %w", composePath, err)
	}
	return string(data), nil
}

// WriteCompose writes raw YAML content, first creating a timestamped backup of
// the existing file.
func WriteCompose(composePath, content string) error {
	// Backup existing file before overwriting.
	if _, err := os.Stat(composePath); err == nil {
		backupPath := composePath + ".bak." + time.Now().Format("20060102150405")
		data, err := os.ReadFile(composePath)
		if err != nil {
			return fmt.Errorf("backup compose %s: %w", composePath, err)
		}
		if err := os.WriteFile(backupPath, data, 0o644); err != nil {
			return fmt.Errorf("write backup %s: %w", backupPath, err)
		}
	}

	return os.WriteFile(composePath, []byte(content), 0o644)
}

// ValidateCompose checks that content is valid YAML with a top-level "services" key.
func ValidateCompose(content string) error {
	var top map[string]any
	if err := yaml.Unmarshal([]byte(content), &top); err != nil {
		return fmt.Errorf("invalid YAML: %w", err)
	}
	if _, ok := top["services"]; !ok {
		return fmt.Errorf("compose file missing top-level 'services' key")
	}
	return nil
}
