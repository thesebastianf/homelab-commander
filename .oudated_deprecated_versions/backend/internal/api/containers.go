package api

import (
	"net/http"

	"github.com/thesebastianf/hlc/internal/labels"
)

func (s *Server) HandleListContainers(w http.ResponseWriter, r *http.Request) {
	containers, err := s.deps.DockerClient.ListContainers(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	classified := labels.ClassifyAll(containers)
	writeJSON(w, classified)
}
