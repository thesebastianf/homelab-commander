package docker

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

// PortMapping represents a single host↔container port binding.
type PortMapping struct {
	HostIP        string `json:"host_ip"`
	HostPort      uint16 `json:"host_port"`
	ContainerPort uint16 `json:"container_port"`
	Protocol      string `json:"protocol"` // tcp | udp
}

// Container is a normalised view of a Docker container.
type Container struct {
	ID     string
	Name   string
	Image  string
	State  string            // running, exited, paused, etc.
	Labels map[string]string // all labels, including hlc.*
	Ports  []PortMapping     // published host↔container port mappings
}

// portJSON mirrors Docker's per-container port object in GET /containers/json.
type portJSON struct {
	IP          string `json:"IP"`
	PrivatePort uint16 `json:"PrivatePort"`
	PublicPort  uint16 `json:"PublicPort"`
	Type        string `json:"Type"`
}

// containerJSON mirrors the relevant fields from Docker's GET /containers/json response.
type containerJSON struct {
	ID    string    `json:"Id"`
	Names []string  `json:"Names"`
	Image string    `json:"Image"`
	State string    `json:"State"`
	Ports []portJSON `json:"Ports"`
	// Labels is nested under Config when using inspect, but /containers/json
	// surfaces them directly under the container object via the Labels field.
	Labels map[string]string `json:"Labels"`
}

// ListContainers returns all containers (running and stopped) from the Docker
// Engine, normalising names and labels into the Container struct.
func (c *Client) ListContainers(ctx context.Context) ([]Container, error) {
	data, err := c.Get(ctx, "/containers/json?all=true")
	if err != nil {
		return nil, fmt.Errorf("list containers: %w", err)
	}

	var raw []containerJSON
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("list containers: parse response: %w", err)
	}

	containers := make([]Container, 0, len(raw))
	for _, r := range raw {
		name := ""
		if len(r.Names) > 0 {
			// Docker prefixes names with "/" — strip it.
			name = strings.TrimPrefix(r.Names[0], "/")
		}

		labels := r.Labels
		if labels == nil {
			labels = make(map[string]string)
		}

		ports := make([]PortMapping, 0, len(r.Ports))
		for _, p := range r.Ports {
			// Only include bindings that have a host port (i.e. actually published).
			if p.PublicPort == 0 {
				continue
			}
			proto := p.Type
			if proto == "" {
				proto = "tcp"
			}
			ports = append(ports, PortMapping{
				HostIP:        p.IP,
				HostPort:      p.PublicPort,
				ContainerPort: p.PrivatePort,
				Protocol:      proto,
			})
		}

		containers = append(containers, Container{
			ID:     r.ID,
			Name:   name,
			Image:  r.Image,
			State:  r.State,
			Labels: labels,
			Ports:  ports,
		})
	}

	return containers, nil
}
