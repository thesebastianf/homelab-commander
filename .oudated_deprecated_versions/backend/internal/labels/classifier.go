package labels

import (
	"sort"

	"github.com/thesebastianf/hlc/internal/docker"
)

// ClassifiedContainer pairs a Docker container with its parsed HLC classification.
type ClassifiedContainer struct {
	docker.Container
	Classification ContainerClassification
}

// ClassifyAll parses hlc.* labels for every container.
func ClassifyAll(containers []docker.Container) []ClassifiedContainer {
	result := make([]ClassifiedContainer, 0, len(containers))
	for _, c := range containers {
		result = append(result, ClassifiedContainer{
			Container:      c,
			Classification: Parse(c.Labels),
		})
	}
	return result
}

// GroupByStack returns containers bucketed by their hlc.stack label value.
// Containers without a stack label are placed under the key "".
func GroupByStack(classified []ClassifiedContainer) map[string][]ClassifiedContainer {
	result := make(map[string][]ClassifiedContainer)
	for _, cc := range classified {
		key := cc.Classification.Stack
		result[key] = append(result[key], cc)
	}
	return result
}

// FilterByRole returns containers whose classification role matches.
func FilterByRole(classified []ClassifiedContainer, role string) []ClassifiedContainer {
	var result []ClassifiedContainer
	for _, cc := range classified {
		if cc.Classification.Role == role {
			result = append(result, cc)
		}
	}
	return result
}

// FilterNASDependent returns containers that declare at least one wait_for_mount.
func FilterNASDependent(classified []ClassifiedContainer) []ClassifiedContainer {
	var result []ClassifiedContainer
	for _, cc := range classified {
		if cc.Classification.HasMountConditions() {
			result = append(result, cc)
		}
	}
	return result
}

// SortByStartupOrder sorts containers in ascending startup order (lower = starts first).
func SortByStartupOrder(classified []ClassifiedContainer) []ClassifiedContainer {
	sorted := make([]ClassifiedContainer, len(classified))
	copy(sorted, classified)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].Classification.StartupOrder < sorted[j].Classification.StartupOrder
	})
	return sorted
}
