package backup

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"database/sql"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// RestoreResult describes what would happen (or happened) during a restore.
type RestoreResult struct {
	ArchivePath string
	FilesCount  int
	Destination string
	DryRun      bool
}

// RestoreDryRun lists files that would be restored without touching disk.
func RestoreDryRun(_ context.Context, meta Metadata, destDir string) (*RestoreResult, error) {
	f, err := os.Open(meta.ArchivePath)
	if err != nil {
		return nil, fmt.Errorf("restore dry-run open %s: %w", meta.ArchivePath, err)
	}
	defer f.Close()

	gz, err := gzip.NewReader(f)
	if err != nil {
		return nil, fmt.Errorf("restore dry-run gzip: %w", err)
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	count := 0
	for {
		_, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("restore dry-run tar: %w", err)
		}
		count++
	}
	return &RestoreResult{
		ArchivePath: meta.ArchivePath,
		FilesCount:  count,
		Destination: destDir,
		DryRun:      true,
	}, nil
}

// Restore extracts the archive to destDir, then marks it restored in DB.
func Restore(ctx context.Context, db *sql.DB, meta Metadata, destDir string) (*RestoreResult, error) {
	f, err := os.Open(meta.ArchivePath)
	if err != nil {
		return nil, fmt.Errorf("restore open %s: %w", meta.ArchivePath, err)
	}
	defer f.Close()

	gz, err := gzip.NewReader(f)
	if err != nil {
		return nil, fmt.Errorf("restore gzip: %w", err)
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	count := 0
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("restore tar entry: %w", err)
		}

		target := filepath.Join(destDir, filepath.Clean("/"+hdr.Name))
		switch hdr.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, os.FileMode(hdr.Mode)); err != nil {
				return nil, err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return nil, err
			}
			out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, os.FileMode(hdr.Mode))
			if err != nil {
				return nil, err
			}
			if _, err := io.Copy(out, tr); err != nil {
				out.Close()
				return nil, err
			}
			out.Close()
			count++
		}
	}

	if err := MarkRestored(ctx, db, meta.ID); err != nil {
		return nil, err
	}

	return &RestoreResult{
		ArchivePath: meta.ArchivePath,
		FilesCount:  count,
		Destination: destDir,
	}, nil
}
