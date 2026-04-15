package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/thesebastianf/hlc/internal/api"
	"github.com/thesebastianf/hlc/internal/audit"
	"github.com/thesebastianf/hlc/internal/auth"
	"github.com/thesebastianf/hlc/internal/backup"
	"github.com/thesebastianf/hlc/internal/core"
	"github.com/thesebastianf/hlc/internal/db"
	"github.com/thesebastianf/hlc/internal/docker"
	"github.com/thesebastianf/hlc/internal/envhub"
	"github.com/thesebastianf/hlc/internal/labels"
	"github.com/thesebastianf/hlc/internal/migrate"
	"github.com/thesebastianf/hlc/internal/nas"
	"github.com/thesebastianf/hlc/internal/notification"
	"github.com/thesebastianf/hlc/internal/observability"
	"github.com/thesebastianf/hlc/internal/scheduler"
	"github.com/thesebastianf/hlc/internal/stacks"
	"github.com/thesebastianf/hlc/internal/update"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelDebug,
	}))
	slog.SetDefault(logger)

	// --- Config from env ---
	socketPath := envOrDefault("DOCKER_SOCKET", "/var/run/docker.sock")
	dataDir := envOrDefault("HLC_DATA_DIR", "/data")
	dbPath := envOrDefault("HLC_DB_PATH", dataDir+"/hlc.db")
	backupDir := envOrDefault("HLC_BACKUP_DIR", dataDir+"/backups")
	baseStackDir := envOrDefault("HLC_STACK_DIR", "/opt/stacks")
	listenAddr := envOrDefault("HLC_LISTEN", ":8080")
	nasAnchorFile := envOrDefault("HLC_NAS_ANCHOR", ".nas-ready")

	// 1. Database
	sqlDB, err := db.Open(dbPath)
	if err != nil {
		slog.Error("failed to open database", "error", err)
		os.Exit(1)
	}
	defer sqlDB.Close()

	// 2. Event Bus
	bus := core.NewEventBus()

	// 3. Docker Client
	dc := docker.NewClient(socketPath)

	// 4. Settings repo
	settingsRepo := db.NewSettingsRepo(sqlDB)

	// 5. Env Hub
	envStore := envhub.NewStore(sqlDB)
	envInjector := envhub.NewInjector(envStore, baseStackDir)

	// 6. Policy Engine
	policyEngine := core.NewPolicyEngine(sqlDB, bus)

	// 7. Stack Operator
	stackOperator := stacks.NewOperator(baseStackDir, dc, envInjector, bus, policyEngine)

	// 8. NAS
	nasChecker := nas.NewChecker(nasAnchorFile)
	nasMonitor := nas.NewMonitor(nasChecker, nil, 30*time.Second, bus, logger)
	bootSequencer := nas.NewBootSequencer(nasChecker, stackOperator, logger, 5*time.Minute)

	// 9. Auth
	tokenStore := auth.NewTokenStore(sqlDB)
	authMode := auth.NewMode(tokenStore, bus)

	// 10. Audit
	auditLogger := audit.NewLogger(sqlDB)
	auditSub := audit.NewSubscriber(auditLogger, logger)
	auditSub.RegisterAll(bus)

	// 11. Scheduler
	sched := scheduler.New(logger)

	// 12. Backup
	backupExec := backup.NewExecutor(dc, sqlDB, backupDir, bus, logger)

	// 13. Update
	updateExec := update.NewExecutor(dc, backupExec, sqlDB, bus, logger)

	// 14. Observability
	statsCollector := observability.NewCollector(dc, sqlDB, bus, logger)

	// 15. Notification
	dispatcher := notification.NewDispatcher(sqlDB, logger)
	dispatcher.RegisterAll(bus)

	// 16. Migration
	migrateEngine := migrate.NewEngine()

	// 17. API Server
	deps := &api.Deps{
		Settings:      settingsRepo,
		PolicyEngine:  policyEngine,
		EnvStore:      envStore,
		EnvInjector:   envInjector,
		DockerClient:  dc,
		EventBus:      bus,
		StackOperator: stackOperator,
		NASChecker:    nasChecker,
		NASMonitor:    nasMonitor,
		Scheduler:     sched,
		BackupExec:    backupExec,
		UpdateExec:    updateExec,
		Stats:         statsCollector,
		AuditLogger:   auditLogger,
		Dispatcher:    dispatcher,
		Migrator:      migrateEngine,
	}
	srv := api.NewServer(deps)
	mux := http.NewServeMux()
	srv.RegisterRoutes(mux)

	// Serve static files and templates
	mux.Handle("GET /static/", http.StripPrefix("/static/", http.FileServer(http.Dir("web/static"))))
	mux.HandleFunc("GET /", srv.HandleUI)

	httpServer := &http.Server{
		Addr:         listenAddr,
		Handler:      authMode.AuthMiddleware(srv.WrapMux(mux)),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Start background services
	nasMonitor.Start(ctx)
	sched.Start(ctx)

	go func() {
		if err := statsCollector.CollectAll(ctx); err != nil {
			slog.Warn("stats collection ended", "error", err)
		}
	}()

	go func() {
		if err := dc.StreamEvents(ctx, bus); err != nil {
			slog.Warn("docker event stream ended", "error", err)
		}
	}()

	go func() {
		rawContainers, err := dc.ListContainers(ctx)
		if err != nil {
			slog.Warn("boot sequencer: could not list containers", "error", err)
			return
		}
		classified := labels.ClassifyAll(rawContainers)
		if err := bootSequencer.BootAll(ctx, classified); err != nil {
			slog.Warn("boot sequencer ended", "error", err)
		}
	}()

	// Start HTTP server
	slog.Info("starting HLC server", "addr", listenAddr)
	go func() {
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("http server error", "error", err)
			cancel()
		}
	}()

	// Wait for signal
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)
	select {
	case sig := <-sigCh:
		slog.Info("received signal, shutting down", "signal", sig)
	case <-ctx.Done():
	}

	cancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer shutdownCancel()

	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		slog.Error("http shutdown error", "error", err)
	}
	if err := bus.Shutdown(shutdownCtx); err != nil {
		slog.Error("event bus shutdown error", "error", err)
	}

	slog.Info("shutdown complete")
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

