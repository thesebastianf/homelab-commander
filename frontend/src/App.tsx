import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Toaster } from '@/components/ui/sonner'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { NotificationLogDialog } from '@/components/NotificationLogDialog'
import { StacksEditor } from '@/components/StacksEditor'
import { BackupManagementDialog } from '@/components/BackupManagementDialog'
import { SmartStartupDialog } from '@/components/SmartStartupDialog'
import { PortRegistryDialog } from '@/components/PortRegistryDialog'
import { CreateNetworkDialog } from '@/components/CreateNetworkDialog'
import { DatabaseExplorer } from '@/components/DatabaseExplorer'
import { ContainerShellDialog } from '@/components/ContainerShellDialog'
import { ClockWidget } from '@/components/ClockWidget'
import { Loader2, RefreshCw, Maximize2, Minimize2, Menu, Sun, Moon, Copy, Download } from 'lucide-react'
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
  StopCircle,
  CircleHelp,
  Plus,
} from 'lucide-react'
import { useContainers, useStartContainer, useStopContainer, useRestartContainer, useRemoveContainer, useAggregatedLogs } from '@/hooks/useContainers'
import { useImages } from '@/hooks/useImages'
import { useStacks, useExternalStacks, useOrphanStacks, useDeployStack, useStopStack, useRestartStack, useUpdateStack, useDeactivateStack, useRecreateStack } from '@/hooks/useStacks'
import { useVolumes } from '@/hooks/useVolumes'
import { useNetworks, useRemoveNetwork } from '@/hooks/useNetworks'
import { useSettings, useSystemInfo, useUpdateSettings, usePruneSystem } from '@/hooks/useSettings'
import { useIsMobile } from '@/hooks/use-mobile'
import type { Stack, AppSettings, OrphanStack } from '@/lib/types'
import { clearStoredCredentials, getStoredCredentials } from '@/lib/api'
import * as api from '@/lib/api'
import { toast } from 'sonner'

const APP_TABS = ['dashboard', 'stacks', 'containers', 'volumes', 'images', 'networks'] as const
type AppTab = (typeof APP_TABS)[number]

function isAppTab(value: string | null): value is AppTab {
  return !!value && APP_TABS.includes(value as AppTab)
}

const defaultSettings: AppSettings = {
  theme: 'dark',
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
      autoUpdateSkippedFrozen: true,
      containerStarted: false,
      containerStopped: false,
      stackDeployed: true,
      stackFailed: true,
      backupCompleted: true,
      backupFailed: true,
      smartStartupDeviceOnline: false,
      smartStartupStackStarted: true,
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
  const orphanStacksQuery = useOrphanStacks()
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
  const deactivateStack = useDeactivateStack()
  const recreateStack = useRecreateStack()
  const updateStack = useUpdateStack()
  const removeNetwork = useRemoveNetwork()
  const updateSettings = useUpdateSettings()
  const pruneSystem = usePruneSystem()

  // State hooks - MUST BE HERE BEFORE EARLY RETURN
  const isViewportMobile = useIsMobile()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<AppTab>(() => {
    const params = new URLSearchParams(window.location.search)
    const tabParam = params.get('tab')
    return isAppTab(tabParam) ? tabParam : 'dashboard'
  })
  const [mobileOverride, setMobileOverride] = useState<boolean | null>(() => {
    const params = new URLSearchParams(window.location.search)
    const mobileParam = params.get('mobile')
    if (mobileParam === '1' || mobileParam === 'true') return true
    if (mobileParam === '0' || mobileParam === 'false') return false
    return null
  })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [databaseExplorerOpen, setDatabaseExplorerOpen] = useState(false)
  const [maintenanceOpen, setMaintenanceOpen] = useState(false)
  const [notificationLogOpen, setNotificationLogOpen] = useState(false)
  const [backupManagementOpen, setBackupManagementOpen] = useState(false)
  const [smartStartupOpen, setSmartStartupOpen] = useState(false)
  const [portRegistryOpen, setPortRegistryOpen] = useState(false)
  const [createNetworkOpen, setCreateNetworkOpen] = useState(false)

  // Inspect / logs dialog state
  const [inspectVolumeName, setInspectVolumeName] = useState<string | null>(null)
  const [inspectVolumeData, setInspectVolumeData] = useState<any>(null)
  const [inspectVolumeLoading, setInspectVolumeLoading] = useState(false)
  const [inspectNetworkId, setInspectNetworkId] = useState<string | null>(null)
  const [inspectNetworkData, setInspectNetworkData] = useState<any>(null)
  const [inspectNetworkLoading, setInspectNetworkLoading] = useState(false)
  const [logsContainerId, setLogsContainerId] = useState<string | null>(null)
  const [logsData, setLogsData] = useState<string>('')
  const [logsLoading, setLogsLoading] = useState(false)
  const [shellContainerId, setShellContainerId] = useState<string | null>(null)

  // Extract data from queries
  const containers = containersQuery.data ?? []
  const images = imagesQuery.data ?? []
  const stacks = stacksQuery.data ?? []
  const externalStacks = externalStacksQuery.data ?? []
  const orphanStacks: OrphanStack[] = orphanStacksQuery.data ?? []
  const volumes = volumesQuery.data ?? []
  const networks = networksQuery.data ?? []
  const settings = settingsQuery.data
  const systemInfo = systemInfoQuery.data
  const aggregatedLogs = aggregatedLogsQuery.data ?? []
  const compactMode = mobileOverride ?? isViewportMobile

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

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentSettings.theme || 'dark')
  }, [currentSettings.theme])

  useEffect(() => {
    if (!compactMode) return
    if (activeTab !== 'dashboard' && activeTab !== 'stacks') {
      setActiveTab('dashboard')
    }
  }, [compactMode, activeTab])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    params.set('tab', activeTab)
    if (mobileOverride === null) {
      params.delete('mobile')
    } else {
      params.set('mobile', mobileOverride ? '1' : '0')
    }
    const query = params.toString()
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}`
    window.history.replaceState(null, '', nextUrl)
  }, [activeTab, mobileOverride])

  // Show loading screen while initial data is being fetched
  const isLoading = containersQuery.isPending || imagesQuery.isPending || stacksQuery.isPending

  if (isLoading) {
    return <LoadingScreen />
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
      onSuccess: () => { toast.success('Container started'); stacksQuery.refetch() },
      onError: () => toast.error('Failed to start container')
    })
  }

  const handleStopContainer = (id: string) => {
    stopContainer.mutate(id, {
      onSuccess: () => { toast.success('Container stopped'); stacksQuery.refetch() },
      onError: () => toast.error('Failed to stop container')
    })
  }

  const handleRestartContainer = (id: string) => {
    restartContainer.mutate(id, {
      onSuccess: () => { toast.success('Container restarted'); stacksQuery.refetch() },
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
      onSuccess: () => { toast.success('Container removed'); stacksQuery.refetch() },
      onError: () => toast.error('Failed to remove container')
    })
  }

  const handleViewLogs = async (id: string) => {
    const container = containers.find(c => c.id === id)
    setLogsContainerId(id)
    setLogsData('')
    setLogsLoading(true)
    try {
      const logs = await api.fetchContainerLogs(id, 300)
      setLogsData(logs)
    } catch (e: any) {
      toast.error(`Failed to fetch logs: ${e.message}`)
      setLogsContainerId(null)
    } finally {
      setLogsLoading(false)
    }
    if (!container?.name) return
  }

  const handleOpenTerminal = (id: string) => {
    const container = containers.find(c => c.id === id)
    if (container?.status !== 'running') {
      toast.error('Container must be running to access terminal')
      return
    }
    setShellContainerId(id)
    toast.info(`Opening terminal for ${container?.name}`)
  }

  const handleVolumeInspect = async (name: string) => {
    setInspectVolumeName(name)
    setInspectVolumeData(null)
    setInspectVolumeLoading(true)
    try {
      const data = await api.inspectVolume(name)
      setInspectVolumeData(data)
    } catch (e: any) {
      toast.error(`Inspect failed: ${e.message}`)
      setInspectVolumeName(null)
    } finally {
      setInspectVolumeLoading(false)
    }
  }

  const handleNetworkInspect = async (id: string) => {
    const network = networks.find(n => n.id === id)
    setInspectNetworkId(id)
    setInspectNetworkData(null)
    setInspectNetworkLoading(true)
    try {
      const data = await api.inspectNetwork(id)
      setInspectNetworkData(data)
    } catch (e: any) {
      toast.error(`Inspect failed: ${e.message}`)
      setInspectNetworkId(null)
    } finally {
      setInspectNetworkLoading(false)
    }
    if (!network?.name) return
  }

  const handlePurgeImages = async () => { await pruneSystem.mutateAsync(); }
  const handlePruneSystems = async () => { await pruneSystem.mutateAsync(); }
  const handleTabChange = (value: string) => {
    if (isAppTab(value)) setActiveTab(value)
  }

  const containersWithUpdates = containers.filter(c => c.updateAvailable).length
  const autoUpdateEnabled = currentSettings.autoUpdate
  const visibleNetworks = networks.filter(network => {
    const name = String(network.name || '').trim().toLowerCase()
    return name.length > 0 && name !== 'none'
  })
  const centralNetworks = visibleNetworks.filter(network => network.isManuallyCreated)
  const systemNetworks = visibleNetworks.filter(network => ['bridge', 'host', 'ingress'].includes(String(network.name).toLowerCase()))
  const stackNetworks = visibleNetworks.filter(network => !network.isManuallyCreated && !['bridge', 'host', 'ingress'].includes(String(network.name).toLowerCase()))

  const filteredContainers = containers.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.image.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleRemoveNetwork = (id: string) => {
    const network = networks.find(n => n.id === id)
    removeNetwork.mutate(id, {
      onSuccess: () => {
        toast.success(`Removed network ${network?.name ?? id}`)
      },
      onError: (error: Error) => {
        toast.error(error.message || 'Failed to remove network')
      },
    })
  }

  const isLightTheme = (currentSettings.theme || 'dark') === 'light'
  const toggleTheme = () => {
    const next = isLightTheme ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', next)
    updateSettings.mutate({ ...currentSettings, theme: next })
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-right" richColors />
      <header className="border-b sticky top-0 z-50 glass">
        <div className={compactMode ? 'px-3 sm:px-4 py-2.5' : 'px-4 lg:px-6 py-3'}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={cn(
                "relative shrink-0 flex items-center justify-center",
                compactMode ? 'h-9 w-9' : 'h-11 w-11 lg:h-12 lg:w-12'
              )}>
                <img src="/thc_small_.png" alt="THC Logo" className="h-full w-full object-contain" />
              </div>
              {!compactMode ? (
                <div className="min-w-0">
                  <h1 className="text-lg lg:text-2xl font-bold tracking-tight leading-none">
                    <span className="brand-grad-text">THC</span>
                    <span className="text-foreground/80 font-medium ml-2 text-sm lg:text-base align-middle">/ Homelab Commander</span>
                  </h1>
                  <p className="hidden md:block text-[11px] text-muted-foreground truncate mt-1 tracking-wide uppercase">
                    Highly addictive · self-hosted control plane
                  </p>
                </div>
              ) : (
                <h1 className="text-base font-bold tracking-tight">
                  <span className="brand-grad-text">THC</span>
                </h1>
              )}
            </div>

            {compactMode ? (
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Compact: status pills wrapped, then hamburger */}
                {currentSettings.globalUpdateFreeze && (
                  <Badge variant="destructive" className="gap-1 px-2 h-7 animate-pulse">
                    <Snowflake className="w-3 h-3" />
                    <span className="hidden xs:inline text-[10px]">FREEZE</span>
                  </Badge>
                )}
                {containersWithUpdates > 0 && (
                  <Badge variant="outline" className="border-warning text-warning gap-1 h-7 font-mono text-xs">
                    <CloudDownload className="w-3 h-3" />
                    {containersWithUpdates}
                  </Badge>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 w-9 p-0" aria-label="Menu">
                      <Menu className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel className="text-xs">Actions</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => setPortRegistryOpen(true)}>
                      <ListOrdered className="w-4 h-4" /> Ports
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSmartStartupOpen(true)}>
                      <Zap className="w-4 h-4" /> Smart Startup
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setBackupManagementOpen(true)}>
                      <Save className="w-4 h-4" /> Backups
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setNotificationLogOpen(true)}>
                      <Bell className="w-4 h-4" /> Alerts
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setMaintenanceOpen(true)}>
                      <Paintbrush className="w-4 h-4" /> Cleanup
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setDatabaseExplorerOpen(true)}>
                      <Database className="w-4 h-4" /> Database
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                      <Settings className="w-4 h-4" /> Settings
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setManualOpen(true)}>
                      <CircleHelp className="w-4 h-4" /> Help
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={toggleTheme}>
                      {isLightTheme ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                      {isLightTheme ? 'Dark theme' : 'Light theme'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setMobileOverride(false)}>
                      <Maximize2 className="w-4 h-4" /> Switch to full UI
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <>
                {/* Right-aligned cluster: clock | status pills | toggles | Tools */}
                <div className="ml-auto flex items-center gap-2 shrink-0">
                  {/* Clock + timezone — desktop only */}
                  <div className="hidden xl:block">
                    <ClockWidget />
                  </div>

                  {/* Status pills (hidden on small viewports) */}
                  <div className="hidden md:flex items-center gap-2">
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

                  {/* Theme + compact toggles */}
                  <div className="hidden md:flex items-center gap-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9 w-9 p-0"
                            onClick={toggleTheme}
                            aria-label="Toggle light/dark theme"
                          >
                            {isLightTheme ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">{isLightTheme ? 'Switch to dark theme' : 'Switch to light theme'}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9 w-9 p-0"
                            onClick={() => setMobileOverride(true)}
                            aria-label="Switch to compact UI"
                          >
                            <Minimize2 className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">Switch to compact UI</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>

                  {/* Action buttons consolidated into a single Tools dropdown */}
                  <div className="hidden md:flex items-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 gap-2 px-3"
                          aria-label="Tools"
                        >
                          <Menu className="w-4 h-4" />
                          <span className="text-xs font-medium tracking-wide">Tools</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel className="text-xs">Actions</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => setPortRegistryOpen(true)}>
                          <ListOrdered className="w-4 h-4" /> Ports
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setSmartStartupOpen(true)}>
                          <Zap className="w-4 h-4" /> Smart Startup
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setBackupManagementOpen(true)}>
                          <Save className="w-4 h-4" /> Backups
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setNotificationLogOpen(true)}>
                          <Bell className="w-4 h-4" /> Alerts
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setMaintenanceOpen(true)}>
                          <Paintbrush className="w-4 h-4" /> Cleanup
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setDatabaseExplorerOpen(true)}>
                          <Database className="w-4 h-4" /> Database
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                          <Settings className="w-4 h-4" /> Settings
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setManualOpen(true)}>
                          <CircleHelp className="w-4 h-4" /> Help
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Mobile-side hamburger when full mode is active on small viewport */}
                <div className="flex md:hidden items-center gap-1.5 shrink-0">
                  {containersWithUpdates > 0 && (
                    <Badge variant="outline" className="border-warning text-warning gap-1 h-7 font-mono text-xs">
                      <CloudDownload className="w-3 h-3" />
                      {containersWithUpdates}
                    </Badge>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-9 w-9 p-0" aria-label="Menu">
                        <Menu className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel className="text-xs">Actions</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => setPortRegistryOpen(true)}>
                        <ListOrdered className="w-4 h-4" /> Ports
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setSmartStartupOpen(true)}>
                        <Zap className="w-4 h-4" /> Smart Startup
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setBackupManagementOpen(true)}>
                        <Save className="w-4 h-4" /> Backups
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setNotificationLogOpen(true)}>
                        <Bell className="w-4 h-4" /> Alerts
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setMaintenanceOpen(true)}>
                        <Paintbrush className="w-4 h-4" /> Cleanup
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDatabaseExplorerOpen(true)}>
                        <Database className="w-4 h-4" /> Database
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                        <Settings className="w-4 h-4" /> Settings
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setManualOpen(true)}>
                        <CircleHelp className="w-4 h-4" /> Help
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={toggleTheme}>
                        {isLightTheme ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                        {isLightTheme ? 'Dark theme' : 'Light theme'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setMobileOverride(true)}>
                        <Minimize2 className="w-4 h-4" /> Switch to compact UI
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className={compactMode ? 'px-3 sm:px-4 py-3' : 'px-4 lg:px-6 py-4 lg:py-6'}>
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList
            className={cn(
              "card-surface !bg-transparent backdrop-blur-sm rounded-md",
              compactMode
                ? 'mb-3 w-full overflow-x-auto no-scrollbar flex justify-start gap-1 h-auto p-1'
                : 'mb-4 lg:mb-6 w-full md:w-auto overflow-x-auto no-scrollbar flex md:inline-flex justify-start gap-1 p-1.5'
            )}
          >
            <TabsTrigger value="dashboard" className="gap-2 shrink-0">
              <Home className="w-4 h-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="stacks" className="gap-2 shrink-0">
              <Layers className="w-4 h-4" />
              Stacks
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-mono">
                {stacks.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="containers" className="gap-2 shrink-0">
              <Box className="w-4 h-4" />
              Containers
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-mono">
                {systemStats.containers.total}
              </span>
            </TabsTrigger>
            <TabsTrigger value="volumes" className="gap-2 shrink-0">
              <HardDrive className="w-4 h-4" />
              Volumes
            </TabsTrigger>
            <TabsTrigger value="images" className="gap-2 shrink-0">
              <ImageIcon className="w-4 h-4" />
              Images
            </TabsTrigger>
            <TabsTrigger value="networks" className="gap-2 shrink-0">
              <Network className="w-4 h-4" />
              Networks
            </TabsTrigger>
          </TabsList>

          {/* ═══ DASHBOARD ═══ */}
          <TabsContent value="dashboard" className="space-y-4">

            {/* Row 1: Resource Usage — 6 compact cards with inline warnings */}
            {(() => {
              const NETWORK_WARN = currentSettings.warningThresholds?.networkWarn ?? 25
              const DISK_WARN = currentSettings.warningThresholds?.diskWarn ?? 90
              const ZOMBIE_WARN = currentSettings.warningThresholds?.zombieWarn ?? 5
              const CPU_WARN = currentSettings.warningThresholds?.cpuWarn ?? 85
              const MEM_WARN = currentSettings.warningThresholds?.memoryWarn ?? 85
              const stoppedCount = containers.filter(c => c.status !== 'running').length
              return (
                <>
                  <div>
                    <p className="text-xs font-mono text-muted-foreground font-semibold tracking-widest mb-2 uppercase">Resource Usage</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                      <MetricCard
                        label="CPU"
                        value={`${systemStats.cpuUsage.toFixed(1)}%`}
                        icon={<Cpu className="w-5 h-5" />}
                        compact
                        warning={systemStats.cpuUsage > CPU_WARN}
                        warningText={`>{CPU_WARN}%`}
                        actionLabel="Cleanup"
                        onAction={() => setMaintenanceOpen(true)}
                      />
                      <MetricCard
                        label="Memory"
                        value={`${systemStats.memoryUsage.toFixed(1)}%`}
                        icon={<MemoryStick className="w-5 h-5" />}
                        compact
                        warning={systemStats.memoryUsage > MEM_WARN}
                        warningText={`>${MEM_WARN}%`}
                        actionLabel="Cleanup"
                        onAction={() => setMaintenanceOpen(true)}
                      />
                      <MetricCard
                        label="Disk"
                        value={`${systemStats.diskUsage.toFixed(1)}%`}
                        icon={<Database className="w-5 h-5" />}
                        compact
                        warning={systemStats.diskUsage > DISK_WARN}
                        warningText={`>${DISK_WARN}%`}
                        actionLabel="Prune"
                        onAction={() => setMaintenanceOpen(true)}
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
                        warning={networks.length > NETWORK_WARN}
                        warningText={`>${NETWORK_WARN} pool`}
                        actionLabel="Prune"
                        onAction={() => setMaintenanceOpen(true)}
                      />
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-mono text-muted-foreground font-semibold tracking-widest mb-2 uppercase">System Overview</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
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
                        warning={stoppedCount > ZOMBIE_WARN}
                        warningText={`>${ZOMBIE_WARN} stopped`}
                        actionLabel="Prune"
                        onAction={() => setMaintenanceOpen(true)}
                        className={!stoppedCount ? "" : stoppedCount > ZOMBIE_WARN ? "" : "border-l-4 border-l-destructive"}
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
                </>
              )
            })()}

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
              orphanStacks={orphanStacks}
              containers={containers}
              forcedMobileMode={compactMode}
              onExitForcedMobileMode={() => setMobileOverride(false)}
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
              onDeactivateStack={(id) => {
                deactivateStack.mutate(id, {
                  onSuccess: () => toast.success('Stack deactivated'),
                  onError: () => toast.error('Failed to deactivate stack')
                })
              }}
              onRecreateStack={(id) => {
                recreateStack.mutate(id, {
                  onSuccess: () => toast.success('Stack recreated'),
                  onError: () => toast.error('Failed to recreate stack')
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
                  onInspect={() => handleVolumeInspect(volume.name)}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="networks" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold font-mono">Docker Networks</h2>
                <p className="text-sm text-muted-foreground mt-1">Central shared networks, stack-created networks, and Docker system networks</p>
              </div>
              <Button
                variant="default"
                size="sm"
                onClick={() => setCreateNetworkOpen(true)}
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                Create Network
              </Button>
            </div>
            <div className="grid gap-4">
              {visibleNetworks.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Network className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No networks found</p>
                </div>
              ) : (
                <>
                  {centralNetworks.length > 0 && (
                    <div className="space-y-2">
                      <div>
                        <h3 className="font-mono text-sm font-semibold">Central Networks</h3>
                        <p className="text-xs text-muted-foreground">Manually created shared networks intended for reuse across stacks.</p>
                      </div>
                      {centralNetworks.map(network => (
                        <NetworkCard
                          key={network.id}
                          network={network}
                          onRemove={handleRemoveNetwork}
                          onInspect={() => handleNetworkInspect(network.id)}
                        />
                      ))}
                    </div>
                  )}

                  {stackNetworks.length > 0 && (
                    <div className="space-y-2">
                      <div>
                        <h3 className="font-mono text-sm font-semibold">Stack Networks</h3>
                        <p className="text-xs text-muted-foreground">Networks discovered from compose projects and running stacks.</p>
                      </div>
                      {stackNetworks.map(network => (
                        <NetworkCard
                          key={network.id}
                          network={network}
                          onRemove={handleRemoveNetwork}
                          onInspect={() => handleNetworkInspect(network.id)}
                        />
                      ))}
                    </div>
                  )}

                  {systemNetworks.length > 0 && (
                    <div className="space-y-2">
                      <div>
                        <h3 className="font-mono text-sm font-semibold">System Networks</h3>
                        <p className="text-xs text-muted-foreground">Docker-managed internal networks. These are shown for visibility and are not intended for manual cleanup here.</p>
                      </div>
                      {systemNetworks.map(network => (
                        <NetworkCard
                          key={network.id}
                          network={network}
                          onRemove={handleRemoveNetwork}
                          onInspect={() => handleNetworkInspect(network.id)}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>

        </Tabs>
      </main>

      <Dialog open={databaseExplorerOpen} onOpenChange={setDatabaseExplorerOpen}>
        <DialogContent className="w-[92vw] sm:max-w-7xl h-[92vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Database</DialogTitle>
            <DialogDescription>
              Explore tables and run read-only SQL queries against the configured PostgreSQL database.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-hidden">
            <DatabaseExplorer />
          </div>
        </DialogContent>
      </Dialog>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={currentSettings}
        onSave={async (s) => {
          try {
            await updateSettings.mutateAsync(s)
            toast.success('Settings saved!')
          } catch (err: any) {
            toast.error(`Failed to save settings: ${err.message || 'Unknown error'}`)
            throw err
          }
        }}
      />

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="w-[94vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Homelab Commander Manual</DialogTitle>
            <DialogDescription>
              Quick guide for core workflows, defaults, and important behavior.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            <div className="rounded-lg border p-3 space-y-1.5">
              <h4 className="font-mono font-semibold">Getting Started</h4>
              <p className="text-muted-foreground">Use Stacks to create, edit, deploy, stop, and inspect your compose projects. Dashboard shows health and warnings at a glance.</p>
              <p className="text-muted-foreground">Use the top action row for Ports, Startup, Backup, Alerts, Cleanup, Database, and Settings.</p>
            </div>

            <div className="rounded-lg border p-3 space-y-1.5">
              <h4 className="font-mono font-semibold">Auto-Update Defaults</h4>
              <p className="text-muted-foreground">Default schedule is <span className="font-mono">0 7 * * 6</span> (Saturday 07:00).</p>
              <p className="text-muted-foreground">Global Update Freeze always overrides scheduled and per-stack updates.</p>
            </div>

            <div className="rounded-lg border p-3 space-y-1.5">
              <h4 className="font-mono font-semibold">Backup Defaults</h4>
              <p className="text-muted-foreground">Default backup schedule is <span className="font-mono">0 22 * * 3</span> (Wednesday 22:00) with simple retention of last 7 backups.</p>
              <p className="text-muted-foreground">Full stack folder and volumes are enabled by default; database dumps are optional per stack.</p>
              <p className="text-muted-foreground">Encryption and incremental flags are stored for future compatibility and currently not executed by the backup engine.</p>
            </div>

            <div className="rounded-lg border p-3 space-y-1.5">
              <h4 className="font-mono font-semibold">Port Conflict Checks</h4>
              <p className="text-muted-foreground">During create/edit, THC compares declared host ports against all other stacks and highlights collisions.</p>
              <p className="text-muted-foreground">Well-known system ports are flagged as warnings so you can avoid accidental collisions.</p>
            </div>

            <div className="rounded-lg border p-3 space-y-1.5">
              <h4 className="font-mono font-semibold">Maintenance</h4>
              <p className="text-muted-foreground">System Maintenance lets you prune unused images, volumes, networks, and stopped containers.</p>
              <p className="text-muted-foreground">Full System Prune is irreversible. Running containers are not removed.</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <MaintenanceDialog
        open={maintenanceOpen}
        onOpenChange={setMaintenanceOpen}
      />

      <NotificationLogDialog
        open={notificationLogOpen}
        onOpenChange={setNotificationLogOpen}
      />

      <BackupManagementDialog
        open={backupManagementOpen}
        onOpenChange={setBackupManagementOpen}
        stacks={stacks}
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

      <CreateNetworkDialog
        open={createNetworkOpen}
        onOpenChange={setCreateNetworkOpen}
      />

      {/* Container Logs Dialog */}
      <Dialog open={logsContainerId !== null} onOpenChange={open => { if (!open) { setLogsContainerId(null); setLogsData('') } }}>
        <DialogContent className="w-[94vw] max-w-6xl h-[86vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">
              Logs — {containers.find(c => c.id === logsContainerId)?.name}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Last 300 lines · docker logs --tail 300 {containers.find(c => c.id === logsContainerId)?.name}
            </DialogDescription>
          </DialogHeader>
          {logsLoading ? (
            <div className="flex-1 flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="flex justify-end gap-2 mb-1">
                <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={() => {
                  if (!logsData) return
                  navigator.clipboard.writeText(logsData).then(() => toast.success('Logs copied to clipboard'))
                }}>
                  <Copy className="w-3 h-3" /> Copy
                </Button>
                <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={() => {
                  if (!logsData) return
                  const containerName = containers.find(c => c.id === logsContainerId)?.name ?? 'container'
                  const blob = new Blob([logsData], { type: 'text/plain' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `${containerName}-logs.txt`
                  a.click()
                  URL.revokeObjectURL(url)
                }}>
                  <Download className="w-3 h-3" /> Download
                </Button>
                <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={async () => {
                  if (!logsContainerId) return
                  setLogsLoading(true)
                  try { setLogsData(await api.fetchContainerLogs(logsContainerId, 300)) } finally { setLogsLoading(false) }
                }}>
                  <RefreshCw className="w-3 h-3" /> Refresh
                </Button>
              </div>
              <ScrollArea className="flex-1 rounded-lg border bg-black/80">
                <pre className="font-mono text-xs text-foreground/80 p-3 whitespace-pre-wrap break-all">{logsData || 'No log output.'}</pre>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Volume Inspect Dialog */}
      <Dialog open={inspectVolumeName !== null} onOpenChange={open => { if (!open) { setInspectVolumeName(null); setInspectVolumeData(null) } }}>
        <DialogContent className="w-[94vw] max-w-5xl h-[86vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">Volume Inspect — {inspectVolumeName}</DialogTitle>
            <DialogDescription className="text-xs">docker volume inspect {inspectVolumeName}</DialogDescription>
          </DialogHeader>
          {inspectVolumeLoading ? (
            <div className="flex-1 flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ScrollArea className="flex-1 rounded-lg border bg-black/80">
              <pre className="font-mono text-xs text-foreground/80 p-3 whitespace-pre-wrap">{JSON.stringify(inspectVolumeData, null, 2)}</pre>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {/* Network Inspect Dialog */}
      <Dialog open={inspectNetworkId !== null} onOpenChange={open => { if (!open) { setInspectNetworkId(null); setInspectNetworkData(null) } }}>
        <DialogContent className="w-[94vw] max-w-5xl h-[86vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">
              Network Inspect — {networks.find(n => n.id === inspectNetworkId)?.name}
            </DialogTitle>
            <DialogDescription className="text-xs">
              docker network inspect {networks.find(n => n.id === inspectNetworkId)?.name}
            </DialogDescription>
          </DialogHeader>
          {inspectNetworkLoading ? (
            <div className="flex-1 flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ScrollArea className="flex-1 rounded-lg border bg-black/80">
              <pre className="font-mono text-xs text-foreground/80 p-3 whitespace-pre-wrap">{JSON.stringify(inspectNetworkData, null, 2)}</pre>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      <ContainerShellDialog
        open={shellContainerId !== null}
        onOpenChange={(open) => { if (!open) setShellContainerId(null) }}
        containerId={shellContainerId || undefined}
        containerName={containers.find(c => c.id === shellContainerId)?.name}
        image={containers.find(c => c.id === shellContainerId)?.image}
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
  const [status, setStatus] = useState<AuthStatus>('checking')

  // Probe a real auth-protected endpoint ONCE on mount (not /healthz — that bypasses auth)
  useEffect(() => {
    let isMounted = true
    const creds = getStoredCredentials()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (creds) {
      headers.Authorization = `Basic ${creds}`
    }

    fetch('/api/settings', { headers })
      .then(r => {
        if (!isMounted) return
        if (r.status === 401) {
          clearStoredCredentials()
          setStatus('required')
          return
        }
        if (r.ok) {
          setStatus(creds ? 'authenticated' : 'open')
          return
        }
        setStatus('open')
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
