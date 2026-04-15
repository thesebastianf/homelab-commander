package api

import (
	"fmt"
	"net/http"
)

func (s *Server) HandleGetSettings(w http.ResponseWriter, r *http.Request) {
	if s.deps.Settings == nil {
		writeError(w, http.StatusServiceUnavailable, fmt.Errorf("settings not available"))
		return
	}
	all, err := s.deps.Settings.GetAll(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, all)
}

func (s *Server) HandleSetSetting(w http.ResponseWriter, r *http.Request) {
	if s.deps.Settings == nil {
		writeError(w, http.StatusServiceUnavailable, fmt.Errorf("settings not available"))
		return
	}
	key := r.PathValue("key")
	var body struct {
		Value string `json:"value"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, fmt.Errorf("invalid JSON: %w", err))
		return
	}
	if err := s.deps.Settings.Set(r.Context(), key, body.Value); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, map[string]string{"key": key, "value": body.Value})
}

func (s *Server) HandleGetPolicies(w http.ResponseWriter, r *http.Request) {
	if s.deps.PolicyEngine == nil {
		writeError(w, http.StatusServiceUnavailable, fmt.Errorf("policy engine not available"))
		return
	}
	policies, err := s.deps.PolicyEngine.ListPolicies(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, policies)
}

func (s *Server) HandleSetPolicy(w http.ResponseWriter, r *http.Request) {
	if s.deps.PolicyEngine == nil {
		writeError(w, http.StatusServiceUnavailable, fmt.Errorf("policy engine not available"))
		return
	}
	name := r.PathValue("name")
	var body struct {
		Enabled bool           `json:"enabled"`
		Config  map[string]any `json:"config"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, fmt.Errorf("invalid JSON: %w", err))
		return
	}
	if body.Config == nil {
		body.Config = make(map[string]any)
	}
	if err := s.deps.PolicyEngine.SetPolicy(r.Context(), name, body.Enabled, body.Config); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, map[string]any{"name": name, "enabled": body.Enabled})
}

func (s *Server) HandleListEnvs(w http.ResponseWriter, r *http.Request) {
	if s.deps.EnvStore == nil {
		writeError(w, http.StatusServiceUnavailable, fmt.Errorf("env hub not available"))
		return
	}
	list, err := s.deps.EnvStore.List(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, list)
}

func (s *Server) HandleSetEnv(w http.ResponseWriter, r *http.Request) {
	if s.deps.EnvStore == nil {
		writeError(w, http.StatusServiceUnavailable, fmt.Errorf("env hub not available"))
		return
	}
	var key, value, category string

	if isFormRequest(r) {
		if err := r.ParseForm(); err != nil {
			writeError(w, http.StatusBadRequest, fmt.Errorf("parse form: %w", err))
			return
		}
		key = r.FormValue("key")
		value = r.FormValue("value")
		category = r.FormValue("category")
	} else {
		var body struct {
			Key      string `json:"key"`
			Value    string `json:"value"`
			Category string `json:"category"`
		}
		if err := decodeJSON(r, &body); err != nil {
			writeError(w, http.StatusBadRequest, fmt.Errorf("invalid JSON: %w", err))
			return
		}
		key, value, category = body.Key, body.Value, body.Category
	}

	if key == "" {
		writeError(w, http.StatusBadRequest, fmt.Errorf("key is required"))
		return
	}
	if err := s.deps.EnvStore.Set(r.Context(), key, value, category); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, map[string]string{"key": key})
}

func (s *Server) HandleDeleteEnv(w http.ResponseWriter, r *http.Request) {
	if s.deps.EnvStore == nil {
		writeError(w, http.StatusServiceUnavailable, fmt.Errorf("env hub not available"))
		return
	}
	key := r.PathValue("key")
	if err := s.deps.EnvStore.Delete(r.Context(), key); err != nil {
		writeError(w, http.StatusNotFound, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) HandlePropagateEnv(w http.ResponseWriter, r *http.Request) {
	if s.deps.EnvInjector == nil {
		writeError(w, http.StatusServiceUnavailable, fmt.Errorf("env injector not available"))
		return
	}
	key := r.PathValue("key")
	var body struct {
		NewValue string `json:"new_value"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, fmt.Errorf("invalid JSON: %w", err))
		return
	}
	updates, err := s.deps.EnvInjector.ProposeUpdates(r.Context(), key, body.NewValue)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, updates)
}


