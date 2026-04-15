package api

import (
	"fmt"
	"net/http"
	"sort"

	"github.com/thesebastianf/hlc/internal/docker"
)

// PortEntry is a flattened view of a port binding with its owning container.
type PortEntry struct {
	ContainerID   string `json:"container_id"`
	ContainerName string `json:"container_name"`
	Image         string `json:"image"`
	State         string `json:"state"`
	HostIP        string `json:"host_ip"`
	HostPort      uint16 `json:"host_port"`
	ContainerPort uint16 `json:"container_port"`
	Protocol      string `json:"protocol"`
	HomepageURL   string `json:"homepage_url,omitempty"`
}

// PortsOverview groups port entries by state for the overview page.
type PortsOverview struct {
	Entries      []PortEntry            `json:"entries"`
	ConflictMap  map[uint16][]PortEntry `json:"conflict_map"`
	TotalPorts   int                    `json:"total_ports"`
	RunningPorts int                    `json:"running_ports"`
	StoppedPorts int                    `json:"stopped_ports"`
	Conflicts    int                    `json:"conflicts"`
}

// HandleListPorts returns a comprehensive overview of all port bindings across
// all containers (running and stopped).
func (s *Server) HandleListPorts(w http.ResponseWriter, r *http.Request) {
	containers, err := s.deps.DockerClient.ListContainers(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Errorf("list containers: %w", err))
		return
	}

	entries := buildPortEntries(containers)

	// Detect host-port conflicts (same host port bound by multiple containers).
	portOwners := make(map[uint16][]PortEntry)
	for _, e := range entries {
		portOwners[e.HostPort] = append(portOwners[e.HostPort], e)
	}
	conflictMap := make(map[uint16][]PortEntry)
	for port, owners := range portOwners {
		if len(owners) > 1 {
			conflictMap[port] = owners
		}
	}

	overview := PortsOverview{
		Entries:     entries,
		ConflictMap: conflictMap,
		TotalPorts:  len(entries),
		Conflicts:   len(conflictMap),
	}
	for _, e := range entries {
		if e.State == "running" {
			overview.RunningPorts++
		} else {
			overview.StoppedPorts++
		}
	}

	writeJSON(w, overview)
}

// buildPortEntries flattens all container port bindings into a sorted slice.
func buildPortEntries(containers []docker.Container) []PortEntry {
	entries := make([]PortEntry, 0)
	for _, c := range containers {
		homepageURL := c.Labels["hlc.homepage.url"]
		for _, p := range c.Ports {
			entries = append(entries, PortEntry{
				ContainerID:   c.ID,
				ContainerName: c.Name,
				Image:         c.Image,
				State:         c.State,
				HostIP:        p.HostIP,
				HostPort:      p.HostPort,
				ContainerPort: p.ContainerPort,
				Protocol:      p.Protocol,
				HomepageURL:   homepageURL,
			})
		}
	}
	// Sort: running first, then by host port ascending.
	sort.Slice(entries, func(i, j int) bool {
		if entries[i].State != entries[j].State {
			return entries[i].State == "running"
		}
		return entries[i].HostPort < entries[j].HostPort
	})
	return entries
}
