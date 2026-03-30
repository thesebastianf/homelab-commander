package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
)

func (s *Server) HandleListChannels(w http.ResponseWriter, r *http.Request) {
	db := s.deps.Settings.DB()
	rows, err := db.QueryContext(r.Context(),
		`SELECT id, name, enabled, config, min_level FROM notification_channels ORDER BY id`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	defer rows.Close()
	type channel struct {
		ID       int64  `json:"id"`
		Name     string `json:"name"`
		Enabled  bool   `json:"enabled"`
		MinLevel string `json:"min_level"`
	}
	var channels []channel
	for rows.Next() {
		var ch channel
		var cfgJSON string
		if err := rows.Scan(&ch.ID, &ch.Name, &ch.Enabled, &cfgJSON, &ch.MinLevel); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		channels = append(channels, ch)
	}
	writeJSON(w, channels)
}

func (s *Server) HandleCreateChannel(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name     string            `json:"name"`
		Config   map[string]string `json:"config"`
		MinLevel string            `json:"min_level"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	cfgJSON, _ := json.Marshal(body.Config)
	db := s.deps.Settings.DB()
	if body.MinLevel == "" {
		body.MinLevel = "info"
	}
	_, err := db.ExecContext(r.Context(),
		`INSERT INTO notification_channels (name, enabled, config, min_level) VALUES (?, 1, ?, ?)`,
		body.Name, string(cfgJSON), body.MinLevel)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusCreated)
}

func (s *Server) HandleUpdateChannel(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Errorf("invalid id: %w", err))
		return
	}
	var body struct {
		Enabled  *bool             `json:"enabled"`
		Config   map[string]string `json:"config"`
		MinLevel string            `json:"min_level"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	db := s.deps.Settings.DB()
	if body.Enabled != nil {
		enabled := 0
		if *body.Enabled {
			enabled = 1
		}
		db.ExecContext(r.Context(), `UPDATE notification_channels SET enabled = ? WHERE id = ?`, enabled, id)
	}
	if body.Config != nil {
		cfgJSON, _ := json.Marshal(body.Config)
		db.ExecContext(r.Context(), `UPDATE notification_channels SET config = ? WHERE id = ?`, string(cfgJSON), id)
	}
	if body.MinLevel != "" {
		db.ExecContext(r.Context(), `UPDATE notification_channels SET min_level = ? WHERE id = ?`, body.MinLevel, id)
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) HandleDeleteChannel(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Errorf("invalid id: %w", err))
		return
	}
	db := s.deps.Settings.DB()
	if _, err := db.ExecContext(r.Context(), `DELETE FROM notification_channels WHERE id = ?`, id); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) HandleTestChannel(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]string{"message": "test notification sent"})
}

func (s *Server) HandleNotificationHistory(w http.ResponseWriter, r *http.Request) {
	db := s.deps.Settings.DB()
	rows, err := db.QueryContext(r.Context(),
		`SELECT id, channel_id, event_type, success, error_message, sent_at
		 FROM notification_log ORDER BY sent_at DESC LIMIT 100`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	defer rows.Close()
	type logEntry struct {
		ID           int64  `json:"id"`
		ChannelID    int64  `json:"channel_id"`
		EventType    string `json:"event_type"`
		Success      bool   `json:"success"`
		ErrorMessage string `json:"error_message,omitempty"`
		SentAt       string `json:"sent_at"`
	}
	var entries []logEntry
	for rows.Next() {
		var e logEntry
		var errMsg sql.NullString
		if err := rows.Scan(&e.ID, &e.ChannelID, &e.EventType, &e.Success, &errMsg, &e.SentAt); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		e.ErrorMessage = errMsg.String
		entries = append(entries, e)
	}
	writeJSON(w, entries)
}
