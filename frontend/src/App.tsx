import { useState } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import { StacksList } from '@/components/StacksList'
import { EnhancedStackEditorDialog } from '@/components/EnhancedStackEditorDialog'
import { NewStackDialog } from '@/components/NewStackDialog'
import { BackupManagementDialog } from '@/components/BackupManagementDialog'
import { SmartStartupDialog } from '@/components/SmartStartupDialog'
import { PortRegistryDialog } from '@/components/PortRegistryDialog'
import {
  Box,
  Home,
  ImageIcon,
  Layers,
  Network,
  HardDrive,
  TrendingUp,
  Plus,
  Search,
  Settings,
  Paintbrush,
  Bell,
  CloudDownload,
  Snowflake,
  Save,
  Zap,
  ListOrdered
} from 'lucide-react'
import { useContainers, useStartContainer, useStopContainer, useRestartContainer, useRemoveContainer } from '@/hooks/useContainers'
import { useImages } from '@/hooks/useImages'
import { useStacks, useDeployStack, useStopStack, useRestartStack } from '@/hooks/useStacks'
import { useVolumes } from '@/hooks/useVolumes'
import { useNetworks } from '@/hooks/useNetworks'
import { useSettings, useSystemInfo, useUpdateSettings, usePruneSystem } from '@/hooks/useSettings'
import type { Stack, AppSettings, LogEntry } from '@/lib/types'
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
  }
}

function App() {
  const { data: containers = [] } = useContainers()
  const { data: images = [] } = useImages()
  const { data: stacks = [] } = useStacks()
  const { data: volumes = [] } = useVolumes()
  const { data: networks = [] } = useNetworks()
  const { data: settings } = useSettings()
  const { data: systemInfo } = useSystemInfo()

  const startContainer = useStartContainer()
  const stopContainer = useStopContainer()
  const restartContainer = useRestartContainer()
  const removeContainer = useRemoveContainer()
  const deployStack = useDeployStack()
  const stopStack = useStopStack()
  const restartStack = useRestartStack()
  const updateSettings = useUpdateSettings()
  const pruneSystem = usePruneSystem()

  const currentSettings = settings || defaultSettings

  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState('dashboard')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [maintenanceOpen, setMaintenanceOpen] = useState(false)
  const [notificationServicesOpen, setNotificationServicesOpen] = useState(false)
  const [stackEditorOpen, setStackEditorOpen] = useState(false)
  const [newStackOpen, setNewStackOpen] = useState(false)
  const [backupManagementOpen, setBackupManagementOpen] = useState(false)
  const [smartStartupOpen, setSmartStartupOpen] = useState(false)
  const [portRegistryOpen, setPortRegistryOpen] = useState(false)
  const [selectedStackForView, setSelectedStackForView] = useState<Stack | null>(null)
  const [selectedStackForEdit, setSelectedStackForEdit] = useState<Stack | null>(null)
  const [logs] = useState<LogEntry[]>([])

  const systemStats = {
    containers: {
      running: containers.filter(c => c.status === 'running').length,
      stopped: containers.filter(c => c.status === 'stopped').length,
      total: containers.length,
    },
    images: images.length,
    volumes: volumes.length,
    networks: networks.length,
    cpuUsage: 0,
    memoryUsage: 0,
    memoryTotal: systemInfo?.memory || '0 GB',
    diskUsage: 0,
    diskTotal: '0 GB',
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

  const handleStackEdit = (stack: Stack) => {
    setSelectedStackForEdit(stack)
    setStackEditorOpen(true)
  }

  const handleStackSave = (stack: Stack) => {
    setSelectedStackForView(stack)
    toast.success('Stack configuration saved')
  }

  const handleNewStackSave = (stack: Stack) => {
    setSelectedStackForView(stack)
  }

  const handlePurgeImages = async () => {
    pruneSystem.mutateAsync()
  }

  const handlePruneSystems = async () => {
    pruneSystem.mutateAsync()
  }

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
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-primary to-accent">
                <Box className="w-7 h-7 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold font-mono tracking-tight">Homelab Commander</h1>
                <p className="text-xs text-muted-foreground">Docker Management Dashboard</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {currentSettings.globalUpdateFreeze && (
                <Badge variant="destructive" className="gap-1 px-3 animate-pulse">
                  <Snowflake className="w-3.5 h-3.5" />
                  UPDATE FREEZE
                </Badge>
              )}
              {autoUpdateEnabled && !currentSettings.globalUpdateFreeze && (
                <Badge variant="secondary" className="gap-1 px-3">
                  <CloudDownload className="w-3.5 h-3.5" />
                  Auto-Update ON
                </Badge>
              )}
              {containersWithUpdates > 0 && (
                <Badge variant="outline" className="border-warning text-warning gap-1">
                  <CloudDownload className="w-3.5 h-3.5" />
                  {containersWithUpdates} Updates
                </Badge>
              )}
              <Button variant="ghost" size="icon" onClick={() => setPortRegistryOpen(true)} title="Port Registry">
                <ListOrdered className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setSmartStartupOpen(true)} title="Smart Startup">
                <Zap className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setBackupManagementOpen(true)} title="Backup Management">
                <Save className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setNotificationServicesOpen(true)} title="Notifications">
                <Bell className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setMaintenanceOpen(true)} title="Maintenance">
                <Paintbrush className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} title="Settings">
                <Settings className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-8">
            <TabsTrigger value="dashboard" className="gap-2">
              <Home className="w-[18px] h-[18px]" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="stacks" className="gap-2">
              <Layers className="w-[18px] h-[18px]" />
              Stacks
              <span className="ml-1 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-mono">
                {stacks.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="containers" className="gap-2">
              <Box className="w-[18px] h-[18px]" />
              Containers
              <span className="ml-1 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-mono">
                {systemStats.containers.total}
              </span>
            </TabsTrigger>
            <TabsTrigger value="volumes" className="gap-2">
              <HardDrive className="w-[18px] h-[18px]" />
              Volumes
            </TabsTrigger>
            <TabsTrigger value="images" className="gap-2">
              <ImageIcon className="w-[18px] h-[18px]" />
              Images
            </TabsTrigger>
            <TabsTrigger value="networks" className="gap-2">
              <Network className="w-[18px] h-[18px]" />
              Networks
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-4 font-mono">Resource Usage</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MetricCard
                  label="CPU Usage"
                  value={`${systemStats.cpuUsage.toFixed(1)}%`}
                  icon={<TrendingUp className="w-6 h-6" />}
                />
                <MetricCard
                  label="Memory"
                  value={`${systemStats.memoryUsage.toFixed(1)}%`}
                  icon={<TrendingUp className="w-6 h-6" />}
                />
                <MetricCard
                  label="Disk"
                  value={`${systemStats.diskUsage.toFixed(1)}%`}
                  icon={<TrendingUp className="w-6 h-6" />}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h2 className="text-xl font-semibold mb-4 font-mono">System Overview</h2>
                <div className="grid grid-cols-2 gap-4">
                  <MetricCard
                    label="Containers"
                    value={systemStats.containers.total}
                    icon={<Box className="w-6 h-6" />}
                    pulse={systemStats.containers.running > 0}
                  />
                  <MetricCard
                    label="Running"
                    value={systemStats.containers.running}
                    icon={<TrendingUp className="w-6 h-6" />}
                    className="border-l-4 border-l-success"
                  />
                  <MetricCard
                    label="Images"
                    value={images.length}
                    icon={<ImageIcon className="w-6 h-6" />}
                  />
                  <MetricCard
                    label="Volumes"
                    value={volumes.length}
                    icon={<HardDrive className="w-6 h-6" />}
                  />
                </div>
              </div>

              <div>
                <AggregatedLogs logs={logs} />
              </div>
            </div>
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
                  onTag={() => toast.info(`Tag image ${image.repository}`)}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="stacks" className="space-y-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold font-mono">Docker Compose Stacks</h2>
                <p className="text-sm text-muted-foreground mt-1">Deploy and manage multi-container applications</p>
              </div>
              <Button onClick={() => setNewStackOpen(true)}>
                <Plus className="w-5 h-5 mr-2" />
                New Stack
              </Button>
            </div>
            <StacksList
              stacks={stacks}
              selectedStack={selectedStackForView}
              onSelectStack={setSelectedStackForView}
              onStart={(id) => {
                deployStack.mutate(id, {
                  onSuccess: () => toast.success('Stack started'),
                  onError: () => toast.error('Failed to start stack')
                })
              }}
              onStop={(id) => {
                stopStack.mutate(id, {
                  onSuccess: () => toast.success('Stack stopped'),
                  onError: () => toast.error('Failed to stop stack')
                })
              }}
              onRestart={(id) => {
                restartStack.mutate(id, {
                  onSuccess: () => toast.success('Stack restarted'),
                  onError: () => toast.error('Failed to restart stack')
                })
              }}
              onEdit={handleStackEdit}
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
        onPurgeUnusedImages={handlePurgeImages}
        onPruneSystems={handlePruneSystems}
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

      <NewStackDialog
        open={newStackOpen}
        onOpenChange={setNewStackOpen}
        stacksBasePath={currentSettings.stacksBasePath || '/opt/stacks'}
        volumesBasePath={currentSettings.volumesBasePath || '/mnt/docker-volumes'}
        onSave={handleNewStackSave}
        allStacks={stacks}
        allContainers={containers}
      />

      <EnhancedStackEditorDialog
        open={stackEditorOpen}
        onOpenChange={setStackEditorOpen}
        stack={selectedStackForEdit}
        stacksBasePath={currentSettings.stacksBasePath || '/opt/stacks'}
        volumesBasePath={currentSettings.volumesBasePath || '/mnt/docker-volumes'}
        onSave={handleStackSave}
        allStacks={stacks}
        allContainers={containers}
      />

      <BackupManagementDialog
        open={backupManagementOpen}
        onOpenChange={setBackupManagementOpen}
        stacks={stacks}
        onUpdateStack={() => {}}
        backupsBasePath={currentSettings.backupsBasePath || '/mnt/backups'}
        onUpdateBackupsPath={(path) => {
          updateSettings.mutate({ ...currentSettings, backupsBasePath: path })
        }}
      />

      <SmartStartupDialog
        open={smartStartupOpen}
        onOpenChange={setSmartStartupOpen}
        stacks={stacks}
        containers={containers}
        onUpdateStack={() => {}}
        onUpdateContainer={() => {}}
      />

      <PortRegistryDialog
        open={portRegistryOpen}
        onOpenChange={setPortRegistryOpen}
        containers={containers}
        stacks={stacks}
      />
    </div>
  )
}

export default App
