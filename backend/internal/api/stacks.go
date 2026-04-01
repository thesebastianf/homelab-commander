package api

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/thesebastianf/hlc/internal/stacks"
)

func (s *Server) HandleListStacks(w http.ResponseWriter, r *http.Request) {
	containers, err := s.deps.DockerClient.ListContainers(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	list, err := stacks.ScanStacks(r.Context(), s.deps.StackOperator.BaseDir(), containers)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, list)
}

func (s *Server) HandleGetStack(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	containers, err := s.deps.DockerClient.ListContainers(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	list, err := stacks.ScanStacks(r.Context(), s.deps.StackOperator.BaseDir(), containers)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	for _, st := range list {
		if st.Name == name {
			writeJSON(w, st)
			return
		}
	}
	writeError(w, http.StatusNotFound, nil)
}

func (s *Server) HandleCreateStack(w http.ResponseWriter, r *http.Request) {
	var name, composeContent string

	if isFormRequest(r) {
		if err := r.ParseForm(); err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		name = r.FormValue("name")
		// Form provides a name; create stack with a stub compose template.
		composeContent = "services:\n  # Add your services here\n  example:\n    image: nginx:alpine\n"
	} else {
		var body struct {
			Name    string `json:"name"`
			Compose string `json:"compose"`
		}
		if err := decodeJSON(r, &body); err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		name = body.Name
		composeContent = body.Compose
		if composeContent == "" {
			composeContent = "services:\n  # Add your services here\n"
		}
	}

	if name == "" {
		writeError(w, http.StatusBadRequest, fmt.Errorf("name is required"))
		return
	}
	if err := s.deps.StackOperator.CreateStack(r.Context(), name, composeContent); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusCreated)
}

func (s *Server) HandleDeleteStack(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if err := s.deps.StackOperator.DeleteStack(r.Context(), name); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) HandleGetCompose(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	content, err := s.deps.StackOperator.ReadCompose(r.Context(), name)
	if err != nil {
		writeError(w, http.StatusNotFound, err)
		return
	}
	writeJSON(w, map[string]string{"content": content})
}

func (s *Server) HandleUpdateCompose(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	var body struct {
		Content string `json:"content"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := s.deps.StackOperator.WriteCompose(r.Context(), name, body.Content); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) HandleGetStackEnv(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]string{"message": "not implemented"})
}

func (s *Server) HandleUpdateStackEnv(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]string{"message": "not implemented"})
}

func (s *Server) HandleInjectEnv(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if s.deps.EnvInjector == nil {
		writeError(w, http.StatusServiceUnavailable, nil)
		return
	}
	if err := s.deps.EnvInjector.InjectIntoStack(r.Context(), s.deps.StackOperator.BaseDir()+"/"+name, true); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) HandleStackUp(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if err := s.deps.StackOperator.Up(r.Context(), name); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) HandleStackDown(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if err := s.deps.StackOperator.Down(r.Context(), name); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) HandleStackRestart(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if err := s.deps.StackOperator.Restart(r.Context(), name); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) HandleStackPull(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if err := s.deps.StackOperator.Pull(r.Context(), name); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) HandleStackLogs(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	tail := 100
	if t := r.URL.Query().Get("tail"); t != "" {
		if n, err := strconv.Atoi(t); err == nil {
			tail = n
		}
	}
	logs, err := s.deps.StackOperator.Logs(r.Context(), name, tail)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, map[string]string{"logs": logs})
}

func (s *Server) HandleBackupStack(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]string{"message": "use POST /api/v1/backup/{container}"})
}

func (s *Server) HandleUpdateStack(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]string{"message": "use POST /api/v1/updates/execute/{container}"})
}
