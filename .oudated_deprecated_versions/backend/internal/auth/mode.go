package auth

import (
	"context"
	"database/sql"
	"net/http"

	"github.com/thesebastianf/hlc/internal/core"
)

// Mode tracks operational mode: normal, read-only, safe.
type Mode struct {
	store *TokenStore
	bus   core.EventBus
}

// NewMode creates a Mode manager.
func NewMode(store *TokenStore, bus core.EventBus) *Mode {
	return &Mode{store: store, bus: bus}
}

// AuthMiddleware verifies the Bearer token on every request.
// If no token is configured, all requests are allowed (first-run).
func (m *Mode) AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := ExtractBearer(r)
		if err := m.store.Verify(r.Context(), token); err != nil {
			m.bus.Publish(r.Context(), core.Event{
				Type:    core.AuthFailure,
				Source:  r.RemoteAddr,
				Payload: map[string]string{"path": r.URL.Path},
			})
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		ctx := WithAuthenticated(r.Context(), true)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// ReadOnlyMiddleware blocks any mutating HTTP method when read-only mode is active.
func ReadOnlyMiddleware(db *sql.DB, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isReadOnly(r.Context(), db) {
			switch r.Method {
			case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
				http.Error(w, "read-only mode active", http.StatusForbidden)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// isReadOnly checks whether read_only_mode is enabled in settings.
func isReadOnly(ctx context.Context, db *sql.DB) bool {
	var v string
	err := db.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = 'read_only_mode'`).Scan(&v)
	return err == nil && v == "true"
}
