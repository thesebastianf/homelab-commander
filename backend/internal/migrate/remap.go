package migrate

import "strings"

// RemapPaths replaces occurrences of old paths with new paths in text content.
// mappings maps old → new path.
func RemapPaths(content string, mappings map[string]string) string {
	for old, newPath := range mappings {
		content = strings.ReplaceAll(content, old, newPath)
	}
	return content
}

// DetectConflicts scans content for paths that match any mapping key and would be affected.
func DetectConflicts(content string, mappings map[string]string) []string {
	var conflicts []string
	for old := range mappings {
		if strings.Contains(content, old) {
			conflicts = append(conflicts, old)
		}
	}
	return conflicts
}
