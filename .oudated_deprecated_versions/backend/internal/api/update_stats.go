package api

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/thesebastianf/hlc/internal/labels"
	"github.com/thesebastianf/hlc/internal/update"
)

func (s *Server) HandleCheckUpdates(w http.ResponseWriter, r *http.Request) {
	containers, err := s.deps.DockerClient.ListContainers(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	classified := labels.ClassifyAll(containers)
	type updateStatus struct {
		ContainerName   string `json:"container_name"`
		Image           string `json:"image"`
		UpdateAvailable bool   `json:"update_available"`
	}
	var results []updateStatus
	for _, c := range classified {
		di, err := update.CheckDigest(r.Context(), c.Image)
		available := err == nil && di.UpdateAvailable
		results = append(results, updateStatus{
			ContainerName:   c.Name,
			Image:           c.Image,
			UpdateAvailable: available,
		})
	}
	writeJSON(w, results)
}

func (s *Server) HandleCheckContainerUpdate(w http.ResponseWriter, r *http.Request) {
	containerName := r.PathValue("container")
	containers, err := s.deps.DockerClient.ListContainers(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	for _, c := range containers {
		if c.Name == containerName {
			di, err := update.CheckDigest(r.Context(), c.Image)
			if err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}
			writeJSON(w, di)
			return
		}
	}
	writeError(w, http.StatusNotFound, fmt.Errorf("container %q not found", containerName))
}

func (s *Server) HandlePlanUpdate(w http.ResponseWriter, r *http.Request) {
	containerName := r.PathValue("container")
	containers, err := s.deps.DockerClient.ListContainers(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	classified := labels.ClassifyAll(containers)
	for _, c := range classified {
		if c.Name == containerName {
			di, _ := update.CheckDigest(r.Context(), c.Image)
			plan := update.AssessRisk(c, di)
			writeJSON(w, plan)
			return
		}
	}
	writeError(w, http.StatusNotFound, fmt.Errorf("container %q not found", containerName))
}

func (s *Server) HandleExecuteUpdate(w http.ResponseWriter, r *http.Request) {
	containerName := r.PathValue("container")
	containers, err := s.deps.DockerClient.ListContainers(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	classified := labels.ClassifyAll(containers)
	for _, c := range classified {
		if c.Name == containerName {
			di, _ := update.CheckDigest(r.Context(), c.Image)
			plan := update.AssessRisk(c, di)
			if err := s.deps.UpdateExec.Execute(r.Context(), plan, c); err != nil {
				writeError(w, http.StatusInternalServerError, err)
				return
			}
			writeJSON(w, plan)
			return
		}
	}
	writeError(w, http.StatusNotFound, fmt.Errorf("container %q not found", containerName))
}

func (s *Server) HandleGetStats(w http.ResponseWriter, r *http.Request) {
	containers, err := s.deps.DockerClient.ListContainers(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, containers)
}

func (s *Server) HandleGetContainerStats(w http.ResponseWriter, r *http.Request) {
	container := r.PathValue("container")
	limit := 1
	snaps, err := s.deps.Stats.GetHistory(r.Context(), container, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, snaps)
}

func (s *Server) HandleGetStatsHistory(w http.ResponseWriter, r *http.Request) {
	container := r.PathValue("container")
	limit := 60
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil {
			limit = n
		}
	}
	snaps, err := s.deps.Stats.GetHistory(r.Context(), container, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, snaps)
}
