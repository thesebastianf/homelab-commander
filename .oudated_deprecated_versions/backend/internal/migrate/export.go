// Package migrate provides server-to-server migration export/import.
package migrate

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

// Manifest describes the contents of a migration archive.
type Manifest struct {
	Version     string    `json:"version"`
	ExportedAt  time.Time `json:"exported_at"`
	SourceHost  string    `json:"source_host"`
	Stacks      []string  `json:"stacks"`
	IncludesDB  bool      `json:"includes_db"`
	IncludesBak bool      `json:"includes_backups"`
}

// ExportOptions controls what is included in the archive.
type ExportOptions struct {
	BaseStackDir   string
	DBPath         string
	BackupDir      string
	IncludeDB      bool
	IncludeBackups bool
	OutputPath     string
}

// Engine orchestrates export and import operations.
type Engine struct{}

// NewEngine creates a migration Engine.
func NewEngine() *Engine { return &Engine{} }

// Export creates a .tar.gz migration archive.
func (e *Engine) Export(ctx context.Context, opts ExportOptions) (string, error) {
	if opts.OutputPath == "" {
		opts.OutputPath = fmt.Sprintf("hlc-migration-%s.tar.gz", time.Now().Format("20060102T150405"))
	}

	f, err := os.Create(opts.OutputPath)
	if err != nil {
		return "", fmt.Errorf("export create archive: %w", err)
	}
	defer f.Close()

	gz := gzip.NewWriter(f)
	defer gz.Close()
	tw := tar.NewWriter(gz)
	defer tw.Close()

	manifest := Manifest{
		Version:    "2",
		ExportedAt: time.Now(),
		IncludesDB: opts.IncludeDB,
	}

	// Add stacks directory.
	if opts.BaseStackDir != "" {
		stacks, err := listSubdirs(opts.BaseStackDir)
		if err != nil {
			return "", fmt.Errorf("export list stacks: %w", err)
		}
		manifest.Stacks = stacks
		if err := addDirToTar(tw, opts.BaseStackDir, "stacks"); err != nil {
			return "", fmt.Errorf("export stacks: %w", err)
		}
	}

	// Optional: DB.
	if opts.IncludeDB && opts.DBPath != "" {
		if err := addFileToTar(tw, opts.DBPath, "hlc.db"); err != nil {
			return "", fmt.Errorf("export db: %w", err)
		}
	}

	// Optional: backups.
	if opts.IncludeBackups && opts.BackupDir != "" {
		manifest.IncludesBak = true
		if err := addDirToTar(tw, opts.BackupDir, "backups"); err != nil {
			return "", fmt.Errorf("export backups: %w", err)
		}
	}

	// Write manifest last (as JSON).
	manifestBytes, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return "", fmt.Errorf("marshal manifest: %w", err)
	}
	hdr := &tar.Header{
		Name:    "manifest.json",
		Mode:    0o644,
		Size:    int64(len(manifestBytes)),
		ModTime: time.Now(),
	}
	if err := tw.WriteHeader(hdr); err != nil {
		return "", err
	}
	if _, err := tw.Write(manifestBytes); err != nil {
		return "", err
	}

	return opts.OutputPath, nil
}

// InspectArchive reads the manifest from a migration archive without extracting.
func (e *Engine) InspectArchive(archivePath string) (*Manifest, error) {
	f, err := os.Open(archivePath)
	if err != nil {
		return nil, fmt.Errorf("inspect open: %w", err)
	}
	defer f.Close()

	gz, err := gzip.NewReader(f)
	if err != nil {
		return nil, fmt.Errorf("inspect gzip: %w", err)
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("inspect tar: %w", err)
		}
		if hdr.Name == "manifest.json" {
			var manifest Manifest
			if err := json.NewDecoder(tr).Decode(&manifest); err != nil {
				return nil, fmt.Errorf("inspect manifest: %w", err)
			}
			return &manifest, nil
		}
	}
	return nil, fmt.Errorf("manifest.json not found in archive")
}

func listSubdirs(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var names []string
	for _, e := range entries {
		if e.IsDir() {
			names = append(names, e.Name())
		}
	}
	return names, nil
}

func addDirToTar(tw *tar.Writer, srcDir, prefix string) error {
	return filepath.Walk(srcDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(srcDir, path)
		tarName := filepath.ToSlash(filepath.Join(prefix, rel))

		hdr, err := tar.FileInfoHeader(info, "")
		if err != nil {
			return err
		}
		hdr.Name = tarName

		if err := tw.WriteHeader(hdr); err != nil {
			return err
		}
		if info.IsDir() || !info.Mode().IsRegular() {
			return nil
		}
		f, err := os.Open(path)
		if err != nil {
			return err
		}
		defer f.Close()
		_, err = io.Copy(tw, f)
		return err
	})
}

func addFileToTar(tw *tar.Writer, filePath, name string) error {
	info, err := os.Stat(filePath)
	if err != nil {
		return err
	}
	hdr, err := tar.FileInfoHeader(info, "")
	if err != nil {
		return err
	}
	hdr.Name = name
	if err := tw.WriteHeader(hdr); err != nil {
		return err
	}
	f, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(tw, f)
	return err
}
