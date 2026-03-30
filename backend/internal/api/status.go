package api

import (
	"net/http"
	"time"
)

// StatusResponse is the compact status JSON returned for Homepage widgets.
type StatusResponse struct {
	MSMActive  bool             `json:"msm_active"`
	Containers ContainerCounts  `json:"containers"`
	Backups    BackupStatus     `json:"backups"`
	Updates    UpdateStatus     `json:"updates"`
	Mounts     MountStatus      `json:"mounts"`
}

type ContainerCounts struct {
	Running   int `json:"running"`
	Stopped   int `json:"stopped"`
	Unhealthy int `json:"unhealthy"`
}

type BackupStatus struct {
	LastSuccess   *time.Time `json:"last_success,omitempty"`
	Failures24h   int        `json:"failures_24h"`
}

type UpdateStatus struct {
	Available int `json:"available"`
}

type MountStatus struct {
	Healthy  int `json:"healthy"`
	Degraded int `json:"degraded"`
	Offline  int `json:"offline"`
}

func (s *Server) HandleStatus(w http.ResponseWriter, r *http.Request) {
	resp := StatusResponse{}

	// Container counts from Docker client.
	if s.deps.DockerClient != nil {
		containers, err := s.deps.DockerClient.ListContainers(r.Context())
		if err == nil {
			for _, c := range containers {
				switch c.State {
				case "running":
					resp.Containers.Running++
				case "exited", "dead", "created":
					resp.Containers.Stopped++
				}
			}
		}
	}

	// MSM active status.
	if s.deps.PolicyEngine != nil {
		policies, _ := s.deps.PolicyEngine.ListPolicies(r.Context())
		for _, p := range policies {
			if p.Name == "max_stability_mode" && p.Enabled {
				resp.MSMActive = true
			}
		}
	}

	// Mount status: NASMonitor.CurrentStatus(path) is per-path; skip aggregate here.

	writeJSON(w, resp)
}
