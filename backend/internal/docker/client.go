package docker

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"time"
)

const defaultSocketPath = "/var/run/docker.sock"

// Client talks to the Docker Engine via its Unix socket API.
type Client struct {
	httpClient *http.Client
	baseURL    string
}

// NewClient creates a Docker client connected to the given Unix socket path.
// Pass an empty string to use the default path (/var/run/docker.sock).
func NewClient(socketPath string) *Client {
	if socketPath == "" {
		socketPath = defaultSocketPath
	}

	transport := &http.Transport{
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			d := net.Dialer{Timeout: 5 * time.Second}
			return d.DialContext(ctx, "unix", socketPath)
		},
		DisableCompression: true,
	}

	return &Client{
		httpClient: &http.Client{Transport: transport},
		// Docker Engine API requires a non-empty host in the URL even for
		// Unix sockets; "localhost" is conventional.
		baseURL: "http://localhost",
	}
}

// Get performs a GET request against the Docker API path and returns the raw body.
func (c *Client) Get(ctx context.Context, path string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return nil, fmt.Errorf("docker get %s: build request: %w", path, err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("docker get %s: %w", path, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("docker get %s: status %d: %s", path, resp.StatusCode, body)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("docker get %s: read body: %w", path, err)
	}
	return body, nil
}

// Post performs a POST request against the Docker API path with the given body.
func (c *Client) Post(ctx context.Context, path string, body io.Reader) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, body)
	if err != nil {
		return nil, fmt.Errorf("docker post %s: build request: %w", path, err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("docker post %s: %w", path, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("docker post %s: status %d: %s", path, resp.StatusCode, b)
	}

	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("docker post %s: read body: %w", path, err)
	}
	return b, nil
}

// Delete performs a DELETE request against the Docker API path.
func (c *Client) Delete(ctx context.Context, path string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, c.baseURL+path, nil)
	if err != nil {
		return nil, fmt.Errorf("docker delete %s: build request: %w", path, err)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("docker delete %s: %w", path, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("docker delete %s: status %d: %s", path, resp.StatusCode, b)
	}
	return io.ReadAll(resp.Body)
}

// Exec creates and starts an exec instance inside a container, returning combined output.
// cmd is the command + args to run inside the container.
func (c *Client) Exec(ctx context.Context, containerID string, cmd []string) ([]byte, error) {
	createBody := map[string]interface{}{
		"AttachStdout": true,
		"AttachStderr": true,
		"Cmd":          cmd,
	}
	createJSON, err := json.Marshal(createBody)
	if err != nil {
		return nil, fmt.Errorf("exec create marshal: %w", err)
	}
	createResp, err := c.Post(ctx, "/containers/"+url.PathEscape(containerID)+"/exec", bytes.NewReader(createJSON))
	if err != nil {
		return nil, fmt.Errorf("exec create %s: %w", containerID, err)
	}
	var execID struct {
		ID string `json:"Id"`
	}
	if err := json.Unmarshal(createResp, &execID); err != nil {
		return nil, fmt.Errorf("exec create parse: %w", err)
	}

	startBody := map[string]interface{}{"Detach": false, "Tty": false}
	startJSON, err := json.Marshal(startBody)
	if err != nil {
		return nil, fmt.Errorf("exec start marshal: %w", err)
	}
	out, err := c.Post(ctx, "/exec/"+url.PathEscape(execID.ID)+"/start", bytes.NewReader(startJSON))
	if err != nil {
		return nil, fmt.Errorf("exec start %s: %w", containerID, err)
	}
	return out, nil
}

// Stream opens a long-lived GET connection and returns the response body for
// streaming (e.g. /events). The caller is responsible for closing the reader.
func (c *Client) Stream(ctx context.Context, path string) (io.ReadCloser, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return nil, fmt.Errorf("docker stream %s: build request: %w", path, err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("docker stream %s: %w", path, err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("docker stream %s: status %d: %s", path, resp.StatusCode, b)
	}

	return resp.Body, nil
}
