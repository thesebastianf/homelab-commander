package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/client"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"runtime"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Service struct {
	docker *client.Client
	host   string
}

func NewService() *Service {
	// Smart Host Discovery based on OS
	var defaultHosts []string
	if runtime.GOOS == "windows" {
		defaultHosts = []string{
			os.Getenv("DOCKER_HOST"),
			"npipe:////./pipe/dockerDesktopLinuxEngine", // Desktop preferred
			"npipe:////./pipe/docker_engine",
		}
	} else {
		defaultHosts = []string{
			os.Getenv("DOCKER_HOST"),
			"unix:///var/run/docker.sock",
		}
	}

	var cli *client.Client
	var err error

	for _, host := range defaultHosts {
		if host == "" {
			continue
		}
		log.Printf("[Discovery] Probing %s...", host)
		cli, err = client.NewClientWithOpts(
			client.WithHost(host),
			client.WithAPIVersionNegotiation(),
		)
		if err == nil {
			_, err = cli.Ping(context.Background())
			if err == nil {
				log.Printf("[Success] Tethered to %s", host)
				return &Service{docker: cli, host: host}
			}
		}
	}

	// Final Fallback
	log.Println("[Warning] Explicit discovery failed, using FromEnv fallback...")
	cli, err = client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		log.Fatalf("Critical: Docker Engine unreachable: %v", err)
	}
	return &Service{docker: cli, host: "auto (FromEnv)"}
}

func (s *Service) ListContainers(c *gin.Context) {
	containers, err := s.docker.ContainerList(context.Background(), types.ContainerListOptions{All: true})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, containers)
}

func (s *Service) StreamEvents(c *gin.Context) {
	ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket Upgrade error: %v", err)
		return
	}
	defer ws.Close()

	msgs, errs := s.docker.Events(context.Background(), types.EventsOptions{})
	for {
		select {
		case err := <-errs:
			if err != nil {
				return
			}
		case msg := <-msgs:
			if err := ws.WriteJSON(msg); err != nil {
				return
			}
		}
	}
}

func (s *Service) ListStacks(c *gin.Context) {
	stackPath := os.Getenv("STACK_PATH")
	if stackPath == "" {
		stackPath = "c:\\DEV\\homelab-commander\\stacks"
	}

	stacks := []string{}
	filepath.Walk(stackPath, func(path string, info os.FileInfo, err error) error {
		if info != nil && !info.IsDir() && (info.Name() == "docker-compose.yml" || info.Name() == "docker-compose.yaml") {
			rel, _ := filepath.Rel(stackPath, filepath.Dir(path))
			if rel != "." {
				stacks = append(stacks, rel)
			}
		}
		return nil
	})

	c.JSON(http.StatusOK, stacks)
}

func (s *Service) GetStackCompose(c *gin.Context) {
	name := c.Param("name")
	if name == "" || name == "/" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Stack name is required"})
		return
	}
	
	// Trim leading slash from wildcard param
	if name[0] == '/' {
		name = name[1:]
	}

	stackPath := os.Getenv("STACK_PATH")
	if stackPath == "" {
		stackPath = "c:\\DEV\\homelab-commander\\stacks"
	}

	// Support both .yml and .yaml
	fullPath := filepath.Join(stackPath, name, "docker-compose.yml")
	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		fullPath = filepath.Join(stackPath, name, "docker-compose.yaml")
	}

	content, err := os.ReadFile(fullPath)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Compose file not found for stack: " + name})
		return
	}

	c.String(http.StatusOK, string(content))
}

func main() {
	s := NewService()
	r := gin.Default()

	// CORS
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Next()
	})

	r.GET("/api/containers", s.ListContainers)
	r.GET("/api/stacks", s.ListStacks)
	r.GET("/api/stacks/compose/*name", s.GetStackCompose)
	r.GET("/ws/events", s.StreamEvents)
	r.GET("/api/system/status", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"host": s.host,
			"os":   runtime.GOOS,
		})
	})

	log.Println("HLC Dream Operator starting on :8081...")
	r.Run(":8081")
}
