package migrate

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// ImportOptions controls how the archive is applied.
type ImportOptions struct {
	ArchivePath   string
	DestStackDir  string
	DestDBPath    string
	PathMappings  map[string]string // old path → new path
	OverwriteDB   bool
}

// ImportResult summarises what was imported.
type ImportResult struct {
	StacksImported []string
	DBRestored     bool
	FilesWritten   int
}

// Import extracts a migration archive, applying path remapping.
func (e *Engine) Import(_ context.Context, opts ImportOptions) (*ImportResult, error) {
	f, err := os.Open(opts.ArchivePath)
	if err != nil {
		return nil, fmt.Errorf("import open: %w", err)
	}
	defer f.Close()

	gz, err := gzip.NewReader(f)
	if err != nil {
		return nil, fmt.Errorf("import gzip: %w", err)
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	result := &ImportResult{}
	seenStacks := make(map[string]bool)

	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("import tar: %w", err)
		}

		switch {
		case hdr.Name == "manifest.json":
			// Skip — already inspected.
			continue

		case strings.HasPrefix(hdr.Name, "stacks/"):
			rel := strings.TrimPrefix(hdr.Name, "stacks/")
			parts := strings.SplitN(rel, "/", 2)
			if len(parts) >= 1 && parts[0] != "" {
				seenStacks[parts[0]] = true
			}
			destPath := filepath.Join(opts.DestStackDir, filepath.Clean(rel))
			if err := writeEntry(tr, hdr, destPath, opts.PathMappings); err != nil {
				return nil, fmt.Errorf("import stack entry %s: %w", hdr.Name, err)
			}
			result.FilesWritten++

		case hdr.Name == "hlc.db" && opts.OverwriteDB && opts.DestDBPath != "":
			if err := writeEntry(tr, hdr, opts.DestDBPath, nil); err != nil {
				return nil, fmt.Errorf("import db: %w", err)
			}
			result.DBRestored = true
			result.FilesWritten++
		}
	}

	for s := range seenStacks {
		result.StacksImported = append(result.StacksImported, s)
	}
	return result, nil
}

// writeEntry writes a tar entry to the destination path.
// For text files (.yml, .yaml, .env), path remapping is applied.
func writeEntry(tr *tar.Reader, hdr *tar.Header, dest string, mappings map[string]string) error {
	if hdr.Typeflag == tar.TypeDir {
		return os.MkdirAll(dest, os.FileMode(hdr.Mode)|0o700)
	}
	if !hdr.FileInfo().Mode().IsRegular() {
		return nil
	}

	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return err
	}

	content, err := io.ReadAll(tr)
	if err != nil {
		return err
	}

	// Apply path remapping for compose/env files.
	if len(mappings) > 0 && isTextFile(dest) {
		content = []byte(RemapPaths(string(content), mappings))
	}

	return os.WriteFile(dest, content, os.FileMode(hdr.Mode)|0o600)
}

func isTextFile(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".yml", ".yaml", ".env", ".conf", ".ini", ".toml":
		return true
	}
	name := filepath.Base(path)
	return strings.HasPrefix(name, ".env") || name == "docker-compose.yml" || name == "docker-compose.yaml"
}
