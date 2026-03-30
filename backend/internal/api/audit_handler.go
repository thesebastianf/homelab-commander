package api

import (
	"net/http"
	"time"

	"github.com/thesebastianf/hlc/internal/audit"
)

func (s *Server) HandleGetAudit(w http.ResponseWriter, r *http.Request) {
	f := audit.Filter{
		Category: audit.Category(r.URL.Query().Get("category")),
		Target:   r.URL.Query().Get("target"),
	}
	if since := r.URL.Query().Get("since"); since != "" {
		t, err := time.Parse(time.RFC3339, since)
		if err == nil {
			f.Since = t
		}
	}
	entries, err := s.deps.AuditLogger.Query(r.Context(), f)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, entries)
}

func (s *Server) HandleGetAuditTimeline(w http.ResponseWriter, r *http.Request) {
	f := audit.Filter{Limit: 100}
	entries, err := s.deps.AuditLogger.Query(r.Context(), f)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, entries)
}
