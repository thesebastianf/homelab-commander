// Package update handles image digest comparison and rolling container updates.
package update

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// DigestInfo holds an image reference and its remote digest.
type DigestInfo struct {
	Image          string
	Reference      string // tag or digest
	RemoteDigest   string
	LocalDigest    string
	UpdateAvailable bool
	CheckedAt      time.Time
}

// CheckDigest queries a registry for the current manifest digest of image:tag.
// Falls back gracefully if the registry is inaccessible.
func CheckDigest(ctx context.Context, imageRef string) (*DigestInfo, error) {
	registry, repo, tag := parseImageRef(imageRef)

	info := &DigestInfo{
		Image:     imageRef,
		Reference: tag,
		CheckedAt: time.Now(),
	}

	// For Docker Hub, use the official manifests endpoint.
	urlStr := fmt.Sprintf("https://%s/v2/%s/manifests/%s", registry, repo, tag)

	req, err := http.NewRequestWithContext(ctx, http.MethodHead, urlStr, nil)
	if err != nil {
		return info, fmt.Errorf("build registry request: %w", err)
	}
	req.Header.Set("Accept", "application/vnd.docker.distribution.manifest.v2+json")

	// Get an auth token for Docker Hub anonymous access if needed.
	if registry == "registry-1.docker.io" {
		token, err := dockerHubToken(ctx, repo)
		if err == nil {
			req.Header.Set("Authorization", "Bearer "+token)
		}
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return info, fmt.Errorf("registry HEAD %s: %w", imageRef, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		info.RemoteDigest = resp.Header.Get("Docker-Content-Digest")
	} else if resp.StatusCode == http.StatusNotFound {
		return info, fmt.Errorf("image %s not found in registry", imageRef)
	}

	return info, nil
}

// parseImageRef splits an image reference into registry, repository, and tag.
func parseImageRef(ref string) (registry, repo, tag string) {
	tag = "latest"
	if idx := strings.LastIndex(ref, ":"); idx > 0 {
		// Only treat : as tag separator if there's no slash after it (it could be port).
		if !strings.Contains(ref[idx:], "/") {
			tag = ref[idx+1:]
			ref = ref[:idx]
		}
	}

	parts := strings.SplitN(ref, "/", 2)
	if len(parts) == 1 {
		// Plain image name → Docker Hub official image.
		return "registry-1.docker.io", "library/" + parts[0], tag
	}

	// Check if first segment looks like a hostname.
	if strings.Contains(parts[0], ".") || strings.Contains(parts[0], ":") || parts[0] == "localhost" {
		return parts[0], parts[1], tag
	}

	// Docker Hub user image.
	return "registry-1.docker.io", ref, tag
}

// dockerHubToken fetches an anonymous pull token for Docker Hub.
func dockerHubToken(ctx context.Context, repo string) (string, error) {
	url := fmt.Sprintf("https://auth.docker.io/token?service=registry.docker.io&scope=repository:%s:pull", repo)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var result struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	return result.Token, nil
}
