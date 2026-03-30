package api

import (
	"fmt"
	"net/http"

	"github.com/thesebastianf/hlc/internal/backup"
	"github.com/thesebastianf/hlc/internal/labels"
)

func (s *Server) HandleTriggerBackup(w http.ResponseWriter, r *http.Request) {
	containerName := r.PathValue("container")
	containers, err := s.deps.DockerClient.ListContainers(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	classified := labels.ClassifyAll(containers)
	var target *labels.ClassifiedContainer
	for i, c := range classified {
		if c.Name == containerName {
			target = &classified[i]
			break
		}
	}
	if target == nil {
		writeError(w, http.StatusNotFound, fmt.Errorf("container %q not found", containerName))
		return
	}
	meta, err := s.deps.BackupExec.BackupContainer(r.Context(), *target)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, meta)
}

func (s *Server) HandleListBackups(w http.ResponseWriter, r *http.Request) {
	metas, err := backup.ListAllMetadata(r.Context(), s.deps.Settings.DB(), 50)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, metas)
}

func (s *Server) HandleListContainerBackups(w http.ResponseWriter, r *http.Request) {
	container := r.PathValue("container")
	metas, err := backup.LoadMetadata(r.Context(), s.deps.Settings.DB(), container)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, metas)
}

func (s *Server) HandleRestoreDryRun(w http.ResponseWriter, r *http.Request) {
	var body struct {
		BackupID int64  `json:"backup_id"`
		DestDir  string `json:"dest_dir"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	metas, err := backup.ListAllMetadata(r.Context(), s.deps.Settings.DB(), 1000)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	var meta *backup.Metadata
	for i, m := range metas {
		if m.ID == body.BackupID {
			meta = &metas[i]
			break
		}
	}
	if meta == nil {
		writeError(w, http.StatusNotFound, fmt.Errorf("backup %d not found", body.BackupID))
		return
	}
	result, err := backup.RestoreDryRun(r.Context(), *meta, body.DestDir)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, result)
}

func (s *Server) HandleRestore(w http.ResponseWriter, r *http.Request) {
	var body struct {
		BackupID int64  `json:"backup_id"`
		DestDir  string `json:"dest_dir"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	metas, err := backup.ListAllMetadata(r.Context(), s.deps.Settings.DB(), 1000)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	var meta *backup.Metadata
	for i, m := range metas {
		if m.ID == body.BackupID {
			meta = &metas[i]
			break
		}
	}
	if meta == nil {
		writeError(w, http.StatusNotFound, fmt.Errorf("backup %d not found", body.BackupID))
		return
	}
	result, err := backup.Restore(r.Context(), s.deps.Settings.DB(), *meta, body.DestDir)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, result)
}
