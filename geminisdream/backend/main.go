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
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Service struct {
	docker *client.Client
}

func NewService() *Service {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		log.Fatalf("Failed to connect to Docker: %v", err)
	}
	return &Service{docker: cli}
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

	var stacks []string
	filepath.Walk(stackPath, func(path string, info os.FileInfo, err error) error {
		if !info.IsDir() && (info.Name() == "docker-compose.yml" || info.Name() == "docker-compose.yaml") {
			rel, _ := filepath.Rel(stackPath, filepath.Dir(path))
			stacks = append(stacks, rel)
		}
		return nil
	})

	c.JSON(http.StatusOK, stacks)
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
	r.GET("/ws/events", s.StreamEvents)

	log.Println("HLC Dream Operator starting on :8081...")
	r.Run(":8081")
}
