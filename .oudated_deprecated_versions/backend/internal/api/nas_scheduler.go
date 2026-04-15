package api

import (
	"net/http"

	"github.com/thesebastianf/hlc/internal/nas"
)

func (s *Server) HandleListMounts(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]string{"message": "not implemented"})
}

func (s *Server) HandleCheckMounts(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Paths []string `json:"paths"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	results := s.deps.NASChecker.CheckAll(r.Context(), body.Paths)
	// Convert to a JSON-friendly representation.
	type result struct {
		Path   string          `json:"path"`
		Status nas.MountStatus `json:"status"`
		Reason string          `json:"reason,omitempty"`
	}
	out := make([]result, len(results))
	for i, mc := range results {
		out[i] = result{Path: mc.Path, Status: mc.Status, Reason: mc.Reason}
	}
	writeJSON(w, out)
}

func (s *Server) HandleListJobs(w http.ResponseWriter, r *http.Request) {
	jobs := s.deps.Scheduler.ListJobs()
	writeJSON(w, jobs)
}

func (s *Server) HandleSetJobEnabled(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]string{"message": "not implemented"})
}
