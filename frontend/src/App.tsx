import { useState, useEffect } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { LoadingScreen } from '@/components/LoadingScreen'
import { LoginScreen } from '@/components/LoginScreen'
import { MetricCard } from '@/components/MetricCard'
import { ContainerCard } from '@/components/ContainerCard'
import { ImageCard } from '@/components/ImageCard'
import { StackCard } from '@/components/StackCard'
import { VolumeCard } from '@/components/VolumeCard'
import { NetworkCard } from '@/components/NetworkCard'
import { AggregatedLogs } from '@/components/AggregatedLogs'
import { SettingsDialog } from '@/components/SettingsDialog'
import { MaintenanceDialog } from '@/components/MaintenanceDialog'
import { NotificationServicesDialog } from '@/components/NotificationServicesDialog'
import { StacksEditor } from '@/components/StacksEditor'
import { BackupManagementDialog } from '@/components/BackupManagementDialog'
import { SmartStartupDialog } from '@/components/SmartStartupDialog'
import { PortRegistryDialog } from '@/components/PortRegistryDialog'
import { ClockWidget } from '@/components/ClockWidget'
import {
  Box,
  Home,
  ImageIcon,
  Layers,
  Network,
  HardDrive,
  TrendingUp,
  Search,
  Settings,
  Paintbrush,
  Bell,
  CloudDownload,
  Snowflake,
  Save,
  Zap,
  ListOrdered,
  Cpu,
  MemoryStick,
  Database,
  Container,
  Play,
  StopCircle
} from 'lucide-react'
import { useContainers, useStartContainer, useStopContainer, useRestartContainer, useRemoveContainer, useAggregatedLogs } from '@/hooks/useContainers'
import { useImages } from '@/hooks/useImages'
import { useStacks, useExternalStacks, useDeployStack, useStopStack, useRestartStack, useUpdateStack } from '@/hooks/useStacks'
import { useVolumes } from '@/hooks/useVolumes'
import { useNetworks } from '@/hooks/useNetworks'
import { useSettings, useSystemInfo, useUpdateSettings, usePruneSystem } from '@/hooks/useSettings'
import type { Stack, AppSettings } from '@/lib/types'
import { getStoredCredentials } from '@/lib/api'
import { toast } from 'sonner'

const defaultSettings: AppSettings = {
  dockerHost: '/var/run/docker.sock',
  refreshInterval: 5,
  maxLogLines: 200,
  autoUpdate: false,
  globalUpdateFreeze: false,
  stacksBasePath: '/opt/stacks',
  volumesBasePath: '/mnt/docker-volumes',
  backupsBasePath: '/mnt/backups',
  notifications: {
    enabled: false,
    services: [],
    events: {
      updateAvailable: true,
      containerAutoUpdated: true,
      containerFailed: true,
      highMemory: true,
      highCpu: true,
      containerStarted: false,
      containerStopped: false,
      stackDeployed: true,
      stackFailed: true
    },
    thresholds: {
      memoryPercent: 80,
      cpuPercent: 80
    }
  },
  ai: {
    enabled: false,
    provider: 'ollama',
    baseUrl: 'http://host.docker.internal:11434',
    apiKey: '',
    model: 'llama3.1',
    treatAsLocal: true,
    allowEnvToLocal: false,
  },
}

function App() {
  // ALL HOOKS MUST BE DECLARED FIRST - BEFORE ANY EARLY RETURNS
  // Query hooks
  const containersQuery = useContainers()
  const imagesQuery = useImages()
  const stacksQuery = useStacks()
  const externalStacksQuery = useExternalStacks()
  const volumesQuery = useVolumes()
  const networksQuery = useNetworks()
  const settingsQuery = useSettings()
  const systemInfoQuery = useSystemInfo()
  const aggregatedLogsQuery = useAggregatedLogs()

  // Mutation hooks
  const startContainer = useStartContainer()
  const stopContainer = useStopContainer()
  const restartContainer = useRestartContainer()
  const removeContainer = useRemoveContainer()
  const deployStack = useDeployStack()
  const stopStack = useStopStack()
  const restartStack = useRestartStack()
  const updateStack = useUpdateStack()
  const updateSettings = useUpdateSettings()
  const pruneSystem = usePruneSystem()

  // State hooks - MUST BE HERE BEFORE EARLY RETURN
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState('dashboard')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [maintenanceOpen, setMaintenanceOpen] = useState(false)
  const [notificationServicesOpen, setNotificationServicesOpen] = useState(false)
  const [backupManagementOpen, setBackupManagementOpen] = useState(false)
  const [smartStartupOpen, setSmartStartupOpen] = useState(false)
  const [portRegistryOpen, setPortRegistryOpen] = useState(false)

  // Extract data from queries
  const containers = containersQuery.data ?? []
  const images = imagesQuery.data ?? []
  const stacks = stacksQuery.data ?? []
  const externalStacks = externalStacksQuery.data ?? []
  const volumes = volumesQuery.data ?? []
  const networks = networksQuery.data ?? []
  const settings = settingsQuery.data
  const systemInfo = systemInfoQuery.data
  const aggregatedLogs = aggregatedLogsQuery.data ?? []

  // Show loading screen while initial data is being fetched
  const isLoading = containersQuery.isPending || imagesQuery.isPending || stacksQuery.isPending

  if (isLoading) {
    return <LoadingScreen />
  }

  const currentSettings: AppSettings = {
    ...defaultSettings,
    ...settings,
    notifications: {
      ...defaultSettings.notifications,
      ...(settings?.notifications || {}),
    },
    homeAssistant: settings?.homeAssistant ?? defaultSettings.homeAssistant,
    ai: settings?.ai ?? defaultSettings.ai,
  }

  const systemStats = {
    containers: {
      running: containers.filter(c => c.status === 'running').length,
      stopped: containers.filter(c => c.status === 'stopped').length,
      total: containers.length,
    },
    images: images.length,
    volumes: volumes.length,
    networks: networks.length,
    stacks: stacks.length,
    cpuUsage: systemInfo?.cpuUsedPercent ?? 0,
    memoryUsage: systemInfo?.memoryUsedPercent ?? 0,
    memoryTotal: systemInfo?.memoryTotal ?? systemInfo?.memory ?? '0 GB',
    diskUsage: systemInfo?.diskUsedPercent ?? 0,
    diskTotal: systemInfo?.diskTotal ?? '0 GB',
  }

  const handleStartContainer = (id: string) => {
    startContainer.mutate(id, {
      onSuccess: () => toast.success('Container started'),
      onError: () => toast.error('Failed to start container')
    })
  }

  const handleStopContainer = (id: string) => {
    stopContainer.mutate(id, {
      onSuccess: () => toast.success('Container stopped'),
      onError: () => toast.error('Failed to stop container')
    })
  }

  const handleRestartContainer = (id: string) => {
    restartContainer.mutate(id, {
      onSuccess: () => toast.success('Container restarted'),
      onError: () => toast.error('Failed to restart container')
    })
  }

  const handleRemoveContainer = (id: string) => {
    const container = containers.find(c => c.id === id)
    if (container?.status === 'running') {
      toast.error('Cannot remove running container. Stop it first.')
      return
    }
    removeContainer.mutate({ id }, {
      onSuccess: () => toast.success('Container removed'),
      onError: () => toast.error('Failed to remove container')
    })
  }

  const handleViewLogs = (id: string) => {
    const container = containers.find(c => c.id === id)
    toast.info(`Opening logs for ${container?.name}`)
  }

  const handleOpenTerminal = (id: string) => {
    const container = containers.find(c => c.id === id)
    if (container?.status !== 'running') {
      toast.error('Container must be running to access terminal')
      return
    }
    toast.info(`Opening terminal for ${container?.name}`)
  }

  const handlePurgeImages = async () => { await pruneSystem.mutateAsync(); }
  const handlePruneSystems = async () => { await pruneSystem.mutateAsync(); }

  const containersWithUpdates = containers.filter(c => c.updateAvailable).length
  const autoUpdateEnabled = currentSettings.autoUpdate

  const filteredContainers = containers.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.image.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-right" richColors />
      <header className="border-b border-border bg-card sticky top-0 z-50 backdrop-blur-sm bg-card/80">
        <div className="px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/thc_small_.png" alt="THC Logo" className="h-12 w-12 object-contain" />
              <div>
                <h1 className="text-xl font-bold font-mono tracking-tight">THC</h1>
                <p className="text-xs text-muted-foreground">The Homelab Commander · highly addictive.</p>
              </div>
            </div>

            {/* Status badges */}
            <div className="flex items-center gap-2">
              {currentSettings.globalUpdateFreeze && (
                <Badge variant="destructive" className="gap-1 px-3 animate-pulse">
                  <Snowflake className="w-3 h-3" />
                  UPDATE FREEZE
                </Badge>
              )}
              {autoUpdateEnabled && !currentSettings.globalUpdateFreeze && (
                <Badge variant="secondary" className="gap-1 px-3 font-mono text-xs">
                  Auto-Update ON
                </Badge>
              )}
              {containersWithUpdates > 0 && (
                <Badge variant="outline" className="border-warning text-warning gap-1 font-mono text-xs">
                  <CloudDownload className="w-3 h-3" />
                  {containersWithUpdates} Updates
                </Badge>
              )}
            </div>

            {/* Clock + timezone */}
            <ClockWidget />

            {/* Action buttons with labels */}
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setPortRegistryOpen(true)} className="flex flex-col items-center gap-0.5 h-12 px-3 text-muted-foreground hover:text-foreground">
                <ListOrdered className="w-4 h-4" />
                <span className="text-[10px] font-mono">Ports</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSmartStartupOpen(true)} className="flex flex-col items-center gap-0.5 h-12 px-3 text-muted-foreground hover:text-foreground">
                <Zap className="w-4 h-4" />
                <span className="text-[10px] font-mono">Startup</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setBackupManagementOpen(true)} className="flex flex-col items-center gap-0.5 h-12 px-3 text-muted-foreground hover:text-foreground">
                <Save className="w-4 h-4" />
                <span className="text-[10px] font-mono">Backup</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setNotificationServicesOpen(true)} className="flex flex-col items-center gap-0.5 h-12 px-3 text-muted-foreground hover:text-foreground">
                <Bell className="w-4 h-4" />
                <span className="text-[10px] font-mono">Alerts</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setMaintenanceOpen(true)} className="flex flex-col items-center gap-0.5 h-12 px-3 text-muted-foreground hover:text-foreground">
                <Paintbrush className="w-4 h-4" />
                <span className="text-[10px] font-mono">Cleanup</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)} className="flex flex-col items-center gap-0.5 h-12 px-3 text-muted-foreground hover:text-foreground">
                <Settings className="w-4 h-4" />
                <span className="text-[10px] font-mono">Settings</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="dashboard" className="gap-2">
              <Home className="w-4 h-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="stacks" className="gap-2">
              <Layers className="w-4 h-4" />
              Stacks
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-mono">
                {stacks.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="containers" className="gap-2">
              <Box className="w-4 h-4" />
              Containers
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-mono">
                {systemStats.containers.total}
              </span>
            </TabsTrigger>
            <TabsTrigger value="volumes" className="gap-2">
              <HardDrive className="w-4 h-4" />
              Volumes
            </TabsTrigger>
            <TabsTrigger value="images" className="gap-2">
              <ImageIcon className="w-4 h-4" />
              Images
            </TabsTrigger>
            <TabsTrigger value="networks" className="gap-2">
              <Network className="w-4 h-4" />
              Networks
            </TabsTrigger>
          </TabsList>

          {/* ═══ DASHBOARD ═══ */}
          <TabsContent value="dashboard" className="space-y-4">

            {/* Row 1: Resource Usage — 6 compact cards */}
            <div>
              <p className="text-xs font-mono text-muted-foreground font-semibold tracking-widest mb-2 uppercase">Resource Usage</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
                <MetricCard
                  label="CPU"
                  value={`${systemStats.cpuUsage.toFixed(1)}%`}
                  icon={<Cpu className="w-5 h-5" />}
                  compact
                />
                <MetricCard
                  label="Memory"
                  value={`${systemStats.memoryUsage.toFixed(1)}%`}
                  icon={<MemoryStick className="w-5 h-5" />}
                  compact
                />
                <MetricCard
                  label="Disk"
                  value={`${systemStats.diskUsage.toFixed(1)}%`}
                  icon={<Database className="w-5 h-5" />}
                  compact
                />
                <MetricCard
                  label="Memory Total"
                  value={systemStats.memoryTotal}
                  icon={<MemoryStick className="w-5 h-5" />}
                  compact
                />
                <MetricCard
                  label="Disk Total"
                  value={systemStats.diskTotal}
                  icon={<HardDrive className="w-5 h-5" />}
                  compact
                />
                <MetricCard
                  label="Networks"
                  value={systemStats.networks}
                  icon={<Network className="w-5 h-5" />}
                  compact
                />
              </div>
            </div>

            {/* Row 2: System Overview — 6 compact cards */}
            <div>
              <p className="text-xs font-mono text-muted-foreground font-semibold tracking-widest mb-2 uppercase">System Overview</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
                <MetricCard
                  label="Containers"
                  value={systemStats.containers.total}
                  icon={<Container className="w-5 h-5" />}
                  compact
                  pulse={systemStats.containers.running > 0}
                />
                <MetricCard
                  label="Running"
                  value={systemStats.containers.running}
                  icon={<Play className="w-5 h-5" />}
                  compact
                  className="border-l-4 border-l-success"
                />
                <MetricCard
                  label="Stopped"
                  value={systemStats.containers.stopped}
                  icon={<StopCircle className="w-5 h-5" />}
                  compact
                  className={systemStats.containers.stopped > 0 ? "border-l-4 border-l-destructive" : ""}
                />
                <MetricCard
                  label="Images"
                  value={systemStats.images}
                  icon={<ImageIcon className="w-5 h-5" />}
                  compact
                />
                <MetricCard
                  label="Volumes"
                  value={systemStats.volumes}
                  icon={<HardDrive className="w-5 h-5" />}
                  compact
                />
                <MetricCard
                  label="Stacks"
                  value={systemStats.stacks}
                  icon={<Layers className="w-5 h-5" />}
                  compact
                />
              </div>
            </div>

            {/* Full-width Aggregated Logs */}
            <AggregatedLogs logs={aggregatedLogs} />
          </TabsContent>

          <TabsContent value="containers" className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search containers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 font-mono"
                />
              </div>
            </div>

            <div className="grid gap-4">
              {filteredContainers.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Box className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-mono">No containers found</p>
                  <p className="text-sm mt-2">Create your first container to get started</p>
                </div>
              ) : (
                filteredContainers.map(container => (
                  <ContainerCard
                    key={container.id}
                    container={container}
                    onStart={handleStartContainer}
                    onStop={handleStopContainer}
                    onRestart={handleRestartContainer}
                    onRemove={handleRemoveContainer}
                    onViewLogs={handleViewLogs}
                    onOpenTerminal={handleOpenTerminal}
                  />
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="images" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold font-mono">Docker Images</h2>
                <p className="text-sm text-muted-foreground mt-1">Manage your Docker images and tags</p>
              </div>
            </div>
            <div className="grid gap-4">
              {images.map(image => (
                <ImageCard
                  key={image.id}
                  image={image}
                  onPull={() => toast.info(`Pulling latest ${image.repository}:${image.tag}`)}
                  onRemove={() => toast.success(`Removed ${image.repository}:${image.tag}`)}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="stacks">
            <StacksEditor
              stacks={stacks}
              externalStacks={externalStacks}
              containers={containers}
              onDeployStack={(id) => {
                deployStack.mutate(id, {
                  onSuccess: () => toast.success('Stack deployed'),
                  onError: () => toast.error('Failed to deploy stack')
                })
              }}
              onStopStack={(id) => {
                stopStack.mutate(id, {
                  onSuccess: () => toast.success('Stack stopped'),
                  onError: () => toast.error('Failed to stop stack')
                })
              }}
              onRestartStack={(id) => {
                restartStack.mutate(id, {
                  onSuccess: () => toast.success('Stack restarted'),
                  onError: () => toast.error('Failed to restart stack')
                })
              }}
            />
          </TabsContent>

          <TabsContent value="volumes" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold font-mono">Docker Volumes</h2>
                <p className="text-sm text-muted-foreground mt-1">Persistent data storage for containers</p>
              </div>
            </div>
            <div className="grid gap-4">
              {volumes.map(volume => (
                <VolumeCard
                  key={volume.id}
                  volume={volume}
                  onRemove={() => toast.success(`Removed volume ${volume.name}`)}
                  onInspect={() => toast.info(`Inspecting volume ${volume.name}`)}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="networks" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold font-mono">Docker Networks</h2>
                <p className="text-sm text-muted-foreground mt-1">Container network configuration and connectivity</p>
              </div>
            </div>
            <div className="grid gap-4">
              {networks.map(network => (
                <NetworkCard
                  key={network.id}
                  network={network}
                  onRemove={() => toast.success(`Removed network ${network.name}`)}
                  onInspect={() => toast.info(`Inspecting network ${network.name}`)}
                />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={currentSettings}
        onSave={(s) => updateSettings.mutate(s)}
      />

      <MaintenanceDialog
        open={maintenanceOpen}
        onOpenChange={setMaintenanceOpen}
      />

      <NotificationServicesDialog
        open={notificationServicesOpen}
        onOpenChange={setNotificationServicesOpen}
        services={currentSettings.notifications?.services || []}
        onSave={(services) => {
          updateSettings.mutate({
            ...currentSettings,
            notifications: { ...currentSettings.notifications, services }
          })
        }}
      />

      <BackupManagementDialog
        open={backupManagementOpen}
        onOpenChange={setBackupManagementOpen}
        stacks={stacks}
        backupsBasePath={currentSettings.backupsBasePath || '/mnt/backups'}
        onUpdateBackupsPath={(path) => {
          updateSettings.mutate({ ...currentSettings, backupsBasePath: path })
        }}
      />

      <SmartStartupDialog
        open={smartStartupOpen}
        onOpenChange={setSmartStartupOpen}
        stacks={stacks}
      />

      <PortRegistryDialog
        open={portRegistryOpen}
        onOpenChange={setPortRegistryOpen}
        containers={containers}
        stacks={stacks}
      />

      {/* Footer */}
      <footer className="mt-8 pb-4 text-center">
        <a
          href="https://github.com/thesebastianf/homelab-commander"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg
            viewBox="0 0 24 24"
            className="w-4 h-4"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Cute whale */}
            <path d="M12 2c-1 0-2 .5-2.5 1.5S9 5 10 5c1 0 2-.5 2.5-1.5S13 3 12 2zm6 6c0-1-1-2-2-2s-2 1-2 2 1 2 2 2 2-1 2-2zm-12 0c0-1-1-2-2-2s-2 1-2 2 1 2 2 2 2-1 2-2zm10 2h-8c-2 0-4 1-5 3-1 1-.5 2 .5 2.5L4 16c0 1 1 3 3 4 0 .5 1 1 2 1s2-.5 2-1c0 0 2 1 3 1s3-1 3-1c0 .5 1 1 2 1s2-.5 2-1c2-1 3-3 3-4l2.5-2.5c1-.5 1.5-1.5.5-2.5-1-2-3-3-5-3z" />
          </svg>
          <span>Made with ❤️ by Sebastian F.</span>
        </a>
      </footer>
    </div>
  )
}

/**
 * Auth gate wrapper.
 *
 * - Probes /api/settings (a protected endpoint) on mount to detect whether auth is enabled.
 * - If 401 → shows LoginScreen.
 * - If 200 → auth is disabled, show App directly.
 * - Mid-session 401s (credentials expired) re-show LoginScreen via hlc:unauthorized event.
 */
type AuthStatus = 'checking' | 'open' | 'required' | 'authenticated'

function AuthGate() {
  const [status, setStatus] = useState<AuthStatus>(() =>
    // If we already have stored credentials, skip the probe and try directly.
    // The first failing API call will dispatch hlc:unauthorized and reset to 'required'.
    getStoredCredentials() !== null ? 'authenticated' : 'checking'
  )

  // Probe a real auth-protected endpoint ONCE on mount (not /healthz — that bypasses auth)
  useEffect(() => {
    if (status !== 'checking') return
    let isMounted = true
    fetch('/api/settings', { headers: { 'Content-Type': 'application/json' } })
      .then(r => {
        if (!isMounted) return
        if (r.status === 401) setStatus('required')
        else setStatus('open')   // 200 = auth disabled, other errors = try to proceed anyway
      })
      .catch(() => {
        if (!isMounted) return
        setStatus('open')
      })
    return () => { isMounted = false }
  }, []) // Empty dependency array — run only once on mount

  // Listen for mid-session 401s dispatched by api.ts
  useEffect(() => {
    const handler = () => setStatus('required')
    window.addEventListener('hlc:unauthorized', handler)
    return () => window.removeEventListener('hlc:unauthorized', handler)
  }, [])

  if (status === 'checking') return <LoadingScreen />

  if (status === 'required') {
    return (
      <>
        <Toaster position="bottom-right" richColors />
        <LoginScreen onAuthenticated={() => setStatus('authenticated')} />
      </>
    )
  }

  return <App />
}

export default AuthGate
