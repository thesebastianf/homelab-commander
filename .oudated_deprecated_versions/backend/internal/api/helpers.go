package api

import (
	"encoding/json"
	"net/http"
	"strings"
)

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, err error) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	msg := http.StatusText(status)
	if err != nil {
		msg = err.Error()
	}
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func decodeJSON(r *http.Request, v any) error {
	return json.NewDecoder(r.Body).Decode(v)
}

// formOrJSON reads a named string value from either a form-encoded body or a
// JSON body. Call parseFormOrJSON first, then pass the map to this helper.
// For HTMX form submissions (application/x-www-form-urlencoded) we use
// r.FormValue; for fetch/JSON callers we use a decoded map.
func formValue(r *http.Request, key string) string {
	ct := r.Header.Get("Content-Type")
	if strings.Contains(ct, "application/json") {
		// Handled by the caller via decodeJSON, not this helper.
		return ""
	}
	return r.FormValue(key)
}

// isFormRequest reports whether the request carries form-encoded data.
func isFormRequest(r *http.Request) bool {
	ct := r.Header.Get("Content-Type")
	return strings.Contains(ct, "application/x-www-form-urlencoded") ||
		strings.Contains(ct, "multipart/form-data")
}
