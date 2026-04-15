package update

import (
	"strings"

	"github.com/thesebastianf/hlc/internal/labels"
)

// RiskLevel describes how risky an update is.
type RiskLevel string

const (
	RiskHigh   RiskLevel = "high"
	RiskMedium RiskLevel = "medium"
	RiskLow    RiskLevel = "low"
)

// UpdatePlan describes an assessed update for a container.
type UpdatePlan struct {
	ContainerID   string
	ContainerName string
	Image         string
	CurrentTag    string
	NewTag        string
	Risk          RiskLevel
	Reasons       []string
	AutoApproved  bool
}

// AssessRisk evaluates the risk of updating a classified container.
func AssessRisk(c labels.ClassifiedContainer, digest *DigestInfo) UpdatePlan {
	plan := UpdatePlan{
		ContainerID:   c.ID,
		ContainerName: c.Name,
		Image:         c.Image,
	}

	// Extract tag from image reference.
	if idx := strings.LastIndex(c.Image, ":"); idx > 0 {
		plan.CurrentTag = c.Image[idx+1:]
	} else {
		plan.CurrentTag = "latest"
	}
	if digest != nil {
		plan.NewTag = digest.Reference
	}

	risk := RiskLow
	var reasons []string

	// HIGH risk factors.
	if plan.CurrentTag == "latest" {
		risk = RiskHigh
		reasons = append(reasons, "unpinned 'latest' tag")
	}
	if c.Classification.Role == "db" {
		risk = RiskHigh
		reasons = append(reasons, "database container (stateful)")
	}

	// MEDIUM risk factors (only escalate, never downgrade from HIGH).
	if risk != RiskHigh {
		if isMajorVersionChange(plan.CurrentTag, plan.NewTag) {
			risk = RiskMedium
			reasons = append(reasons, "major version change detected")
		}
	}

	if len(reasons) == 0 {
		reasons = append(reasons, "stateless or pinned minor update")
	}

	plan.Risk = risk
	plan.Reasons = reasons
	plan.AutoApproved = c.Classification.UpdatePolicy == "auto" && risk == RiskLow

	return plan
}

// isMajorVersionChange returns true if the leading numeric component changes.
func isMajorVersionChange(oldTag, newTag string) bool {
	oldMaj := leadingNumber(oldTag)
	newMaj := leadingNumber(newTag)
	return oldMaj != "" && newMaj != "" && oldMaj != newMaj
}

func leadingNumber(s string) string {
	// Strip 'v' prefix.
	s = strings.TrimPrefix(s, "v")
	end := strings.IndexAny(s, ".-_")
	if end <= 0 {
		return s
	}
	return s[:end]
}
