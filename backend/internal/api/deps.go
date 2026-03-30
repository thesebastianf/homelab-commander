package api

import (
	"github.com/thesebastianf/hlc/internal/audit"
	"github.com/thesebastianf/hlc/internal/backup"
	"github.com/thesebastianf/hlc/internal/core"
	"github.com/thesebastianf/hlc/internal/db"
	"github.com/thesebastianf/hlc/internal/docker"
	"github.com/thesebastianf/hlc/internal/envhub"
	"github.com/thesebastianf/hlc/internal/migrate"
	"github.com/thesebastianf/hlc/internal/nas"
	"github.com/thesebastianf/hlc/internal/notification"
	"github.com/thesebastianf/hlc/internal/observability"
	"github.com/thesebastianf/hlc/internal/scheduler"
	"github.com/thesebastianf/hlc/internal/stacks"
	"github.com/thesebastianf/hlc/internal/update"
)

// Deps holds all dependencies available to API handlers.
type Deps struct {
	Settings      *db.SettingsRepo
	PolicyEngine  core.PolicyEngine
	EnvStore      envhub.Store
	EnvInjector   *envhub.Injector
	DockerClient  *docker.Client
	EventBus      core.EventBus
	StackOperator *stacks.Operator
	NASChecker    *nas.Checker
	NASMonitor    *nas.Monitor
	Scheduler     *scheduler.Scheduler
	BackupExec    *backup.Executor
	UpdateExec    *update.Executor
	Stats         *observability.Collector
	AuditLogger   *audit.Logger
	Dispatcher    *notification.Dispatcher
	Migrator      *migrate.Engine
}
