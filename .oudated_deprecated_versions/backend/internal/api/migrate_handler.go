package api

import (
	"fmt"
	"net/http"

	"github.com/thesebastianf/hlc/internal/migrate"
)

func (s *Server) HandleExport(w http.ResponseWriter, r *http.Request) {
	var body struct {
		IncludeDB      bool   `json:"include_db"`
		IncludeBackups bool   `json:"include_backups"`
		OutputPath     string `json:"output_path"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	baseStack, _ := s.deps.Settings.Get(r.Context(), "base_stack_path")
	dbPath, _ := s.deps.Settings.Get(r.Context(), "db_path")
	backupDir, _ := s.deps.Settings.Get(r.Context(), "backup_dir")

	opts := migrate.ExportOptions{
		BaseStackDir:   baseStack,
		DBPath:         dbPath,
		BackupDir:      backupDir,
		IncludeDB:      body.IncludeDB,
		IncludeBackups: body.IncludeBackups,
		OutputPath:     body.OutputPath,
	}
	path, err := s.deps.Migrator.Export(r.Context(), opts)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, map[string]string{"path": path})
}

func (s *Server) HandleDownloadExport(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]string{"message": fmt.Sprintf("download export %s", r.PathValue("id"))})
}

func (s *Server) HandleImportAnalyze(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ArchivePath string `json:"archive_path"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	manifest, err := s.deps.Migrator.InspectArchive(body.ArchivePath)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, manifest)
}

func (s *Server) HandleImportExecute(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ArchivePath  string            `json:"archive_path"`
		PathMappings map[string]string `json:"path_mappings"`
		OverwriteDB  bool              `json:"overwrite_db"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	baseStack, _ := s.deps.Settings.Get(r.Context(), "base_stack_path")
	dbPath, _ := s.deps.Settings.Get(r.Context(), "db_path")

	opts := migrate.ImportOptions{
		ArchivePath:  body.ArchivePath,
		DestStackDir: baseStack,
		DestDBPath:   dbPath,
		PathMappings: body.PathMappings,
		OverwriteDB:  body.OverwriteDB,
	}
	result, err := s.deps.Migrator.Import(r.Context(), opts)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, result)
}
