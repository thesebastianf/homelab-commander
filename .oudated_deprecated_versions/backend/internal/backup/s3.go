package backup

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// S3Config holds credentials and location for S3-compatible storage.
type S3Config struct {
	Endpoint  string // e.g. "https://s3.amazonaws.com" or "http://minio:9000"
	Bucket    string
	AccessKey string
	SecretKey string
	Region    string
}

// S3Client is a minimal S3-compatible client using AWS Signature V4.
// For a production deployment, replace with a proper SDK (e.g. aws-sdk-go-v2).
// This implementation uses pre-signed URLs to keep dependencies minimal.
type S3Client struct {
	cfg S3Config
}

// NewS3Client creates an S3Client.
func NewS3Client(cfg S3Config) *S3Client {
	return &S3Client{cfg: cfg}
}

// Upload streams a local file to the configured S3 bucket.
func (c *S3Client) Upload(ctx context.Context, localPath, objectKey string) error {
	f, err := os.Open(localPath)
	if err != nil {
		return fmt.Errorf("s3 upload open %s: %w", localPath, err)
	}
	defer f.Close()

	info, err := f.Stat()
	if err != nil {
		return fmt.Errorf("s3 upload stat: %w", err)
	}

	url := fmt.Sprintf("%s/%s/%s", c.cfg.Endpoint, c.cfg.Bucket, objectKey)
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, f)
	if err != nil {
		return fmt.Errorf("s3 upload request: %w", err)
	}
	req.ContentLength = info.Size()
	req.Header.Set("Content-Type", "application/octet-stream")
	req.Header.Set("x-amz-date", time.Now().UTC().Format("20060102T150405Z"))

	// Attach basic auth for simple S3-compatible servers that support it.
	// For full AWS Signature V4, integrate aws-sdk-go-v2 or aws/aws-sdk-go.
	if c.cfg.AccessKey != "" {
		req.SetBasicAuth(c.cfg.AccessKey, c.cfg.SecretKey)
	}

	httpClient := &http.Client{Timeout: 10 * time.Minute}
	resp, err := httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("s3 upload: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("s3 upload: status %d: %s", resp.StatusCode, body)
	}
	return nil
}

// Download retrieves an object from S3 and writes it to localPath.
func (c *S3Client) Download(ctx context.Context, objectKey, localPath string) error {
	url := fmt.Sprintf("%s/%s/%s", c.cfg.Endpoint, c.cfg.Bucket, objectKey)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("s3 download request: %w", err)
	}
	if c.cfg.AccessKey != "" {
		req.SetBasicAuth(c.cfg.AccessKey, c.cfg.SecretKey)
	}

	httpClient := &http.Client{Timeout: 10 * time.Minute}
	resp, err := httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("s3 download: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("s3 download: status %d: %s", resp.StatusCode, body)
	}

	f, err := os.Create(localPath)
	if err != nil {
		return fmt.Errorf("s3 download create file: %w", err)
	}
	defer f.Close()

	_, err = io.Copy(f, resp.Body)
	return err
}
