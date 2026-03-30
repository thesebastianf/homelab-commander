package backup

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/thesebastianf/hlc/internal/docker"
)

// MountInfo describes a container's bind-mount or volume.
type MountInfo struct {
	Source      string `json:"Source"`
	Destination string `json:"Destination"`
	Type        string `json:"Type"`
}

// containerInspect holds the minimal subset we need from /containers/{id}/json.
type containerInspect struct {
	Mounts []MountInfo `json:"Mounts"`
}

// DetectMounts queries the Docker API for a container's configured mounts.
func DetectMounts(ctx context.Context, dc *docker.Client, containerID string) ([]MountInfo, error) {
	data, err := dc.Get(ctx, "/containers/"+url.PathEscape(containerID)+"/json")
	if err != nil {
		return nil, fmt.Errorf("inspect container %s: %w", containerID, err)
	}

	var inspect containerInspect
	if err := json.Unmarshal(data, &inspect); err != nil {
		return nil, fmt.Errorf("decode inspect %s: %w", containerID, err)
	}
	return inspect.Mounts, nil
}

// tarGzip creates a compressed archive of all mount source paths.
// Returns the path of the resulting .tar.gz file.
func tarGzip(mounts []MountInfo, destDir, containerName string) (string, error) {
	archiveName := containerName + ".tar.gz"
	archivePath := filepath.Join(destDir, archiveName)

	f, err := os.Create(archivePath)
	if err != nil {
		return "", fmt.Errorf("create archive %s: %w", archivePath, err)
	}
	defer f.Close()

	gz := gzip.NewWriter(f)
	defer gz.Close()
	tw := tar.NewWriter(gz)
	defer tw.Close()

	for _, m := range mounts {
		if m.Source == "" {
			continue
		}
		// Only back up bind mounts and local volumes.
		if m.Type != "bind" && m.Type != "volume" && m.Type != "" {
			continue
		}
		if err := addToTar(tw, m.Source, m.Source); err != nil {
			return "", fmt.Errorf("tar %s: %w", m.Source, err)
		}
	}
	return archivePath, nil
}

// addToTar recursively adds a path to a tar writer with a clean prefix.
func addToTar(tw *tar.Writer, root, basePath string) error {
	return filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(filepath.Dir(basePath), path)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)

		hdr, err := tar.FileInfoHeader(info, "")
		if err != nil {
			return err
		}
		hdr.Name = rel

		if info.Mode()&os.ModeSymlink != 0 {
			link, err := os.Readlink(path)
			if err != nil {
				return err
			}
			hdr.Linkname = link
		}

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

// dbDump runs db-type-appropriate dump command inside the container via exec API.
func dbDump(ctx context.Context, dc *docker.Client, containerID, dbType, destDir, containerName string) (string, error) {
	var cmd []string
	fileName := containerName + "-dump"

	switch strings.ToLower(dbType) {
	case "postgres":
		cmd = []string{"pg_dumpall", "-c"}
		fileName += ".sql"
	case "mariadb", "mysql":
		cmd = []string{"sh", "-c", "mysqldump --all-databases"}
		fileName += ".sql"
	case "redis":
		cmd = []string{"redis-cli", "BGSAVE"}
		fileName += ".rdb"
	default:
		return "", fmt.Errorf("unknown db-type %q", dbType)
	}

	out, err := dc.Exec(ctx, containerID, cmd)
	if err != nil {
		return "", fmt.Errorf("db-dump exec %s: %w", containerName, err)
	}

	archivePath := filepath.Join(destDir, fileName+".gz")
	f, err := os.Create(archivePath)
	if err != nil {
		return "", fmt.Errorf("create dump file: %w", err)
	}
	defer f.Close()

	gz := gzip.NewWriter(f)
	if _, err := gz.Write(out); err != nil {
		return "", err
	}
	return archivePath, gz.Close()
}
