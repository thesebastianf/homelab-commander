// Package auth implements Bearer token authentication, read-only mode, and safe mode.
package auth

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

// ErrInvalidToken is returned when authentication fails.
var ErrInvalidToken = errors.New("invalid or missing token")

// TokenStore manages hashed API tokens in SQLite settings.
type TokenStore struct {
	db *sql.DB
}

// NewTokenStore creates a TokenStore backed by the settings table.
func NewTokenStore(db *sql.DB) *TokenStore {
	return &TokenStore{db: db}
}

// SetToken hashes and stores a plain-text token (overwrites previous).
func (s *TokenStore) SetToken(ctx context.Context, plainToken string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(plainToken), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash token: %w", err)
	}
	_, err = s.db.ExecContext(ctx,
		`INSERT INTO settings (key, value) VALUES ('api_token_hash', ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		string(hash),
	)
	return err
}

// Verify returns nil if the provided plain token matches the stored hash.
func (s *TokenStore) Verify(ctx context.Context, plainToken string) error {
	var hash string
	err := s.db.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = 'api_token_hash'`).Scan(&hash)
	if errors.Is(err, sql.ErrNoRows) {
		// No token configured — allow access (first-run).
		return nil
	}
	if err != nil {
		return fmt.Errorf("lookup token hash: %w", err)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(plainToken)); err != nil {
		return ErrInvalidToken
	}
	return nil
}

// GenerateToken creates a cryptographically random hex token (32 bytes = 64 hex chars).
func GenerateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate token: %w", err)
	}
	return hex.EncodeToString(b), nil
}

// ExtractBearer pulls the token from "Authorization: Bearer <token>" header.
func ExtractBearer(r *http.Request) string {
	hdr := r.Header.Get("Authorization")
	if !strings.HasPrefix(hdr, "Bearer ") {
		return ""
	}
	return strings.TrimPrefix(hdr, "Bearer ")
}

// tokenKey is used as context key.
type tokenKey struct{}

// WithAuthenticated stores authentication state in context.
func WithAuthenticated(ctx context.Context, ok bool) context.Context {
	return context.WithValue(ctx, tokenKey{}, ok)
}

// IsAuthenticated reads auth state from context.
func IsAuthenticated(ctx context.Context) bool {
	v, _ := ctx.Value(tokenKey{}).(bool)
	return v
}
