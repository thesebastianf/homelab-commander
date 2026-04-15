package labels

import (
	"strconv"
	"strings"
)

const prefix = "hlc."

// ContainerClassification holds all parsed hlc.* label values for a container.
type ContainerClassification struct {
	Role           string
	UpdatePolicy   string
	UpdateSchedule string
	BackupStrategy string
	BackupStop     bool
	DBType         string
	Stack          string
	Priority       string
	WaitForMounts  []string
	StartupOrder   int
	HomepageURL    string
	RawLabels      map[string]string
}

// Parse extracts hlc.* labels from a raw label map and returns a
// ContainerClassification with sensible defaults applied.
func Parse(labels map[string]string) ContainerClassification {
	c := ContainerClassification{
		Role:           "app",
		UpdatePolicy:   "manual",
		BackupStrategy: "none",
		Priority:       "normal",
		StartupOrder:   50,
		RawLabels:      make(map[string]string),
	}

	for k, v := range labels {
		if !strings.HasPrefix(k, prefix) {
			continue
		}
		c.RawLabels[k] = v

		switch k {
		case "hlc.role":
			c.Role = v
		case "hlc.update.policy":
			c.UpdatePolicy = v
		case "hlc.update.schedule":
			c.UpdateSchedule = v
		case "hlc.backup.strategy":
			c.BackupStrategy = v
		case "hlc.backup.stop":
			c.BackupStop = v == "true"
		case "hlc.backup.db-type":
			c.DBType = v
		case "hlc.stack":
			c.Stack = v
		case "hlc.priority":
			c.Priority = v
		case "hlc.wait_for_mount":
			c.WaitForMounts = parsePaths(v)
		case "hlc.startup.order":
			if n, err := strconv.Atoi(v); err == nil {
				c.StartupOrder = n
			}
		case "hlc.homepage.url":
			c.HomepageURL = v
		}
	}

	return c
}

// Validate returns a list of warnings for any misconfigured labels.
func (c ContainerClassification) Validate() []string {
	var warnings []string

	validRoles := map[string]bool{"db": true, "stateless": true, "cache": true, "proxy": true, "app": true}
	if !validRoles[c.Role] {
		warnings = append(warnings, "unknown hlc.role value: "+c.Role)
	}

	validPolicies := map[string]bool{"auto": true, "manual": true, "pin": true}
	if !validPolicies[c.UpdatePolicy] {
		warnings = append(warnings, "unknown hlc.update.policy value: "+c.UpdatePolicy)
	}

	validStrategies := map[string]bool{"full": true, "db-dump": true, "none": true}
	if !validStrategies[c.BackupStrategy] {
		warnings = append(warnings, "unknown hlc.backup.strategy value: "+c.BackupStrategy)
	}

	if c.BackupStrategy == "db-dump" && c.DBType == "" {
		warnings = append(warnings, "hlc.backup.strategy=db-dump requires hlc.backup.db-type to be set")
	}

	validDBTypes := map[string]bool{"postgres": true, "mariadb": true, "mysql": true, "redis": true}
	if c.DBType != "" && !validDBTypes[c.DBType] {
		warnings = append(warnings, "unknown hlc.backup.db-type value: "+c.DBType)
	}

	validPriorities := map[string]bool{"critical": true, "normal": true, "low": true}
	if !validPriorities[c.Priority] {
		warnings = append(warnings, "unknown hlc.priority value: "+c.Priority)
	}

	return warnings
}

// HasMountConditions returns true if the container declares NAS mount dependencies.
func (c ContainerClassification) HasMountConditions() bool {
	return len(c.WaitForMounts) > 0
}

// NeedsDatabaseDump returns true if the backup strategy requires a DB dump.
func (c ContainerClassification) NeedsDatabaseDump() bool {
	return c.BackupStrategy == "db-dump"
}

// parsePaths splits a comma-separated path list, trimming spaces.
func parsePaths(s string) []string {
	parts := strings.Split(s, ",")
	var result []string
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			result = append(result, p)
		}
	}
	return result
}
