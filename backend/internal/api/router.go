package api

import (
	"html/template"
	"log/slog"
	"net/http"
	"time"
)

// Server holds all dependencies injected into HTTP handlers.
type Server struct {
	deps *Deps
}

// NewServer creates a new API server with the given dependencies.
func NewServer(deps *Deps) *Server {
	return &Server{deps: deps}
}

// RegisterRoutes mounts all API and UI routes on the given mux.
func (s *Server) RegisterRoutes(mux *http.ServeMux) {
	// Middlewares applied in WrapMux.
	mux.HandleFunc("GET /api/v1/status", s.HandleStatus)

	// Settings
	mux.HandleFunc("GET /api/v1/settings", s.HandleGetSettings)
	mux.HandleFunc("PUT /api/v1/settings/{key}", s.HandleSetSetting)

	// Policies
	mux.HandleFunc("GET /api/v1/policies", s.HandleGetPolicies)
	mux.HandleFunc("PUT /api/v1/policies/{name}", s.HandleSetPolicy)

	// Env Hub
	mux.HandleFunc("GET /api/v1/env-hub", s.HandleListEnvs)
	mux.HandleFunc("POST /api/v1/env-hub", s.HandleSetEnv)
	mux.HandleFunc("DELETE /api/v1/env-hub/{key}", s.HandleDeleteEnv)
	mux.HandleFunc("POST /api/v1/env-hub/{key}/propagate", s.HandlePropagateEnv)

	// Containers
	mux.HandleFunc("GET /api/v1/containers", s.HandleListContainers)

	// Ports overview (DockPeek-style)
	mux.HandleFunc("GET /api/v1/ports", s.HandleListPorts)

	// Stacks
	mux.HandleFunc("GET /api/v1/stacks", s.HandleListStacks)
	mux.HandleFunc("POST /api/v1/stacks", s.HandleCreateStack)
	mux.HandleFunc("GET /api/v1/stacks/{name}", s.HandleGetStack)
	mux.HandleFunc("DELETE /api/v1/stacks/{name}", s.HandleDeleteStack)
	mux.HandleFunc("GET /api/v1/stacks/{name}/compose", s.HandleGetCompose)
	mux.HandleFunc("PUT /api/v1/stacks/{name}/compose", s.HandleUpdateCompose)
	mux.HandleFunc("GET /api/v1/stacks/{name}/env", s.HandleGetStackEnv)
	mux.HandleFunc("PUT /api/v1/stacks/{name}/env", s.HandleUpdateStackEnv)
	mux.HandleFunc("POST /api/v1/stacks/{name}/inject-env", s.HandleInjectEnv)
	mux.HandleFunc("POST /api/v1/stacks/{name}/up", s.HandleStackUp)
	mux.HandleFunc("POST /api/v1/stacks/{name}/down", s.HandleStackDown)
	mux.HandleFunc("POST /api/v1/stacks/{name}/restart", s.HandleStackRestart)
	mux.HandleFunc("POST /api/v1/stacks/{name}/pull", s.HandleStackPull)
	mux.HandleFunc("GET /api/v1/stacks/{name}/logs", s.HandleStackLogs)
	mux.HandleFunc("POST /api/v1/stacks/{name}/backup", s.HandleBackupStack)
	mux.HandleFunc("POST /api/v1/stacks/{name}/update", s.HandleUpdateStack)

	// Mounts
	mux.HandleFunc("GET /api/v1/mounts", s.HandleListMounts)
	mux.HandleFunc("POST /api/v1/mounts/check", s.HandleCheckMounts)

	// Scheduler
	mux.HandleFunc("GET /api/v1/scheduler/jobs", s.HandleListJobs)
	mux.HandleFunc("PUT /api/v1/scheduler/jobs/{id}", s.HandleSetJobEnabled)

	// Backups
	mux.HandleFunc("POST /api/v1/backup/_all", s.HandleBackupAll)
	mux.HandleFunc("POST /api/v1/backup/{container}", s.HandleTriggerBackup)
	mux.HandleFunc("GET /api/v1/backups", s.HandleListBackups)
	mux.HandleFunc("GET /api/v1/backups/{container}", s.HandleListContainerBackups)
	mux.HandleFunc("POST /api/v1/restore/dry-run", s.HandleRestoreDryRun)
	mux.HandleFunc("POST /api/v1/restore", s.HandleRestore)

	// Updates
	mux.HandleFunc("GET /api/v1/updates/check", s.HandleCheckUpdates)
	mux.HandleFunc("GET /api/v1/updates/check/{container}", s.HandleCheckContainerUpdate)
	mux.HandleFunc("POST /api/v1/updates/plan/{container}", s.HandlePlanUpdate)
	mux.HandleFunc("POST /api/v1/updates/execute/{container}", s.HandleExecuteUpdate)

	// Stats
	mux.HandleFunc("GET /api/v1/stats", s.HandleGetStats)
	mux.HandleFunc("GET /api/v1/stats/{container}", s.HandleGetContainerStats)
	mux.HandleFunc("GET /api/v1/stats/{container}/history", s.HandleGetStatsHistory)

	// Audit
	mux.HandleFunc("GET /api/v1/audit", s.HandleGetAudit)
	mux.HandleFunc("GET /api/v1/audit/timeline", s.HandleGetAuditTimeline)

	// Notifications
	mux.HandleFunc("GET /api/v1/notifications/channels", s.HandleListChannels)
	mux.HandleFunc("POST /api/v1/notifications/channels", s.HandleCreateChannel)
	mux.HandleFunc("PUT /api/v1/notifications/channels/{id}", s.HandleUpdateChannel)
	mux.HandleFunc("DELETE /api/v1/notifications/channels/{id}", s.HandleDeleteChannel)
	mux.HandleFunc("POST /api/v1/notifications/channels/{id}/test", s.HandleTestChannel)
	mux.HandleFunc("GET /api/v1/notifications/history", s.HandleNotificationHistory)

	// Migration
	mux.HandleFunc("POST /api/v1/migrate/export", s.HandleExport)
	mux.HandleFunc("GET /api/v1/migrate/export/{id}", s.HandleDownloadExport)
	mux.HandleFunc("POST /api/v1/migrate/import/analyze", s.HandleImportAnalyze)
	mux.HandleFunc("POST /api/v1/migrate/import/execute", s.HandleImportExecute)

	// SSE live updates
	mux.HandleFunc("GET /api/v1/events", s.HandleSSE)

	// UI HTML fragment endpoints (HTMX swap targets — return HTML not JSON)
	mux.HandleFunc("GET /ui/containers", s.HandleContainersFragment)
	mux.HandleFunc("GET /ui/stacks", s.HandleStacksFragment)
	mux.HandleFunc("GET /ui/backups", s.HandleBackupsFragment)
	mux.HandleFunc("GET /ui/audit", s.HandleAuditFragment)
	mux.HandleFunc("GET /ui/settings", s.HandleSettingsFragment)
	mux.HandleFunc("GET /ui/policies", s.HandlePoliciesFragment)
	mux.HandleFunc("GET /ui/env-hub", s.HandleEnvHubFragment)
	mux.HandleFunc("GET /ui/notifications/channels", s.HandleChannelsFragment)
	mux.HandleFunc("GET /ui/notifications/history", s.HandleNotificationHistoryFragment)
}

// WrapMux applies global middlewares to a mux.
func (s *Server) WrapMux(mux http.Handler) http.Handler {
	return loggingMiddleware(jsonContentType(mux))
}

// loggingMiddleware logs each request.
func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		slog.Info("http",
			"method", r.Method,
			"path", r.URL.Path,
			"duration", time.Since(start).String(),
		)
	})
}

// jsonContentType sets Content-Type for API routes.
func jsonContentType(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if len(r.URL.Path) > 8 && r.URL.Path[:8] == "/api/v1/" {
			w.Header().Set("Content-Type", "application/json")
		}
		next.ServeHTTP(w, r)
	})
}

// HandleUI serves the main SPA shell or a named page template.
func (s *Server) HandleUI(w http.ResponseWriter, r *http.Request) {
	page := r.URL.Query().Get("page")
	if page == "" {
		page = "dashboard"
	}

	// Allowlist valid pages to prevent path traversal.
	validPages := map[string]bool{
		"dashboard":     true,
		"stacks":        true,
		"backups":       true,
		"notifications": true,
		"audit":         true,
		"migration":     true,
		"ports":         true,
		"settings":      true,
	}
	if !validPages[page] {
		http.Error(w, "page not found", http.StatusNotFound)
		return
	}

	tmpl, err := template.ParseFiles(
		"web/templates/layout.html",
		"web/templates/"+page+".html",
	)
	if err != nil {
		http.Error(w, "template not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	data := struct{ Page string }{Page: page}
	if err := tmpl.ExecuteTemplate(w, "layout", data); err != nil {
		slog.Error("template execute error", "error", err)
	}
}
