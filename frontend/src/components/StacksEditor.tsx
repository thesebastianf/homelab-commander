import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { YamlEditor } from '@/components/YamlEditor'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import * as YAML from 'js-yaml'
import * as diffLib from 'diff'
import { formatDistanceToNow } from 'date-fns'
import {
  Play,
  Square,
  RotateCw,
  FileCode,
  Plus,
  Save,
  Trash2,
  Copy,
  Diff,
  Terminal,
  AlertCircle,
  Search,
  X,
  GitBranch,
  Download,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  FileText,
  File,
  ExternalLink,
  HardDrive,
  Archive,
  RefreshCw,
  FileArchive,
  ShieldCheck,
  Zap,
  Clock,
  History,
  CheckCircle,
  XCircle,
  WandSparkles,
  Rocket,
  BookOpen,
  Clipboard,
  HardDriveDownload,
  FolderOpen,
  Folder,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import type { Stack, BackupConfig, OrphanStack } from '@/lib/types'
import { toast } from 'sonner'
import * as api from '@/lib/api'
import { useSettings } from '@/hooks/useSettings'
import { useNetworks } from '@/hooks/useNetworks'
import { ScheduleEditor } from '@/components/ScheduleEditor'
import { ComposeAiPanel } from '@/components/ComposeAiPanel'
import { ContainerShellDialog } from '@/components/ContainerShellDialog'
import { MobileStacksView } from '@/components/MobileStacksView'
import { useIsMobile } from '@/hooks/use-mobile'
import { toHumanCronLabel } from '@/lib/cron'

// -- FullBackupPanel - matches BackupManagementDialog options ----------------
interface FullBackupPanelProps {
  config: Partial<BackupConfig>
  onChange: (cfg: Partial<BackupConfig>) => void
  stackId?: string
  onSave?: () => void
  isSaving?: boolean
  onRunNow?: () => void
  isRunning?: boolean
}

function FullBackupPanel({ config: cfg, onChange: u, stackId, onSave, isSaving, onRunNow, isRunning }: FullBackupPanelProps) {
  const { data: backupVolumes = [] } = useQuery({
    queryKey: ['backupVolumes', stackId],
    queryFn: () => api.fetchBackupVolumes(stackId!),
    enabled: !!stackId,
  })
  const { data: backupDatabases = [] } = useQuery({
    queryKey: ['backupDatabases', stackId],
    queryFn: () => api.fetchBackupDatabases(stackId!),
    enabled: !!stackId,
  })
  const selectedVolumeNames = cfg.databaseConfig?.volumeNames || []
  const usingAllVolumes = selectedVolumeNames.length === 0
  const selectedDatabaseNames = cfg.databaseConfig?.databaseNames || []
  const usingAllDatabases = selectedDatabaseNames.length === 0

  const setVolumeSelection = (name: string, checked: boolean) => {
    const baseline = usingAllVolumes
      ? backupVolumes.map((entry) => entry.name)
      : [...selectedVolumeNames]
    const next = new Set(baseline)
    if (checked) {
      next.add(name)
    } else {
      next.delete(name)
    }
    u({
      ...cfg,
      includeVolumes: next.size > 0,
      databaseConfig: {
        ...cfg.databaseConfig,
        volumeNames: [...next],
      },
    })
  }

  const setDatabaseSelection = (key: string, checked: boolean) => {
    const toDbKey = (entry: { key?: string; name: string }) => entry.key || entry.name
    const baseline = usingAllDatabases
      ? backupDatabases.map((entry) => toDbKey(entry))
      : [...selectedDatabaseNames]
    const next = new Set(baseline)
    if (checked) {
      next.add(key)
    } else {
      next.delete(key)
    }
    u({
      ...cfg,
      includeDatabases: next.size > 0,
      databaseConfig: {
        ...cfg.databaseConfig,
        databaseNames: [...next],
      },
    })
  }

  // Detect new databases added after config was created
  const allDetectedDbNames = new Set(backupDatabases.map((db) => db.key || db.name))
  const configuredDbNames = new Set(selectedDatabaseNames)
  const newDatabaseCount = [...allDetectedDbNames].filter((name) => !configuredDbNames.has(name)).length
  const dbWarnings = backupDatabases.filter((entry) => !!entry.warning)

  // Detect new volumes added after config was created
  const allDetectedVolNames = new Set(backupVolumes.map((vol) => vol.name))
  const configuredVolNames = new Set(selectedVolumeNames)
  const newVolumeCount = [...allDetectedVolNames].filter((name) => !configuredVolNames.has(name)).length

  return (
    <div className="space-y-3">
      {/* Enable */}
      <div className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-muted/20">
        <div>
          <Label className="text-sm font-semibold">Enable Backups</Label>
          <p className="text-xs text-muted-foreground">Automated scheduled backups for this stack</p>
        </div>
        <Switch checked={cfg.enabled || false} onCheckedChange={v => u({ ...cfg, enabled: v })} />
      </div>

      {cfg.enabled && (
        <>
          {/* Schedule & Timing */}
          <Card className="p-3 space-y-3">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Schedule &amp; Timing</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Schedule</Label>
                <ScheduleEditor value={cfg.cronSchedule || '0 22 * * 3'} onChange={v => u({ ...cfg, cronSchedule: v })} />
              </div>
              {onRunNow && (
                <div className="flex items-end">
                  <Button size="sm" variant="outline" disabled={isRunning} onClick={onRunNow} className="gap-1">
                    {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                    Run Now
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {/* Retention Policy */}
          <Card className="p-3 space-y-3">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Retention Policy</Label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={!cfg.useAdvancedRetention} onCheckedChange={() => u({ ...cfg, useAdvancedRetention: false })} />
                <Label className="text-xs">Simple (keep last N)</Label>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={cfg.useAdvancedRetention || false} onCheckedChange={() => u({ ...cfg, useAdvancedRetention: true })} />
                <Label className="text-xs">Advanced</Label>
              </label>
            </div>
            {!cfg.useAdvancedRetention ? (
              <div className="space-y-1">
                <Label className="text-xs">Keep last backups</Label>
                <Input type="number" value={cfg.retentionDays ?? 7}
                  onChange={e => u({ ...cfg, retentionDays: Number(e.target.value) })}
                  className="h-8 text-xs font-mono w-24" min={1} max={5000} />
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: 'keepLast', label: 'keep-last', hint: 'Always keep the newest N snapshots', def: 10 },
                  { key: 'keepHourly', label: 'keep-hourly', hint: 'Keep one snapshot per hour for N hours', def: 24 },
                  { key: 'keepDaily', label: 'keep-daily', hint: 'Keep one snapshot per day for N days', def: 7 },
                  { key: 'keepWeekly', label: 'keep-weekly', hint: 'Keep one snapshot per week for N weeks', def: 4 },
                  { key: 'keepMonthly', label: 'keep-monthly', hint: 'Keep one snapshot per month for N months', def: 6 },
                  { key: 'keepYearly', label: 'keep-yearly', hint: 'Keep one snapshot per year for N years', def: 2 },
                ] as const).map(period => (
                  <div key={period.key} className="space-y-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Label className="text-xs cursor-help">{period.label}</Label>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">{period.hint}</TooltipContent>
                    </Tooltip>
                    <Input type="number"
                      value={cfg.retentionPolicy?.[period.key] ?? period.def}
                      onChange={e => u({ ...cfg, retentionPolicy: { keepLast: 10, keepHourly: 24, keepDaily: 7, keepWeekly: 4, keepMonthly: 6, keepYearly: 2, ...cfg.retentionPolicy, [period.key]: Number(e.target.value) } })}
                      className="h-8 text-xs font-mono" min={0} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Backup Contents */}
          <Card className="p-3 space-y-3">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Backup Contents</Label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={cfg.includeStackFolder ?? true} onCheckedChange={v => u({ ...cfg, includeStackFolder: !!v })} />
                <Label className="text-xs">Full stack folder</Label>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={cfg.includeVolumes ?? true} onCheckedChange={v => u({ ...cfg, includeVolumes: !!v })} />
                <Label className="text-xs">Docker volumes</Label>
              </label>
              {cfg.includeVolumes && (
                <div className="ml-5 mt-1 p-2 bg-muted/50 rounded space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Select Volumes</Label>
                    {newVolumeCount > 0 && (
                      <Badge className="text-[10px] bg-blue-500/20 text-blue-400 border-blue-500/30">
                        +{newVolumeCount} new
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={usingAllVolumes}
                      onCheckedChange={v => u({
                        ...cfg,
                        databaseConfig: {
                          ...cfg.databaseConfig,
                          volumeNames: v ? undefined : backupVolumes.map((entry) => entry.name),
                        },
                      })}
                    />
                    <Label className="text-xs">All attached Docker volumes</Label>
                  </div>
                  {!usingAllVolumes && backupVolumes.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {backupVolumes.map((entry) => (
                        <label key={entry.name} className="flex items-center gap-2 cursor-pointer text-xs">
                          <Checkbox
                            checked={selectedVolumeNames.includes(entry.name)}
                            onCheckedChange={checked => setVolumeSelection(entry.name, !!checked)}
                          />
                          <span className="font-mono truncate">{entry.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {stackId && backupVolumes.length === 0 && (
                    <p className="text-[11px] text-muted-foreground">No named volumes attached to this stack were detected.</p>
                  )}
                </div>
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={cfg.includeDatabases ?? false} onCheckedChange={v => u({ ...cfg, includeDatabases: !!v })} />
                <Label className="text-xs">Database dumps</Label>
              </label>
            </div>
            {cfg.includeDatabases && (
              <div className="ml-5 p-2 bg-muted/50 rounded space-y-2">
                <div className="space-y-1">
                  <Label className="text-xs">Database Type</Label>
                  <Select value={cfg.databaseType || 'auto'} onValueChange={v => u({ ...cfg, databaseType: v })}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto-detect stack databases</SelectItem>
                      <SelectItem value="postgresql">PostgreSQL</SelectItem>
                      <SelectItem value="mysql">MySQL / MariaDB</SelectItem>
                      <SelectItem value="mongodb">MongoDB</SelectItem>
                      <SelectItem value="redis">Redis</SelectItem>
                      <SelectItem value="influxdb">InfluxDB</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Select Databases</Label>
                    {newDatabaseCount > 0 && (
                      <Badge className="text-[10px] bg-blue-500/20 text-blue-400 border-blue-500/30">
                        +{newDatabaseCount} new
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={usingAllDatabases}
                      onCheckedChange={v => u({
                        ...cfg,
                        databaseConfig: {
                          ...cfg.databaseConfig,
                          databaseNames: v ? undefined : backupDatabases.map((entry) => entry.key || entry.name),
                        },
                      })}
                    />
                    <Label className="text-xs">All detected databases</Label>
                  </div>
                  {!usingAllDatabases && backupDatabases.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {backupDatabases.map((entry) => (
                        <label key={entry.key || entry.name} className="flex items-center gap-2 cursor-pointer text-xs">
                          <Checkbox
                            checked={selectedDatabaseNames.includes(entry.key || entry.name)}
                            onCheckedChange={checked => setDatabaseSelection(entry.key || entry.name, !!checked)}
                          />
                          <span className="font-mono truncate">{entry.name}</span>
                          <Badge className="text-[10px] bg-muted text-muted-foreground py-0 px-1 ml-auto shrink-0">
                            {entry.type}
                          </Badge>
                        </label>
                      ))}
                    </div>
                  )}
                  {dbWarnings.length > 0 && (
                    <div className="pt-1 text-[11px] text-amber-400">
                      {dbWarnings.map((entry) => (
                        <div key={`warn-${entry.key || entry.name}`}>{entry.warning}</div>
                      ))}
                    </div>
                  )}
                  {stackId && backupDatabases.length === 0 && (
                    <p className="text-[11px] text-amber-400">No compose-labeled databases detected in this stack. THC blocks loose container-name matching to prevent cross-stack backups.</p>
                  )}
                </div>
                <div className="pt-2 space-y-1 border-t border-muted">
                  <Label className="text-xs">Legacy Options (optional)</Label>
                  <Input value={cfg.databaseConfig?.containerName || ''}
                    onChange={e => u({ ...cfg, databaseConfig: { ...cfg.databaseConfig, containerName: e.target.value } })}
                    className="h-7 text-xs font-mono" placeholder="Container name (optional)" />
                  <Input value={cfg.databaseConfig?.databaseName || ''}
                    onChange={e => u({ ...cfg, databaseConfig: { ...cfg.databaseConfig, databaseName: e.target.value } })}
                    className="h-7 text-xs font-mono" placeholder="Database name (optional)" />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Volume backup covers all named volumes attached to running containers in this stack. Logical DB dumps are added when the database container supports them.
                </p>
              </div>
            )}
          </Card>

          {/* Advanced Options */}
          <Card className="p-3 space-y-3">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Advanced Options</Label>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileArchive className="w-3.5 h-3.5 text-muted-foreground" />
                  <Label className="text-xs">Compression Level (1-9)</Label>
                </div>
                <Input type="number" value={cfg.compressionLevel ?? 6}
                  onChange={e => u({ ...cfg, compressionLevel: Number(e.target.value) })}
                  className="h-7 text-xs font-mono w-16" min={1} max={9} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" />
                  <Label className="text-xs">Encrypt Backup</Label>
                </div>
                <Switch checked={cfg.encrypted ?? false} onCheckedChange={v => u({ ...cfg, encrypted: v })} disabled />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-3.5 h-3.5 text-muted-foreground" />
                  <Label className="text-xs">Incremental Backup</Label>
                </div>
                <Switch checked={cfg.incremental ?? false} onCheckedChange={v => u({ ...cfg, incremental: v })} disabled />
              </div>
              <p className="text-[11px] text-muted-foreground">Encryption and incremental mode are stored for future compatibility but are not executed by the backup engine yet.</p>
            </div>
          </Card>
        </>
      )}

      {onSave && (
        <Button size="sm" className="w-full gap-1.5" onClick={onSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
          Save Backup Config
        </Button>
      )}
    </div>
  )
}

// -- EditBackupPanel (wraps FullBackupPanel with live query) -----------------
function EditBackupPanel({ config, onSave, isSaving, stackId }: { config: BackupConfig; onSave: (cfg: Partial<BackupConfig>) => void; isSaving: boolean; stackId: string }) {
  const [local, setLocal] = useState<Partial<BackupConfig>>(config)
  const qc = useQueryClient()
  useEffect(() => { setLocal(config) }, [config])
  const runMutation = useMutation({
    mutationFn: () => api.runBackup(stackId),
    onSuccess: () => { toast.success('Backup started'); qc.invalidateQueries({ queryKey: ['backupJobs', stackId] }) },
    onError: (e: any) => toast.error(`Backup failed: ${e.message}`),
  })
  return (
    <FullBackupPanel
      config={local}
      onChange={setLocal}
      stackId={stackId}
      onSave={() => onSave(local)}
      isSaving={isSaving}
      onRunNow={() => runMutation.mutate()}
      isRunning={runMutation.isPending}
    />
  )
}

/** Flatten backend nested file tree into flat list with depth */
function flattenFileTree(nodes: any[], depth = 0): any[] {
  const result: any[] = []
  for (const node of nodes) {
    result.push({ ...node, depth })
    if (node.type === 'directory' && Array.isArray(node.children)) {
      result.push(...flattenFileTree(node.children, depth + 1))
    }
  }
  return result
}

function wildcardToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

function isFileExcluded(fileName: string, patterns: string[]): boolean {
  return patterns.some((pattern) => wildcardToRegex(pattern).test(fileName));
}

// ── WebSocket URL helper ──────────────────────────────────────────────────────
function wsUrl(path: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const creds = api.getStoredCredentials()
  const sep = path.includes('?') ? '&' : '?'
  const suffix = creds ? `${sep}auth=${encodeURIComponent(creds)}` : ''
  return `${proto}//${window.location.host}${path}${suffix}`
}

// ── WebSocket-based stack log aggregation hook ────────────────────────────────
interface LogLine { container: string; text: string; ts: number }

function useStackLogs(
  containerIds: Array<{ id: string; name: string }>,
  enabled: boolean
): LogLine[] {
  const [lines, setLines] = useState<LogLine[]>([])
  const wsRefs = useRef<WebSocket[]>([])
  // Stable key to detect when container list actually changes
  const key = containerIds.map(c => c.id).join(',')

  useEffect(() => {
    wsRefs.current.forEach(ws => { try { ws.close() } catch { /* ignore */ } })
    wsRefs.current = []

    if (!enabled || containerIds.length === 0) {
      setLines([])
      return
    }

    setLines([])

    const connections = containerIds.map(({ id, name }) => {
      const url = wsUrl(`/ws/logs/${encodeURIComponent(id)}`)
      const ws = new WebSocket(url)
      ws.onmessage = (event) => {
        const text = typeof event.data === 'string' ? event.data.trim() : ''
        if (!text) return
        setLines(prev => [...prev.slice(-800), { container: name, text, ts: Date.now() }])
      }
      ws.onerror = () => {
        setLines(prev => [...prev, { container: name, text: '⚠ WebSocket error', ts: Date.now() }])
      }
      return ws
    })

    wsRefs.current = connections
    return () => {
      connections.forEach(ws => { try { ws.close() } catch { /* ignore */ } })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key])

  return lines
}

interface StacksEditorProps {
  stacks: Stack[]
  externalStacks?: Stack[]
  orphanStacks?: OrphanStack[]
  containers: { id: string; name: string; stackId?: string; ports?: string[] }[]
  forcedMobileMode?: boolean
  onExitForcedMobileMode?: () => void
  onDeployStack: (id: string) => void
  onStopStack: (id: string) => void
  onRestartStack: (id: string) => void
  onDeactivateStack: (id: string) => void
  onRecreateStack: (id: string) => void
}

type SortedStackGroup = 'running' | 'stopped' | 'failed'

export function StacksEditor({
  stacks,
  externalStacks = [],
  orphanStacks = [],
  forcedMobileMode,
  onExitForcedMobileMode,
  onDeployStack,
  onStopStack,
  onRestartStack,
  onDeactivateStack,
  onRecreateStack,
}: StacksEditorProps) {
  // ── Core state ───────────────────────────────────────────────────────────
  const [selectedStack, setSelectedStack] = useState<Stack | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [newStackName, setNewStackName] = useState('')
  const [composeContent, setComposeContent] = useState('')
  const [envContent, setEnvContent] = useState('')
  const [customFileContent, setCustomFileContent] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [yamlError, setYamlError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showDeleteFinalConfirm, setShowDeleteFinalConfirm] = useState(false)
  const [showRestartAfterSaveConfirm, setShowRestartAfterSaveConfirm] = useState(false)
  const [shellTarget, setShellTarget] = useState<{ containerId: string; containerName: string; serviceName: string; image?: string } | null>(null)
  const promptRestartAfterSaveRef = useRef(false)
  // Two-panel state
  const [activeFile, setActiveFile] = useState<'compose' | 'env' | string>('compose')
  const [rightPanel, setRightPanel] = useState<'logs' | 'compare' | 'backup' | 'autoupdate' | 'ai' | 'conflicts' | 'reference' | 'helpers' | 'files'>('logs')
  const [compareVersion, setCompareVersion] = useState<number | null>(null)
  // Operation terminal
  const [isOperating, setIsOperating] = useState(false)
  const [operationDone, setOperationDone] = useState(false)
  const [currentOperation, setCurrentOperation] = useState('')
  const [operationError, setOperationError] = useState<string | null>(null)
  const logsViewportRef = useRef<HTMLDivElement>(null)
  const operationTerminalRef = useRef<HTMLDivElement>(null)
  // Create mode right panel
  const [createRightPanel, setCreateRightPanel] = useState<'conflicts' | 'reference' | 'helpers' | 'backup' | 'autoupdate' | 'ai'>('conflicts')
  const [refStackId, setRefStackId] = useState<string | null>(null)
  const [createBackupConfig, setCreateBackupConfig] = useState<Partial<BackupConfig>>({
    enabled: false, cronSchedule: '0 22 * * 3', retentionDays: 7,
    includeStackFolder: true, includeVolumes: true, includeDatabases: false, useAdvancedRetention: false,
  })
  const [mobileModeEnabled, setMobileModeEnabled] = useState(false)
  const isMobile = useIsMobile()
  const effectiveMobileMode = forcedMobileMode ?? (isMobile || mobileModeEnabled)
  const qc = useQueryClient()
  const { data: settings } = useSettings()
  const { data: networks = [] } = useNetworks()

  const reusableNetworkHelpers = networks
    .filter((network) => {
      const name = String(network.name || '').trim().toLowerCase()
      return name.length > 0 && !['bridge', 'host', 'none', 'ingress'].includes(name)
    })
    .map((network) => ({
      id: `network-${network.id}`,
      label: `${network.name} external network`,
      value: `networks:\n  ${network.name}:\n    external: true\n    name: ${network.name}`,
      meta: [network.driver, network.subnet].filter(Boolean).join(' • '),
      isManuallyCreated: network.isManuallyCreated === true,
    }))
  const manualNetworkHelpers = reusableNetworkHelpers.filter((network) => network.isManuallyCreated)
  const discoveredNetworkHelpers = reusableNetworkHelpers.filter((network) => !network.isManuallyCreated)

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: versions = [] } = useQuery({
    queryKey: ['stackVersions', selectedStack?.id],
    queryFn: () => api.fetchStackVersions(selectedStack!.id),
    enabled: !!selectedStack && !isCreating,
  })

  const { data: gitStatus } = useQuery({
    queryKey: ['gitStatus', selectedStack?.id],
    queryFn: () => api.fetchGitStatus(selectedStack!.id),
    enabled: !!selectedStack && !isCreating,
    refetchInterval: 30000,
  })

  const { data: stackContainers = [] } = useQuery({
    queryKey: ['stackContainers', selectedStack?.id],
    queryFn: () => api.fetchStackContainers(selectedStack!.id),
    enabled: !!selectedStack && !isCreating,
    refetchInterval: 8000,
  })

  const { data: operation } = useQuery({
    queryKey: ['stackOperation', selectedStack?.id],
    queryFn: () => api.fetchStackOperation(selectedStack!.id),
    enabled: !!selectedStack && isOperating,
    refetchInterval: 600,
  })

  const { data: stackFiles = [] } = useQuery({
    queryKey: ['stackFiles', selectedStack?.id],
    queryFn: () => api.fetchStackFiles(selectedStack!.id),
    enabled: !!selectedStack && !isCreating,
  })

  // Disk-sync awareness: poll every 30 s to detect external host file changes
  const [externalChangeDismissed, setExternalChangeDismissed] = useState(false)
  const { data: stackDetail } = useQuery({
    queryKey: ['stack-detail', selectedStack?.id],
    queryFn: () => api.fetchStack(selectedStack!.id),
    enabled: !!selectedStack && !isCreating,
    staleTime: 0,
    refetchInterval: 30000,
  })
  const syncFromDiskMutation = useMutation({
    mutationFn: () => api.syncStackFromDisk(selectedStack!.id),
    onSuccess: (data) => {
      toast.success('Synced from disk — DB updated to match host files')
      setComposeContent(data.compose)
      setEnvContent(data.env)
      setExternalChangeDismissed(true)
      setIsDirty(false)
      qc.invalidateQueries({ queryKey: ['stacks'] })
      qc.invalidateQueries({ queryKey: ['stack-detail', selectedStack?.id] })
    },
    onError: (e: any) => toast.error(`Sync failed: ${e.message}`),
  })
  const hostPathAccessible = !!stackDetail?.diskComposeContent !== false && stackDetail !== undefined
  const usingHostPath = stackDetail !== undefined && (stackDetail.diskComposeContent !== null && stackDetail.diskComposeContent !== undefined)
  const hasExternalChanges = !externalChangeDismissed && !!stackDetail?.hasExternalChanges

  const { data: rawCustomFile } = useQuery({
    queryKey: ['stackFileContent', selectedStack?.id, activeFile],
    queryFn: () => api.fetchStackFileContent(selectedStack!.id, activeFile as string),
    enabled: !!selectedStack && activeFile !== 'compose' && activeFile !== 'env',
  })

  const { data: stackBackupConfig } = useQuery({
    queryKey: ['backupConfig', selectedStack?.id],
    queryFn: () => api.fetchBackupConfig(selectedStack!.id),
    enabled: !!selectedStack && !isCreating,
  })

  const saveBackupMutation = useMutation({
    mutationFn: ({ stackId, cfg }: { stackId: string; cfg: Partial<BackupConfig> }) =>
      api.updateBackupConfig(stackId, cfg as BackupConfig),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backupConfig', selectedStack?.id] })
      qc.invalidateQueries({ queryKey: ['stackFiles', selectedStack?.id] })
      toast.success('Backup config saved')
    },
    onError: (e: any) => toast.error(`Backup save failed: ${e.message}`),
  })

  const { data: updateHistory = [] } = useQuery({
    queryKey: ['stackUpdateHistory', selectedStack?.id],
    queryFn: () => api.fetchStackUpdateHistory(selectedStack!.id),
    enabled: !!selectedStack && !isCreating,
    refetchInterval: 20000,
  })

  // ── Sync operation done ───────────────────────────────────────────────────
  useEffect(() => {
    if (operation?.done) {
      setIsOperating(false)
      setOperationDone(true)
      setOperationError(operation.error || null)
      // Derive a readable label from the backend action
      const actionLabels: Record<string, string> = {
        deploy: 'Started', stop: 'Stopped', deactivate: 'Deactivated',
        restart: 'Restarted', recreate: 'Recreated', update: 'Updated',
        'bulk-update': 'Updated',
      }
      if (operation.action) {
        setCurrentOperation(operation.error
          ? `${operation.action.charAt(0).toUpperCase() + operation.action.slice(1)} failed`
          : (actionLabels[operation.action] || `${operation.action} complete`)
        )
      }
      qc.invalidateQueries({ queryKey: ['stacks'] })
      qc.invalidateQueries({ queryKey: ['stackContainers', selectedStack?.id] })
    }
  }, [operation?.done])

  // ── Sync custom file content ──────────────────────────────────────────────
  useEffect(() => {
    if (rawCustomFile !== undefined) {
      setCustomFileContent(rawCustomFile)
      setIsDirty(false)
    }
  }, [rawCustomFile])

  // ── WebSocket logs ────────────────────────────────────────────────────────
  const logsEnabled = rightPanel === 'logs' && !!selectedStack && !isCreating
  const logLines = useStackLogs(
    stackContainers.map((c: any) => ({ id: c.id, name: c.name })),
    logsEnabled
  )

  useEffect(() => {
    if (!logsViewportRef.current) return
    logsViewportRef.current.scrollTop = logsViewportRef.current.scrollHeight
  }, [logLines.length])

  // Auto-scroll operation terminal when new lines arrive
  useEffect(() => {
    if (!operationTerminalRef.current) return
    operationTerminalRef.current.scrollTop = operationTerminalRef.current.scrollHeight
  }, [operation?.lines?.length])

  // Sync stack content when selection changes
  useEffect(() => {
    if (selectedStack) {
      setComposeContent(selectedStack.composeContent || selectedStack.compose || '')
      setEnvContent(selectedStack.envContent || selectedStack.envFile || '')
      setIsDirty(false)
      setCompareVersion(null)
      setActiveFile('compose')
      setYamlError(null)
      setIsOperating(false)
      setOperationDone(false)
      setOperationError(null)
      setExternalChangeDismissed(false)
    }
  }, [selectedStack?.id])

  // Keep selected stack status/details in sync with fresh list data to avoid stale action buttons.
  useEffect(() => {
    if (isCreating || !selectedStack) return
    const latest = stacks.find((s) => s.id === selectedStack.id)
    if (!latest) {
      setSelectedStack(null)
      return
    }
    if (latest !== selectedStack) {
      setSelectedStack(latest)
    }
  }, [stacks, selectedStack, isCreating])

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createStackMutation = useMutation({
    mutationFn: ({ name, composeContent, envContent }: { name: string; composeContent: string; envContent?: string }) =>
      api.createStack({ name, composeContent, envContent }),
    onSuccess: (newStack) => {
      toast.success(`Stack "${newStack.name}" created`)
      setIsCreating(false)
      setNewStackName('')
      setComposeContent('')
      setEnvContent('')
      setIsDirty(false)
      setSelectedStack(newStack)
      qc.invalidateQueries({ queryKey: ['stacks'] })
      if (createBackupConfig.enabled) {
        api.updateBackupConfig(newStack.id, createBackupConfig as BackupConfig)
          .then(() => qc.invalidateQueries({ queryKey: ['backupConfig', newStack.id] }))
          .catch(() => toast.error('Stack created, but backup config could not be saved'))
      }
      setCreateBackupConfig({ enabled: false, cronSchedule: '0 22 * * 3', retentionDays: 7, includeStackFolder: true, includeVolumes: true, includeDatabases: false, useAdvancedRetention: false })
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to create stack')
    },
  })

  const updateStackMutation = useMutation({
    mutationFn: ({ id, composeContent, envContent, autoUpdate, runBackupBeforeUpdate }: { id: string; composeContent?: string; envContent?: string; autoUpdate?: boolean; runBackupBeforeUpdate?: boolean }) =>
      api.updateStack(id, { ...(composeContent !== undefined && { composeContent }), ...(envContent !== undefined && { envContent }), ...(autoUpdate !== undefined && { autoUpdate }), ...(runBackupBeforeUpdate !== undefined && { runBackupBeforeUpdate }) }),
    onSuccess: () => {
      toast.success('Stack saved')
      setIsDirty(false)
      qc.invalidateQueries({ queryKey: ['stacks'] })
      qc.invalidateQueries({ queryKey: ['stackVersions', selectedStack?.id] })
      if (promptRestartAfterSaveRef.current) {
        setShowRestartAfterSaveConfirm(true)
      }
      promptRestartAfterSaveRef.current = false
    },
    onError: () => {
      promptRestartAfterSaveRef.current = false
      toast.error('Failed to save stack')
    },
  })

  const saveFileMutation = useMutation({
    mutationFn: () => api.saveStackFileContent(selectedStack!.id, activeFile as string, customFileContent),
    onSuccess: () => { toast.success('File saved'); setIsDirty(false) },
    onError: (e: any) => toast.error(`Save failed: ${e.message}`),
  })

  const deleteStackMutation = useMutation({
    mutationFn: (id: string) => api.deleteStack(id),
    onSuccess: () => {
      toast.success('Stack deleted')
      setShowDeleteConfirm(false)
      setShowDeleteFinalConfirm(false)
      setSelectedStack(null)
      setIsCreating(false)
      qc.invalidateQueries({ queryKey: ['stacks'] })
    },
    onError: () => toast.error('Failed to delete stack'),
  })

  const updateImagesMutation = useMutation({
    mutationFn: (id: string) => api.updateStackImages(id),
    onSuccess: () => {
      setIsOperating(true)
      setOperationDone(false)
      setOperationError(null)
      setCurrentOperation('Updating images')
    },
    onError: (e: any) => toast.error(e.message || 'Update failed'),
  })

  const updateAllStacksMutation = useMutation({
    mutationFn: () => api.updateAllStacksNow(),
    onSuccess: (result) => {
      const updated = result.updated.length
      const skipped = result.skipped.length
      const failed = result.failed.length
      if (failed > 0) {
        toast.error(`Bulk update finished: ${updated} updated, ${skipped} skipped, ${failed} failed`)
      } else {
        toast.success(`Bulk update finished: ${updated} updated${skipped > 0 ? `, ${skipped} skipped` : ''}`)
      }
      qc.invalidateQueries({ queryKey: ['stacks'] })
      qc.invalidateQueries({ queryKey: ['backupJobs'] })
    },
    onError: (e: any) => toast.error(e.message || 'Bulk update failed'),
  })

  const backupAllStacksMutation = useMutation({
    mutationFn: () => api.runBackupAllStacksNow(),
    onSuccess: (result) => {
      const started = result.started.length
      const failed = result.failed.length
      if (failed > 0) {
        toast.error(`Bulk backup finished: ${started} completed, ${failed} failed`)
      } else {
        toast.success(`Bulk backup finished: ${started} stacks backed up`)
      }
      qc.invalidateQueries({ queryKey: ['backupJobs'] })
      qc.invalidateQueries({ queryKey: ['stacks'] })
    },
    onError: (e: any) => toast.error(e.message || 'Bulk backup failed'),
  })

  const deployActionMutation = useMutation({
    mutationFn: (id: string) => api.deployStack(id),
    onMutate: () => { setIsOperating(true); setOperationDone(false); setOperationError(null); setCurrentOperation('Starting') },
    onError: (e: any) => { setIsOperating(false); toast.error(e.message || 'Failed to start stack') },
  })

  const stopActionMutation = useMutation({
    mutationFn: (id: string) => api.stopStack(id),
    onMutate: () => { setIsOperating(true); setOperationDone(false); setOperationError(null); setCurrentOperation('Stopping') },
    onError: (e: any) => { setIsOperating(false); toast.error(e.message || 'Failed to stop stack') },
  })

  const restartActionMutation = useMutation({
    mutationFn: (id: string) => api.restartStack(id),
    onMutate: () => { setIsOperating(true); setOperationDone(false); setOperationError(null); setCurrentOperation('Restarting') },
    onError: (e: any) => { setIsOperating(false); toast.error(e.message || 'Failed to restart stack') },
  })

  const deactivateActionMutation = useMutation({
    mutationFn: (id: string) => api.deactivateStack(id),
    onMutate: () => { setIsOperating(true); setOperationDone(false); setOperationError(null); setCurrentOperation('Deactivating') },
    onError: (e: any) => { setIsOperating(false); toast.error(e.message || 'Failed to deactivate stack') },
  })

  const recreateActionMutation = useMutation({
    mutationFn: (id: string) => api.recreateStack(id),
    onMutate: () => { setIsOperating(true); setOperationDone(false); setOperationError(null); setCurrentOperation('Recreating') },
    onError: (e: any) => { setIsOperating(false); toast.error(e.message || 'Failed to recreate stack') },
  })

  const syncGitMutation = useMutation({
    mutationFn: (id: string) => api.syncStackGit(id),
    onSuccess: () => {
      toast.success('Git sync complete')
      qc.invalidateQueries({ queryKey: ['gitStatus', selectedStack?.id] })
      qc.invalidateQueries({ queryKey: ['stacks'] })
    },
    onError: (e: any) => toast.error(e.message || 'Git sync failed'),
  })

  const adoptMutation = useMutation({
    mutationFn: ({ name, stackPath, composeFiles }: { name: string; stackPath: string; composeFiles?: string[] }) =>
      api.adoptStack(name, stackPath, composeFiles),
    onSuccess: (adopted) => {
      toast.success(`"${adopted.name}" is now managed by THC`)
      qc.invalidateQueries({ queryKey: ['stacks'] })
      qc.invalidateQueries({ queryKey: ['externalStacks'] })
      setSelectedStack(adopted)
      setIsCreating(false)
    },
    onError: (e: any) => toast.error(e.message || 'Failed to adopt stack'),
  })

  // Helpers
  const validateYAML = (yaml: string): boolean => {
    try {
      YAML.load(yaml)
      setYamlError(null)
      return true
    } catch (err: any) {
      setYamlError(err.message)
      return false
    }
  }

  const normalizePort = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.trunc(value)
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
      const parsed = Number(value.trim())
      if (Number.isFinite(parsed) && parsed > 0) return parsed
    }
    return null
  }

  const extractPorts = (yaml: string): number[] => {
    try {
      const doc = YAML.load(yaml) as any
      const services = doc?.services
      if (!services || typeof services !== 'object') return []

      const hostPorts = new Set<number>()
      for (const svc of Object.values(services as Record<string, any>)) {
        const rawPorts: unknown[] = Array.isArray((svc as any)?.ports) ? (svc as any).ports : []
        for (const p of rawPorts) {
          if (typeof p === 'number') {
            hostPorts.add(p)
            continue
          }

          if (typeof p === 'string') {
            const stripped = p.split('/')[0]
            const segments = stripped.split(':').map((s) => s.trim()).filter(Boolean)
            if (segments.length === 1) {
              const only = Number(segments[0])
              if (Number.isFinite(only)) hostPorts.add(only)
              continue
            }
            const host = Number(segments[segments.length - 2])
            if (Number.isFinite(host)) hostPorts.add(host)
            continue
          }

          if (p && typeof p === 'object') {
            const published = Number((p as Record<string, unknown>).published)
            if (Number.isFinite(published)) hostPorts.add(published)
          }
        }
      }

      return [...hostPorts].sort((a, b) => a - b)
    } catch {
      return []
    }
  }

  const stackPortsCache = new Map<string, number[]>()

  const getStackPortList = (stack: Stack): number[] => {
    const cached = stackPortsCache.get(stack.id)
    if (cached) return cached

    const fromRow = Array.isArray(stack.ports)
      ? stack.ports
          .map((p) => normalizePort(p))
          .filter((p): p is number => p !== null)
      : []

    const computed = fromRow.length > 0
      ? fromRow
      : extractPorts((stack as any).composeContent ?? (stack as any).compose ?? '')

    const uniqueSorted = [...new Set(computed)].sort((a, b) => a - b)
    stackPortsCache.set(stack.id, uniqueSorted)
    return uniqueSorted
  }

  const getPortConflicts = (ports: number[], currentStackId?: string): number[] => {
    const portMap = new Map<number, string[]>()
    stacks
      .filter((s) => s.id !== currentStackId)
      .forEach((s) => getStackPortList(s).forEach((p) => {
        if (!portMap.has(p)) portMap.set(p, [])
        portMap.get(p)!.push(s.name)
      }))
    return ports.filter(p => (portMap.get(p) || []).length > 0)
  }

  const extractServiceNames = (yaml: string): string[] => {
    try {
      const doc = YAML.load(yaml) as any
      const services = doc?.services
      if (!services || typeof services !== 'object') return []
      return Object.keys(services)
        .map((name) => String(name || '').trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
    } catch {
      return []
    }
  }

  const stackServiceNamesCache = new Map<string, string[]>()

  const getStackServiceNameList = (stack: Stack): string[] => {
    const cached = stackServiceNamesCache.get(stack.id)
    if (cached) return cached
    const parsed = extractServiceNames((stack as any).composeContent ?? (stack as any).compose ?? '')
    stackServiceNamesCache.set(stack.id, parsed)
    return parsed
  }

  const getServiceNameConflicts = (serviceNames: string[], currentStackId?: string): Map<string, string[]> => {
    const owners = new Map<string, string[]>()
    stacks
      .filter((s) => s.id !== currentStackId)
      .forEach((s) => {
        for (const serviceName of getStackServiceNameList(s)) {
          if (!owners.has(serviceName)) owners.set(serviceName, [])
          owners.get(serviceName)!.push(s.name)
        }
      })

    const conflicts = new Map<string, string[]>()
    for (const serviceName of serviceNames) {
      const clashOwners = owners.get(serviceName) || []
      if (clashOwners.length > 0) conflicts.set(serviceName, clashOwners)
    }
    return conflicts
  }

  const parseServices = (yaml: string): Array<{ name: string; ports: Array<{ host: number; container: number }>; image?: string }> => {
    try {
      const doc = YAML.load(yaml) as any
      if (!doc?.services) return []
      return Object.entries(doc.services as Record<string, any>).map(([name, svc]) => {
        const rawPorts: unknown[] = Array.isArray(svc?.ports) ? svc.ports : []
        const ports = rawPorts.flatMap((p): Array<{ host: number; container: number }> => {
          const str = String(p)
          
          // Try standard format first: "host:container" or "ip:host:container"
          let match = str.match(/(?:[\d.]+:)?(\d+):(\d+)/)
          if (match) {
            return [{ host: parseInt(match[1]), container: parseInt(match[2]) }]
          }
          
          // Handle variable substitution formats like "${PORT:-8080}:80"
          // Extract numbers from after colons
          const colonParts = str.split(':')
          if (colonParts.length >= 2) {
            // Try to parse from right to left: last part is container port, second-to-last could be host
            const lastPart = colonParts[colonParts.length - 1]
            const container = parseInt(lastPart)
            
            if (!isNaN(container)) {
              // Found container port. Now find host port.
              const secondLastPart = colonParts[colonParts.length - 2]
              
              // Try to extract number from variable substitution like "${VAR:-8080}"
              const varMatch = secondLastPart?.match(/(\d+)\}?$/)
              if (varMatch) {
                const host = parseInt(varMatch[1])
                if (!isNaN(host)) {
                  return [{ host, container }]
                }
              }
              
              // Or if secondLastPart is just a number, use it as host port
              const host = parseInt(secondLastPart || '')
              if (!isNaN(host)) {
                return [{ host, container }]
              }
              
              // If only container port found, assume host === container
              if (!isNaN(container)) {
                return [{ host: container, container }]
              }
            }
          }
          
          return []
        })
        return { name, ports, image: svc?.image as string | undefined }
      })
    } catch {
      return []
    }
  }

  const handleSave = () => {
    if (isCreating) {
      if (!newStackName.trim()) { toast.error('Stack name required'); return }
      if (stacks.some(s => s.name.toLowerCase() === newStackName.trim().toLowerCase())) { toast.error('Stack name already exists'); return }
      if (!validateYAML(composeContent)) return
      createStackMutation.mutate({ name: newStackName.trim(), composeContent, envContent })
    } else if (selectedStack) {
      if (activeFile === 'compose') {
        if (!validateYAML(composeContent)) return
        promptRestartAfterSaveRef.current = selectedStack.status === 'running'
        updateStackMutation.mutate({ id: selectedStack.id, composeContent, envContent })
      } else if (activeFile === 'env') {
        promptRestartAfterSaveRef.current = selectedStack.status === 'running'
        updateStackMutation.mutate({ id: selectedStack.id, composeContent, envContent })
      } else {
        promptRestartAfterSaveRef.current = false
        saveFileMutation.mutate()
      }
    }
  }

  const handleCreateNew = () => {
    setIsCreating(true)
    setSelectedStack(null)
    setNewStackName('')
    setComposeContent("version: '3.8'\nservices:\n  app:\n    image: nginx:latest\n    ports:\n      - \"8080:80\"\n    restart: unless-stopped")
    setEnvContent('')
    setIsDirty(false)
    setYamlError(null)
  }

  const getStatusBadgeVariant = (status: Stack['status']): 'default' | 'outline' | 'destructive' | 'secondary' => {
    switch (status) {
      case 'running': return 'default'
      case 'stopped': return 'outline'
      case 'failed': return 'destructive'
      case 'deploying': return 'secondary'
      default: return 'outline'
    }
  }

  // Derived state
  const sortedStacks = [...stacks].sort((a, b) => {
    const order = { running: 0, deploying: 1, failed: 2, stopped: 3 }
    const ao = order[a.status as keyof typeof order] ?? 99
    const bo = order[b.status as keyof typeof order] ?? 99
    return ao !== bo ? ao - bo : a.name.localeCompare(b.name)
  })
  const filteredStacks = sortedStacks.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
  const filteredExternalStacks = externalStacks
    .filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))
  const filteredOrphanStacks = orphanStacks
    .filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))

  const editorValue = activeFile === 'compose' ? composeContent : activeFile === 'env' ? envContent : customFileContent
  const handleEditorChange = (val: string) => {
    if (activeFile === 'compose') { setComposeContent(val); setIsDirty(true); validateYAML(val) }
    else if (activeFile === 'env') { setEnvContent(val); setIsDirty(true) }
    else { setCustomFileContent(val); setIsDirty(true) }
  }

  const ports = activeFile === 'compose' ? extractPorts(composeContent) : []
  const portConflicts = getPortConflicts(ports, selectedStack?.id)
  const activeServiceNames = activeFile === 'compose' ? extractServiceNames(composeContent) : []
  const serviceNameConflicts = getServiceNameConflicts(activeServiceNames, selectedStack?.id)
  const compareVersionObj = versions.find((v: any) => v.version === compareVersion) ?? null
  const flatFiles = flattenFileTree(stackFiles as any[])
  const excludedPatterns = settings?.stackFileExcludes || [
    '*.jpg', '*.jpeg', '*.png', '*.gif', '*.webp', '*.bmp', '*.ico', '*.svg', '*.avif', '*.tiff', '*.svc',
    '*.mp4', '*.mkv', '*.mov', '*.avi', '*.mp3', '*.wav', '*.flac', '*.zip', '*.tar', '*.gz', '*.7z', '*.pdf',
  ]
  const otherFiles = flatFiles
    .filter(f => f.type !== 'directory')
    .filter(f => !['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml', '.env'].includes(f.name))
    .filter(f => !isFileExcluded(f.name, excludedPatterns))
    .slice(0, 24)
  const opLines: string[] = operation?.lines || []
  const parsedServices = parseServices(composeContent)
  const stackPortConflictCounts = (() => {
    const owners = new Map<number, Set<string>>()
    for (const s of stacks) {
      for (const p of getStackPortList(s)) {
        if (!owners.has(p)) owners.set(p, new Set<string>())
        owners.get(p)!.add(s.name)
      }
    }

    const counts = new Map<string, number>()
    for (const s of stacks) {
      const conflicts = new Set<number>()
      for (const p of getStackPortList(s)) {
        if ((owners.get(p)?.size || 0) > 1) conflicts.add(p)
      }
      counts.set(s.id, conflicts.size)
    }
    return counts
  })()

  const stackServiceNameConflictCounts = (() => {
    const owners = new Map<string, Set<string>>()
    for (const s of stacks) {
      for (const serviceName of getStackServiceNameList(s)) {
        if (!owners.has(serviceName)) owners.set(serviceName, new Set<string>())
        owners.get(serviceName)!.add(s.name)
      }
    }

    const counts = new Map<string, number>()
    for (const s of stacks) {
      const conflicts = new Set<string>()
      for (const serviceName of getStackServiceNameList(s)) {
        if ((owners.get(serviceName)?.size || 0) > 1) conflicts.add(serviceName)
      }
      counts.set(s.id, conflicts.size)
    }
    return counts
  })()

  const serviceContainerByName = new Map(
    (stackContainers as Array<{ id: string; name: string; status: string; image: string; serviceName?: string }>)
      .filter(c => !!c.serviceName)
      .map(c => [c.serviceName as string, c])
  )

  const handleOpenServiceShell = (serviceName: string) => {
    const container = serviceContainerByName.get(serviceName)
    if (!container) {
      toast.error(`No container found for service "${serviceName}"`) 
      return
    }
    if (!String(container.status || '').toLowerCase().includes('running')) {
      toast.error(`Service "${serviceName}" is not running`) 
      return
    }
    setShellTarget({
      containerId: container.id,
      containerName: container.name,
      serviceName,
      image: container.image,
    })
  }
  // Create mode derived
  const newPorts = isCreating ? extractPorts(composeContent) : []
  const newServiceNames = isCreating ? extractServiceNames(composeContent) : []
  const newServiceConflicts = isCreating ? getServiceNameConflicts(newServiceNames) : new Map<string, string[]>()
  const refStackCompose = refStackId ? (stacks.find(s => s.id === refStackId) as any)?.composeContent ?? (stacks.find(s => s.id === refStackId) as any)?.compose ?? '' : ''

  // Keyboard shortcut: Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); if (isDirty) handleSave() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  // Render
  if (effectiveMobileMode) {
    return (
      <MobileStacksView
        stacks={stacks}
        selectedStackId={selectedStack?.id ?? null}
        onSelectStack={setSelectedStack}
        onDeployStack={onDeployStack}
        onStopStack={onStopStack}
        onRestartStack={onRestartStack}
        onRecreateStack={onRecreateStack}
        onDeactivateStack={onDeactivateStack}
        onCreateNew={handleCreateNew}
        onToggleMobileMode={onExitForcedMobileMode ?? (() => setMobileModeEnabled(!mobileModeEnabled))}
        isOperating={isOperating}
      />
    )
  }

  return (
    <TooltipProvider>
      <div className="flex h-[calc(100vh-200px)] min-h-0 overflow-hidden gap-4">

        {/* LEFT SIDEBAR - Stack List */}
        <div className="w-80 xl:w-[22rem] flex flex-col gap-2 shrink-0 min-h-0 overflow-hidden">
          <div className="relative shrink-0">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search stacks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 font-mono text-sm"
            />
          </div>

          <Button onClick={handleCreateNew} disabled={isCreating} className="w-full gap-2 shrink-0" size="sm">
            <Plus className="w-4 h-4" />
            New Stack
          </Button>

          <div className="grid grid-cols-1 gap-1.5 shrink-0">
            <Button
              onClick={() => updateAllStacksMutation.mutate()}
              disabled={updateAllStacksMutation.isPending || backupAllStacksMutation.isPending || isCreating}
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2"
            >
              {updateAllStacksMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Update all Stacks (incl. Backup) Now
            </Button>
            <Button
              onClick={() => backupAllStacksMutation.mutate()}
              disabled={backupAllStacksMutation.isPending || updateAllStacksMutation.isPending || isCreating}
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2"
            >
              {backupAllStacksMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
              Backup all Stacks Now
            </Button>
          </div>

          <ScrollArea className="flex-1 min-h-0 rounded-lg border">
            <div className="p-2 space-y-1.5">
              {filteredStacks.length === 0 && filteredExternalStacks.length === 0 && filteredOrphanStacks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-xs">
                  <p>No stacks found</p>
                </div>
              ) : null}
              {filteredStacks.length > 0 && (
                <>
                  <p className="px-1 pt-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">Managed by THC</p>
                  {filteredStacks.map(stack => (
                    <Card
                      key={stack.id}
                      onClick={() => { setSelectedStack(stack); setIsCreating(false) }}
                      className={`p-3 cursor-pointer transition-all ${
                        selectedStack?.id === stack.id && !isCreating
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'hover:border-muted-foreground/60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-sm truncate font-semibold">{stack.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <Badge variant={getStatusBadgeVariant(stack.status)} className="text-[10px] px-1.5 py-0 capitalize">
                              {stack.status}
                            </Badge>
                            {stack.services > 0 && (
                              <span className="text-[10px] text-muted-foreground">{stack.services} svc</span>
                            )}
                            {stack.updateAvailable && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-[10px] font-semibold text-amber-500 flex items-center gap-0.5 cursor-default">
                                    <RefreshCw className="w-2.5 h-2.5" />upd
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="text-xs">Update available in registry</TooltipContent>
                              </Tooltip>
                            )}
                            {stack.hasHostNetworking && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-[10px] text-orange-400 flex items-center gap-0.5 cursor-default">
                                    <AlertTriangle className="w-2.5 h-2.5" />host-net
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="text-xs">Host networking mode: ports may be exposed without explicit mappings</TooltipContent>
                              </Tooltip>
                            )}
                            {stack.autoUpdate && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-[10px] text-primary flex items-center gap-0.5 cursor-default">
                                    <Zap className="w-2.5 h-2.5" />auto
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="text-xs">Auto Update enabled</TooltipContent>
                              </Tooltip>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-[10px] text-blue-400 flex items-center gap-0.5 cursor-default">
                                  <Archive className="w-2.5 h-2.5" />bkp:{stack.backupCount ?? 0}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs">Completed backups for this stack: {stack.backupCount ?? 0}</TooltipContent>
                            </Tooltip>
                            {stack.smartStartup?.enabled && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-[10px] text-emerald-400 flex items-center gap-0.5 cursor-default">
                                    <Zap className="w-2.5 h-2.5" />smart
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="text-xs">Smart Startup enabled</TooltipContent>
                              </Tooltip>
                            )}
                            {(stackPortConflictCounts.get(stack.id) || 0) > 0 && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-[10px] text-destructive flex items-center gap-0.5 cursor-default">
                                    <AlertCircle className="w-2.5 h-2.5" />conf:{stackPortConflictCounts.get(stack.id)}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="text-xs">This stack has host port conflicts with other stacks</TooltipContent>
                              </Tooltip>
                            )}
                            {(stackServiceNameConflictCounts.get(stack.id) || 0) > 0 && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-[10px] text-amber-500 flex items-center gap-0.5 cursor-default">
                                    <AlertTriangle className="w-2.5 h-2.5" />svc:{stackServiceNameConflictCounts.get(stack.id)}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="text-xs">This stack reuses service names found in other stacks</TooltipContent>
                              </Tooltip>
                            )}
                            {stack.filesLost && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-[10px] text-destructive font-semibold flex items-center gap-0.5 cursor-default">
                                    <AlertTriangle className="w-2.5 h-2.5" />LOST
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="text-xs">Stack files not found on disk. The compose file may have been deleted from the host.</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className={`text-[10px] mt-0.5 cursor-help ${stack.status === 'running' ? 'text-green-500' : stack.status === 'failed' ? 'text-destructive' : 'text-muted-foreground/40'}`}>&#9679;</span>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs">Status dot: green = running, red = failed, gray = stopped/deploying.</TooltipContent>
                        </Tooltip>
                      </div>
                    </Card>
                  ))}
                </>
              )}

              {filteredExternalStacks.length > 0 && (
                <>
                  <p className="px-1 pt-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">External Compose Projects</p>
                  {filteredExternalStacks.map(stack => (
                    <Card key={stack.id} className="p-3 border-dashed border-border/60 bg-muted/10">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="font-mono text-sm truncate font-semibold">{stack.name}</p>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 cursor-default shrink-0">
                                  <ExternalLink className="w-2.5 h-2.5" />ext
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs">Detected from Docker Compose labels. Click "Adopt" to manage in THC without moving any files.</TooltipContent>
                            </Tooltip>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <Badge variant={getStatusBadgeVariant(stack.status)} className="text-[10px] px-1.5 py-0 capitalize">
                              {stack.status}
                            </Badge>
                            {stack.services > 0 && (
                              <span className="text-[10px] text-muted-foreground">{stack.services} svc</span>
                            )}
                            {stack.stackPath && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[120px] cursor-default">
                                    {stack.stackPath}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="text-xs font-mono">{stack.stackPath}</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className={`text-[10px] mt-0.5 cursor-help ${stack.status === 'running' ? 'text-green-500' : stack.status === 'failed' ? 'text-destructive' : 'text-muted-foreground/40'}`}>&#9679;</span>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs">Status dot: green = running, red = failed, gray = stopped/deploying.</TooltipContent>
                        </Tooltip>
                      </div>
                      {stack.stackPath && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full mt-2 h-6 text-[10px] gap-1 border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-50"
                                disabled={adoptMutation.isPending || (stack as any).pathAccessible === false}
                                onClick={() => adoptMutation.mutate({ name: stack.name, stackPath: stack.stackPath!, composeFiles: stack.composeFiles })}
                              >
                                <Rocket className="w-3 h-3" />
                                {adoptMutation.isPending ? 'Adopting...' : 'Adopt into THC'}
                              </Button>
                            </span>
                          </TooltipTrigger>
                          {(stack as any).pathAccessible === false && (
                            <TooltipContent className="text-xs">Stack path no longer accessible on host — cannot adopt</TooltipContent>
                          )}
                        </Tooltip>
                      )}
                    </Card>
                  ))}
                </>
              )}

              {filteredOrphanStacks.length > 0 && (
                <>
                  <p className="px-1 pt-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">Found on Disk (Unadopted)</p>
                  {filteredOrphanStacks.map(orphan => (
                    <Card key={orphan.stackPath} className="p-3 border-dashed border-amber-500/40 bg-amber-500/5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="font-mono text-sm truncate font-semibold">{orphan.name}</p>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-[10px] text-amber-500 flex items-center gap-0.5 cursor-default shrink-0">
                                  <FolderOpen className="w-2.5 h-2.5" />disk
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs">Found in stacks folder but not yet managed by THC. Click "Adopt" to import it.</TooltipContent>
                            </Tooltip>
                          </div>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[160px] mt-0.5 cursor-default">{orphan.stackPath}</p>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs font-mono">{orphan.stackPath}/{orphan.composeFile}</TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full mt-2 h-6 text-[10px] gap-1 border-amber-500/50 text-amber-500 hover:bg-amber-500/10"
                        disabled={adoptMutation.isPending}
                        onClick={() => adoptMutation.mutate({ name: orphan.name, stackPath: orphan.stackPath, composeFiles: undefined })}
                      >
                        <Rocket className="w-3 h-3" />
                        {adoptMutation.isPending ? 'Adopting...' : 'Adopt into THC'}
                      </Button>
                    </Card>
                  ))}
                </>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* ═══ MAIN AREA ═══ */}
        <div className="flex-1 flex flex-col gap-3 min-w-0 min-h-0 overflow-hidden">

          {isCreating ? (
            /* --- CREATE MODE --- */
            <>
              <div className="flex items-center justify-between gap-3 pb-3 border-b shrink-0">
                <h2 className="text-lg font-mono font-semibold">New Stack</h2>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={() => { setIsCreating(false); setNewStackName(''); setComposeContent(''); setEnvContent(''); setActiveFile('compose'); setIsDirty(false) }} className="gap-1.5">
                      <X className="w-4 h-4" />
                      Cancel
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">Discard unsaved create-mode changes and return to editor</TooltipContent>
                </Tooltip>
              </div>

              <div className="flex-1 flex gap-3 min-h-0">

                {/* -- LEFT: editor -- */}
                <div className="flex flex-col min-h-0" style={{ flex: '0 0 55%' }}>
                  <Input
                    value={newStackName}
                    onChange={(e) => setNewStackName(e.target.value)}
                    placeholder="stack-name (lowercase, hyphens)"
                    className="font-mono shrink-0 mb-2"
                    autoFocus
                  />
                  {/* file tabs */}
                  <div className="flex items-center gap-1 mb-2 shrink-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setActiveFile('compose')}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono transition-colors ${activeFile === 'compose' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                        >
                          <FileCode className="w-3 h-3" />
                          compose.yml
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Edit the Docker Compose definition for this stack</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setActiveFile('env')}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono transition-colors ${activeFile === 'env' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                        >
                          <File className="w-3 h-3" />
                          .env
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Edit environment variables consumed by compose services</TooltipContent>
                    </Tooltip>
                  </div>
                  {yamlError && activeFile === 'compose' && (
                    <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/5 px-3 py-2 mb-2 shrink-0">
                      <AlertTriangle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                      <p className="text-xs text-destructive font-mono break-all">{yamlError}</p>
                    </div>
                  )}
                  {activeFile === 'env'
                    ? <Textarea value={envContent} onChange={e => setEnvContent(e.target.value)} className="flex-1 font-mono text-xs resize-none min-h-0" spellCheck={false} placeholder="MY_VAR=value" />
                     : <YamlEditor value={composeContent} onChange={v => { setComposeContent(v); setIsDirty(true); validateYAML(v) }} minHeight="200px" className={`flex-1 ${yamlError ? 'border-destructive' : ''}`} />
                  }
                  <div className="flex items-center justify-end gap-2 pt-2 border-t shrink-0 mt-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={handleSave}
                          disabled={!newStackName.trim() || createStackMutation.isPending || !!yamlError}
                          className="gap-1.5"
                          size="sm"
                        >
                          {createStackMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          Create Stack
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Create stack folder, write compose/.env files, and register in THC</TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                {/* -- RIGHT: port conflicts / reference / volumes -- */}
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="flex items-center gap-1 mb-2 shrink-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setCreateRightPanel('conflicts')}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${createRightPanel === 'conflicts' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                        >
                          <AlertCircle className="w-3 h-3" />
                          Conflicts
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">See host-port and service-name collisions against existing stacks</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setCreateRightPanel('reference')}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${createRightPanel === 'reference' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                        >
                          <FileCode className="w-3 h-3" />
                          Reference
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">View reference compose from another stack while creating</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setCreateRightPanel('helpers')}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${createRightPanel === 'helpers' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                        >
                          <HardDrive className="w-3 h-3" />
                          Helpers
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Global copy-paste helpers from Settings</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setCreateRightPanel('backup')}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${createRightPanel === 'backup' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                        >
                          <Archive className="w-3 h-3" />
                          Backup
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Configure backup policy before first deploy</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setCreateRightPanel('autoupdate')}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${createRightPanel === 'autoupdate' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                        >
                          <Zap className="w-3 h-3" />
                          Auto Update
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Set image update automation rules for this stack</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setCreateRightPanel('ai')}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${createRightPanel === 'ai' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                        >
                          <WandSparkles className="w-3 h-3" />
                          AI
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Open AI helper for compose generation and review</TooltipContent>
                    </Tooltip>
                  </div>

                  {/* PORT CONFLICTS */}
                  {createRightPanel === 'conflicts' && (
                    <div className="flex-1 overflow-y-auto space-y-3">
                      {/* System / well-known port warnings */}
                      {(() => {
                        const SYSTEM_PORTS: Record<number, string> = {
                          20: 'FTP data', 21: 'FTP control', 22: 'SSH', 23: 'Telnet',
                          25: 'SMTP', 53: 'DNS', 67: 'DHCP', 68: 'DHCP', 80: 'HTTP',
                          110: 'POP3', 123: 'NTP', 143: 'IMAP', 161: 'SNMP', 194: 'IRC',
                          443: 'HTTPS', 445: 'SMB', 465: 'SMTPS', 587: 'SMTP submission',
                          993: 'IMAPS', 995: 'POP3S',
                          3306: 'MySQL', 5432: 'PostgreSQL', 6379: 'Redis', 27017: 'MongoDB',
                        }
                        const sysHits = newPorts.filter(p => SYSTEM_PORTS[p])
                        if (sysHits.length === 0) return null
                        return (
                          <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/8 px-3 py-2 space-y-1">
                            <p className="text-[10px] font-semibold text-yellow-400 uppercase tracking-wide flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Well-known port{sysHits.length > 1 ? 's' : ''} in use
                            </p>
                            {sysHits.map(p => (
                              <p key={p} className="text-xs text-yellow-300 font-mono">
                                :{p} <span className="text-yellow-400/70">— {SYSTEM_PORTS[p]}</span>
                              </p>
                            ))}
                            <p className="text-[10px] text-yellow-400/60 mt-1">These ports are typically reserved by the OS or standard services. Consider using ports above 1024.</p>
                          </div>
                        )
                      })()}

                      {/* Per-port conflict list */}

                      {newPorts.length === 0 ? (
                        <div className="flex items-center justify-center h-24">
                          <p className="text-xs text-muted-foreground font-mono">No ports defined in compose yet</p>
                        </div>
                      ) : (
                        <>
                          <p className="text-xs text-muted-foreground">Ports declared in your compose:</p>
                          {newPorts.map(port => {
                            const conflict = stacks.find((s) => getStackPortList(s).includes(port))
                            return (
                              <div key={port} className={`flex items-center justify-between px-3 py-2 rounded-lg border ${conflict ? 'border-destructive/60 bg-destructive/5' : 'border-border/40 bg-muted/20'}`}>
                                <span className="font-mono text-sm font-semibold">:{port}</span>
                                {conflict ? (
                                  <span className="text-xs text-destructive flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" />
                                    Used by <strong className="ml-0.5">{conflict.name}</strong>
                                  </span>
                                ) : (
                                  <span className="text-xs text-green-500">&#10003; Available</span>
                                )}
                              </div>
                            )
                          })}

                          <p className="text-xs text-muted-foreground pt-1 pb-1">Service name conflicts across stacks:</p>
                          {newServiceNames.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic">No services defined in compose yet</p>
                          ) : (
                            <div className="space-y-1.5">
                              {newServiceNames.map((serviceName) => {
                                const clashes = newServiceConflicts.get(serviceName) || []
                                return (
                                  <div key={serviceName} className={`flex items-center justify-between px-3 py-2 rounded-lg border ${clashes.length > 0 ? 'border-amber-500/60 bg-amber-500/5' : 'border-border/40 bg-muted/20'}`}>
                                    <span className="font-mono text-xs font-semibold">{serviceName}</span>
                                    {clashes.length > 0 ? (
                                      <span className="text-xs text-amber-400 flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" />
                                        Reused by <strong className="ml-0.5">{clashes.join(', ')}</strong>
                                      </span>
                                    ) : (
                                      <span className="text-xs text-green-500">Unique</span>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}

                          <p className="text-[10px] text-muted-foreground">Reusing service names across stacks can cause confusion in tooling, logs, and helper integrations even when ports do not clash.</p>
                        </>
                      )}

                      {/* All ports in use */}
                      <p className="text-xs text-muted-foreground pt-1 pb-1">All ports in use across stacks:</p>
                      <div className="flex flex-wrap gap-1">
                        {stacks.flatMap((s) => getStackPortList(s).map((p) => ({ p, name: s.name }))).map(({ p, name }, i) => (
                          <Tooltip key={i}>
                            <TooltipTrigger asChild>
                              <Badge variant={newPorts.includes(p) ? 'destructive' : 'outline'} className="font-mono text-xs cursor-default">:{p}</Badge>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">{name}</TooltipContent>
                          </Tooltip>
                        ))}
                        {stacks.every((s) => getStackPortList(s).length === 0) && <span className="text-xs text-muted-foreground italic">No ports in use across stacks</span>}
                      </div>

                      {/* Best-practice port ranges reference */}
                      <div className="rounded-lg border border-border/40 bg-muted/10 px-3 py-2 mt-2 space-y-1.5">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                          <BookOpen className="w-3 h-3" /> Homelab port conventions
                        </p>
                        {[
                          { range: '1024–1999', label: 'General homelab / self-hosted services' },
                          { range: '3000–3999', label: 'Web UIs & dashboards (Grafana :3000, THC :3210)' },
                          { range: '5000–5999', label: 'Dev / build tools (Registry :5000)' },
                          { range: '8000–8999', label: 'Proxies & web apps (nginx :8080, Traefik :8080/:8443)' },
                          { range: '9000–9999', label: 'Monitoring (Portainer :9000, Prometheus :9090)' },
                          { range: '10000–19999', label: 'Custom app ports' },
                        ].map(({ range, label }) => (
                          <div key={range} className="flex items-baseline gap-2">
                            <span className="font-mono text-[10px] text-primary/80 shrink-0 w-20">{range}</span>
                            <span className="text-[10px] text-muted-foreground">{label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* STACK REFERENCE */}
                  {createRightPanel === 'reference' && (
                    <div className="flex-1 flex flex-col min-h-0 gap-2">
                      <Select value={refStackId ?? ''} onValueChange={v => setRefStackId(v || null)}>
                        <SelectTrigger className="h-7 text-xs shrink-0">
                          <SelectValue placeholder="Pick a stack to reference..." />
                        </SelectTrigger>
                        <SelectContent>
                          {stacks.map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {refStackId ? (
                        <YamlEditor
                          value={refStackCompose}
                          readOnly
                          minHeight="0"
                          className="flex-1 min-h-0"
                          style={{ flex: 1 }}
                        />
                      ) : (
                        <div className="flex-1 flex items-center justify-center">
                          <p className="text-xs text-muted-foreground text-center">Select a stack above to view its compose as reference</p>
                        </div>
                      )}
                    </div>
                  )}

                    {/* COPY-PASTE HELPERS */}
                  {createRightPanel === 'helpers' && (
                    <div className="flex-1 overflow-y-auto space-y-2">
                      <p className="text-xs text-muted-foreground mb-1">
                        Global helpers from Settings. Click to copy.
                      </p>
                      {(settings?.copyPasteHelpers ?? []).length === 0 ? (
                        <p className="text-xs text-muted-foreground italic px-1">No helpers configured. Add them in Settings ? Helpers.</p>
                      ) : (
                        (settings?.copyPasteHelpers ?? []).map(h => (
                          <div key={h.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border/40 bg-muted/20">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold">{h.label}</p>
                              <p className="font-mono text-xs text-muted-foreground truncate">{h.value}</p>
                            </div>
                            <button
                              onClick={() => { navigator.clipboard.writeText(h.value); toast.success('Copied') }}
                              className="text-muted-foreground hover:text-foreground shrink-0"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))
                      )}

                      <div className="pt-3 space-y-2">
                        <p className="text-xs text-muted-foreground mb-1">Manually created networks from Networks. Create them once, then reference them here as external compose networks.</p>
                        {manualNetworkHelpers.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic px-1">No manually managed networks found.</p>
                        ) : (
                          manualNetworkHelpers.map((h) => (
                            <div key={h.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border/40 bg-muted/20">
                              <div className="min-w-0">
                                <p className="text-xs font-semibold">{h.label}</p>
                                <p className="font-mono text-xs text-muted-foreground truncate">{h.value}</p>
                                {h.meta && <p className="text-[10px] text-muted-foreground/70">{h.meta}</p>}
                              </div>
                              <button
                                onClick={() => { navigator.clipboard.writeText(h.value); toast.success('Copied network helper') }}
                                className="text-muted-foreground hover:text-foreground shrink-0"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>

                      <div className="pt-3 space-y-2">
                        <p className="text-xs text-muted-foreground mb-1">Networks discovered from stacks. These are not manually managed, but can still be reused as external networks if they remain available.</p>
                        {discoveredNetworkHelpers.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic px-1">No stack-created reusable networks found.</p>
                        ) : (
                          discoveredNetworkHelpers.map((h) => (
                            <div key={h.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border/40 bg-muted/10">
                              <div className="min-w-0">
                                <p className="text-xs font-semibold">{h.label}</p>
                                <p className="font-mono text-xs text-muted-foreground truncate">{h.value}</p>
                                {h.meta && <p className="text-[10px] text-muted-foreground/70">{h.meta}</p>}
                              </div>
                              <button
                                onClick={() => { navigator.clipboard.writeText(h.value); toast.success('Copied network helper') }}
                                className="text-muted-foreground hover:text-foreground shrink-0"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* BACKUP CONFIG (create mode) */}
                  {createRightPanel === 'backup' && (
                    <div className="flex-1 overflow-y-auto space-y-3">
                      <p className="text-xs text-muted-foreground">Configure backup settings. Applied after stack is created.</p>
                      <FullBackupPanel config={createBackupConfig} onChange={setCreateBackupConfig} />
                    </div>
                  )}

                  {/* AUTO UPDATE (create mode) */}
                  {createRightPanel === 'autoupdate' && (
                    <div className="flex-1 overflow-y-auto space-y-3">
                      <div className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-muted/20">
                        <div>
                          <Label className="text-sm font-semibold">Auto Update</Label>
                          <p className="text-xs text-muted-foreground">Automatically update this stack on the global update schedule</p>
                        </div>
                        <Switch
                          checked={createBackupConfig.enabled === undefined ? false : false}
                          onCheckedChange={() => {}}
                          disabled
                        />
                      </div>
                      <p className="text-xs text-muted-foreground px-1">Auto Update settings can be configured after the stack is created.</p>
                    </div>
                  )}

                  {createRightPanel === 'ai' && (
                    <ComposeAiPanel
                      composeContent={composeContent}
                      envContent={envContent}
                      onApplyCompose={(compose) => {
                        setComposeContent(compose)
                        setActiveFile('compose')
                        setIsDirty(true)
                        validateYAML(compose)
                      }}
                      emptyStateHint="Start with a prompt like: I need a compose file for service abc with PostgreSQL and Traefik."
                    />
                  )}
                </div>
              </div>
            </>

          ) : !selectedStack ? (
            /* --- NO SELECTION --- */
            <Card className="flex-1 flex items-center justify-center text-center py-12">
              <div>
                <FileCode className="w-14 h-14 mx-auto mb-4 text-muted-foreground opacity-40" />
                <p className="text-lg font-mono text-muted-foreground">No stack selected</p>
                <p className="text-sm text-muted-foreground mt-2">Select a stack from the list or create a new one</p>
              </div>
            </Card>

          ) : (
            /* EDIT MODE */
            <>
              {/* Stack Header */}
              {/* -- Stack Header -- */}
              <div className="pb-3 border-b shrink-0 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-mono font-bold truncate">{selectedStack.name}</h2>
                  <Badge variant={getStatusBadgeVariant(selectedStack.status)} className="capitalize shrink-0">
                    {selectedStack.status}
                  </Badge>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {selectedStack.services} {selectedStack.services === 1 ? 'service' : 'services'}
                  </Badge>
                  {selectedStack.updateAvailable && (
                    <Badge variant="outline" className="text-xs shrink-0 border-amber-500 text-amber-500 gap-1">
                      <RefreshCw className="w-3 h-3" />
                      Update available
                    </Badge>
                  )}
                  {selectedStack.autoUpdate && (
                    <Badge variant="outline" className="text-xs shrink-0 border-primary text-primary gap-1">
                      <Zap className="w-3 h-3" />
                      Auto Update
                    </Badge>
                  )}
                </div>

                {parsedServices.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    {parsedServices.map((svc) => {
                      const container = serviceContainerByName.get(svc.name)
                      const shellCommand = container
                        ? `Open interactive shell in ${container.name}`
                        : 'No running container for this service'
                      return (
                        <div key={svc.name} className="flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/20 px-2 py-1 min-w-0 max-w-full">
                          <button
                            type="button"
                            onClick={() => handleOpenServiceShell(svc.name)}
                            className="font-mono text-xs font-semibold truncate hover:text-primary"
                          >
                            {svc.name}
                          </button>
                          <span className="text-xs text-muted-foreground">-&gt;</span>
                          <span className="font-mono text-[11px] text-muted-foreground truncate" title={svc.image || 'No image set'}>{svc.image || 'no-image'}</span>
                          {svc.ports.map((p, i) => (
                            <Tooltip key={`${svc.name}-${p.host}-${i}`}>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="flex items-center gap-0.5 font-mono text-[10px] px-1.5 py-0.5 rounded border border-border/60 hover:border-primary hover:text-primary transition-colors"
                                  onClick={() => window.open(`http://${window.location.hostname}:${p.host}`, '_blank', 'noopener,noreferrer')}
                                >
                                  :{p.host}
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs font-mono">
                                {`http://${window.location.hostname}:${p.host}`}
                              </TooltipContent>
                            </Tooltip>
                          ))}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="font-mono text-xs px-1 py-0.5 rounded border border-border/60 hover:border-primary hover:text-primary transition-colors"
                                onClick={() => handleOpenServiceShell(svc.name)}
                              >
                                &gt;_
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">{shellCommand}</TooltipContent>
                          </Tooltip>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Operation Terminal */}
              {(isOperating || (operationDone && opLines.length > 0)) && (
                <div className="rounded-lg border border-border/60 bg-black/80 shrink-0 flex flex-col h-44 min-h-0 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/30 shrink-0">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className={`text-xs font-mono ${operationDone && operationError ? 'text-red-400' : 'text-muted-foreground'}`}>
                        {isOperating ? `${currentOperation}...` : currentOperation}
                      </span>
                      {isOperating && <Loader2 className="w-3 h-3 animate-spin text-blue-400" />}
                      {operationDone && !isOperating && !operationError && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                      {operationDone && !isOperating && operationError && <XCircle className="w-3 h-3 text-red-500" />}
                    </div>
                    <button
                      onClick={() => { setIsOperating(false); setOperationDone(false); setOperationError(null) }}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div ref={operationTerminalRef} className="overflow-y-auto flex-1 min-h-0 p-2">
                    <div className="font-mono text-xs space-y-0.5 whitespace-pre-wrap break-all">
                      {opLines.map((line, i) => (
                        <div key={i} className={
                          line.startsWith('✅') || line.includes('successfully') ? 'text-green-400' :
                          line.startsWith('[+]') ? 'text-cyan-400 font-semibold' :
                          line.startsWith('❌') || line.startsWith('🔴') || line.includes('failed') ? 'text-red-400' :
                          line.startsWith('⚠') || line.includes('warn') || line.includes('Warning') ? 'text-yellow-400' :
                          line.startsWith('ℹ️') || line.includes('Pulling') || line.includes('Pulled') ? 'text-blue-400' :
                          line.startsWith('•') ? 'text-foreground/80' :
                          line.includes('✓') || line.includes('Started') || line.includes('Healthy') || line.includes('Created') || line.includes('Removed') ? 'text-green-400' :
                          line.includes('Stopped') ? 'text-amber-400' :
                          'text-foreground/70'
                        }>
                          {line}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Two-Panel Editor */}
              <div className="flex-1 flex gap-3 min-h-0">

                {/* LEFT PANEL: File Editor */}
                <div className="flex flex-col min-w-0 min-h-0" style={{ flex: '0 0 55%' }}>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1.5 mb-2 shrink-0 flex-wrap">
                    {(selectedStack.status === 'running' || selectedStack.status === 'deploying') ? (
                      <>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="outline" onClick={() => restartActionMutation.mutate(selectedStack.id)} disabled={isOperating} className="gap-1 text-xs">
                              <RotateCw className="w-3.5 h-3.5" />
                              Restart
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs font-mono">docker compose restart</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="outline" onClick={() => stopActionMutation.mutate(selectedStack.id)} disabled={isOperating} className="gap-1 text-xs">
                              <Square className="w-3.5 h-3.5" />
                                Stop
                            </Button>
                          </TooltipTrigger>
                            <TooltipContent className="text-xs font-mono">docker compose stop (containers remain created and can auto-start on daemon restart)</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="outline" onClick={() => deactivateActionMutation.mutate(selectedStack.id)} disabled={isOperating} className="gap-1 text-xs">
                              <XCircle className="w-3.5 h-3.5" />
                                Deactivate
                            </Button>
                          </TooltipTrigger>
                            <TooltipContent className="text-xs font-mono">docker compose down (stops and removes compose-managed containers/networks)</TooltipContent>
                        </Tooltip>
                      </>
                    ) : (
                      <>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" onClick={() => deployActionMutation.mutate(selectedStack.id)} disabled={isOperating} className="gap-1 text-xs">
                              <Play className="w-3.5 h-3.5" />
                              Start
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs font-mono">docker compose up -d</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="outline" onClick={() => recreateActionMutation.mutate(selectedStack.id)} disabled={isOperating} className="gap-1 text-xs">
                              <History className="w-3.5 h-3.5" />
                              Recreate
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs font-mono">docker compose up -d --force-recreate</TooltipContent>
                        </Tooltip>
                      </>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateImagesMutation.mutate(selectedStack.id)}
                          disabled={isOperating || updateImagesMutation.isPending}
                          className="gap-1 text-xs"
                        >
                          {updateImagesMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                          Update
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs font-mono">docker compose --project-name &lt;stack&gt; --file &lt;temp-compose&gt; up -d --pull always</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="destructive" onClick={() => setShowDeleteConfirm(true)} disabled={isOperating} className="gap-1 text-xs">
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs font-mono">Removes stack from THC database (does not delete files by itself)</TooltipContent>
                    </Tooltip>
                  </div>

                  {/* File tab bar */}
                  <div className="flex items-center gap-1 mb-2 shrink-0 flex-wrap">
                    {/* Source indicator */}
                    {stackDetail !== undefined && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono shrink-0 border ${
                            usingHostPath
                              ? 'border-green-500/40 text-green-400 bg-green-500/10'
                              : 'border-yellow-500/40 text-yellow-400 bg-yellow-500/10'
                          }`}>
                            <HardDriveDownload className="w-2.5 h-2.5" />
                            {usingHostPath ? 'HOST' : 'DB'}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs max-w-60">
                          {usingHostPath
                            ? `Files are read/written directly on the host at ${selectedStack.stackPath}. Changes you make here persist on disk.`
                            : 'Stack path is not mounted — edits are stored in the database only. Ensure the stacks volume is mounted to persist changes on host.'}
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {/* compose.yml tab */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setActiveFile('compose')}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono transition-colors ${activeFile === 'compose' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                        >
                          <FileCode className="w-3 h-3" />
                          compose.yml
                          {isDirty && activeFile === 'compose' && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Edit the compose file used by docker compose commands</TooltipContent>
                    </Tooltip>

                    {/* .env tab */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setActiveFile('env')}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono transition-colors ${activeFile === 'env' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                        >
                          <File className="w-3 h-3" />
                          .env
                          {isDirty && activeFile === 'env' && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Edit environment variables passed to compose services</TooltipContent>
                    </Tooltip>

                    {/* Other files */}
                    {otherFiles.map((f: any) => (
                      <Tooltip key={f.path}>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => { setActiveFile(f.path); setIsDirty(false) }}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono transition-colors ${activeFile === f.path ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                          >
                            <FileText className="w-3 h-3" />
                            {f.name}
                            {isDirty && activeFile === f.path && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">Open file {f.name} from stack directory</TooltipContent>
                      </Tooltip>
                    ))}
                  </div>

                  {/* YAML error */}
                  {yamlError && activeFile === 'compose' && (
                    <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/5 px-3 py-2 mb-2 shrink-0">
                      <AlertTriangle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                      <p className="text-xs text-destructive font-mono break-all">{yamlError}</p>
                    </div>
                  )}

                  {/* External change banner */}
                  {hasExternalChanges && (
                    <div className="flex items-start gap-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 mb-2 shrink-0">
                      <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-yellow-300">External change detected on host</p>
                        <p className="text-xs text-yellow-400/80 mt-0.5">The compose file on disk differs from the DB version. Someone edited it directly on the host.</p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 border-yellow-500/40 text-yellow-300 hover:bg-yellow-500/20 px-2"
                              onClick={() => {
                                if (stackDetail?.diskComposeContent) setComposeContent(stackDetail.diskComposeContent)
                                if (stackDetail?.diskEnvContent !== null && stackDetail?.diskEnvContent !== undefined) setEnvContent(stackDetail.diskEnvContent)
                                setExternalChangeDismissed(true)
                                setIsDirty(true)
                                toast.info('Loaded disk version into editor')
                              }}>
                              <HardDriveDownload className="w-2.5 h-2.5" />Load Disk to Editor
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs">Load on-disk content into editor (does not save yet)</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" className="h-6 text-[10px] gap-1 px-2"
                              disabled={syncFromDiskMutation.isPending}
                              onClick={() => syncFromDiskMutation.mutate()}>
                              {syncFromDiskMutation.isPending ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <RefreshCw className="w-2.5 h-2.5" />}Sync Disk to Database
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs">Save disk version to DB + create version snapshot</TooltipContent>
                        </Tooltip>
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => setExternalChangeDismissed(true)}>✕</Button>
                      </div>
                    </div>
                  )}

                  {/* Port conflict warning */}
                  {portConflicts.length > 0 && (
                    <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/5 px-3 py-2 mb-2 shrink-0">
                      <AlertCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                      <p className="text-xs text-destructive">Port conflict: {portConflicts.join(', ')} already in use by another stack</p>
                    </div>
                  )}

                  {/* Editor - YAML highlighting for compose, plain textarea for env/other */}
                  {(activeFile === 'compose')
                     ? <YamlEditor value={composeContent} onChange={v => handleEditorChange(v)} minHeight="100%" className={`flex-1 ${yamlError ? 'border-destructive' : ''}`} />
                    : <Textarea value={editorValue} onChange={e => handleEditorChange(e.target.value)} className="flex-1 font-mono text-xs resize-none min-h-0" spellCheck={false} placeholder={activeFile === 'env' ? 'KEY=value' : ''} />
                  }

                  {/* Footer: ports + git + save */}
                  <div className="flex items-center justify-between pt-2 mt-2 border-t shrink-0 gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      {gitStatus?.configured && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => syncGitMutation.mutate(selectedStack.id)}
                              disabled={syncGitMutation.isPending}
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                              {syncGitMutation.isPending
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <GitBranch className="w-3 h-3" />}
                              <span className="font-mono">{gitStatus.branch}</span>
                              {gitStatus.status === 'modified' && <span className="text-amber-400 text-[10px]">*</span>}
                              {gitStatus.status === 'in_sync' && <span className="text-green-400 text-[10px]">*</span>}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs max-w-[220px]">
                            <p className="truncate">{gitStatus.lastCommitMessage || 'No commits'}</p>
                            <p className="text-muted-foreground mt-0.5">Click to git pull</p>
                          </TooltipContent>
                        </Tooltip>
                      )}

                      {isDirty && <span className="text-amber-500 font-mono text-xs">* Unsaved</span>}
                    </div>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          onClick={handleSave}
                          disabled={!isDirty || updateStackMutation.isPending || saveFileMutation.isPending || (activeFile === 'compose' && !!yamlError)}
                          className="gap-1.5 text-xs"
                        >
                          {(updateStackMutation.isPending || saveFileMutation.isPending)
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Save className="w-3.5 h-3.5" />}
                          Save
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Save changes to compose and .env files</TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                {/* RIGHT PANEL: Logs or Compare */}
                <div className="flex flex-col min-w-0 min-h-0 flex-1">

                  {/* Panel toggle header */}
                  <div className="flex items-center gap-1 mb-2 shrink-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setRightPanel('logs')}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${rightPanel === 'logs' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                        >
                          <Terminal className="w-3 h-3" />
                          Logs
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">View container logs from this stack</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setRightPanel('compare')}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${rightPanel === 'compare' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                        >
                          <Diff className="w-3 h-3" />
                          Compare
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Compare current with past versions</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setRightPanel('backup')}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${rightPanel === 'backup' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                        >
                          <Archive className="w-3 h-3" />
                          Backup
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Configure backup settings for this stack</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setRightPanel('autoupdate')}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${rightPanel === 'autoupdate' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                        >
                          <Zap className="w-3 h-3" />
                          Auto Update
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Configure automatic image updates</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setRightPanel('ai')}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${rightPanel === 'ai' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                        >
                          <WandSparkles className="w-3 h-3" />
                          AI
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Open AI helper for compose review and generation</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setRightPanel('conflicts')}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${rightPanel === 'conflicts' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                        >
                          <AlertCircle className="w-3 h-3" />
                          Conflicts
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Check port and service-name conflicts against other stacks</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setRightPanel('reference')}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${rightPanel === 'reference' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                        >
                          <BookOpen className="w-3 h-3" />
                          Reference
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">View another stack's compose as reference</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setRightPanel('helpers')}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${rightPanel === 'helpers' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                        >
                          <Clipboard className="w-3 h-3" />
                          Helpers
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Global copy-paste helpers from Settings</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setRightPanel('files')}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${rightPanel === 'files' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                        >
                          <FolderOpen className="w-3 h-3" />
                          Files
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Browse all files in this stack's directory</TooltipContent>
                    </Tooltip>
                    <div className="flex-1" />
                    {rightPanel === 'logs' && (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {stackContainers.length} container{stackContainers.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {rightPanel === 'compare' && versions.length > 0 && (
                      <Select
                        value={compareVersion?.toString() ?? ''}
                        onValueChange={v => setCompareVersion(v ? parseInt(v) : null)}
                      >
                        <SelectTrigger className="h-6 text-xs w-36">
                          <SelectValue placeholder="Select version..." />
                        </SelectTrigger>
                        <SelectContent>
                          {versions.map((v: any) => (
                            <SelectItem key={v.id} value={v.version.toString()}>
                              v{v.version} - {new Date(v.createdAt).toLocaleDateString()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* LOGS PANEL */}
                  {rightPanel === 'logs' && (
                    <div className="flex-1 rounded-lg border bg-black/70 overflow-hidden flex flex-col min-h-0">
                      {stackContainers.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center">
                          <p className="text-muted-foreground text-xs font-mono">
                            {selectedStack.status === 'running' ? 'Connecting to containers...' : 'Stack is not running'}
                          </p>
                        </div>
                      ) : logLines.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center">
                          <p className="text-muted-foreground text-xs font-mono">Waiting for log output...</p>
                        </div>
                      ) : (
                        <div ref={logsViewportRef} className="flex-1 overflow-y-auto">
                          <div className="font-mono text-xs space-y-0.5 p-2">
                            {logLines.slice(-500).map((line, i) => (
                              <div key={i} className="flex gap-2 leading-relaxed min-w-0">
                                <span className="text-amber-500 shrink-0">[{line.container}]</span>
                                <span className="text-foreground/75 break-all min-w-0">{line.text}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* COMPARE PANEL */}
                  {rightPanel === 'compare' && (
                    <div className="flex-1 flex flex-col min-h-0 gap-2">
                      {compareVersionObj ? (
                        <div className="flex-1 flex flex-col min-h-0">
                          <div className="flex items-center justify-between mb-1 shrink-0">
                            <label className="text-xs font-semibold text-muted-foreground">
                              v{compareVersionObj.version} &middot; {new Date(compareVersionObj.createdAt).toLocaleDateString()}
                              {compareVersionObj.description && <span className="ml-1 text-muted-foreground/60">- {compareVersionObj.description}</span>}
                            </label>
                            <button onClick={() => setCompareVersion(null)} className="text-muted-foreground hover:text-foreground">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                          {/* Diff view */}
                          <div className="flex-1 overflow-y-auto font-mono text-[11px] bg-muted/20 rounded-lg p-2 border border-border/40 min-h-0">
                            {diffLib.diffLines(compareVersionObj.composeContent || '', composeContent).map((part, i) => (
                              <div
                                key={i}
                                className={`whitespace-pre-wrap leading-5 px-1 rounded-sm ${
                                  part.added
                                    ? 'bg-green-500/15 text-green-400'
                                    : part.removed
                                    ? 'bg-red-500/15 text-red-400 line-through opacity-60'
                                    : 'text-muted-foreground'
                                }`}
                              >
                                {part.added ? '+ ' : part.removed ? '- ' : '  '}{part.value}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 overflow-y-auto">
                          {versions.length === 0 ? (
                            <div className="flex items-center justify-center h-full text-muted-foreground text-xs font-mono">No versions saved yet</div>
                          ) : (
                            <div className="space-y-2">
                              <p className="text-xs text-muted-foreground mb-3">Select a version to compare with current</p>
                              {versions.map((v: any) => (
                                <Card
                                  key={v.id}
                                  className="p-2.5 cursor-pointer hover:bg-accent transition-colors"
                                  onClick={() => setCompareVersion(v.version)}
                                >
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <p className="font-mono text-sm font-semibold">v{v.version}</p>
                                      <p className="text-xs text-muted-foreground">{new Date(v.createdAt).toLocaleString()}</p>
                                      {v.description && <p className="text-xs text-muted-foreground/60 mt-0.5">{v.description}</p>}
                                    </div>
                                    <Diff className="w-4 h-4 text-muted-foreground" />
                                  </div>
                                </Card>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* BACKUP CONFIG (edit mode) */}
                  {rightPanel === 'backup' && (
                    <div className="flex-1 overflow-y-auto space-y-3">
                      {stackBackupConfig ? (
                        <EditBackupPanel
                          config={stackBackupConfig}
                          onSave={cfg => saveBackupMutation.mutate({ stackId: selectedStack.id, cfg })}
                          isSaving={saveBackupMutation.isPending}
                          stackId={selectedStack.id}
                        />
                      ) : (
                        <div className="flex items-center justify-center h-32 text-muted-foreground text-xs font-mono">Loading backup config...</div>
                      )}
                    </div>
                  )}

                  {rightPanel === 'ai' && (
                    <ComposeAiPanel
                      composeContent={composeContent}
                      envContent={envContent}
                      onApplyCompose={(compose) => {
                        setComposeContent(compose)
                        setActiveFile('compose')
                        setIsDirty(true)
                        validateYAML(compose)
                      }}
                    />
                  )}

                  {/* AUTO UPDATE (edit mode) */}
                  {rightPanel === 'autoupdate' && (
                    <div className="flex-1 overflow-y-auto space-y-3">
                      {/* Enable toggle */}
                      <div className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-muted/20">
                        <div>
                          <Label className="text-sm font-semibold">Auto Update</Label>
                          <p className="text-xs text-muted-foreground">
                            Include this stack in the global automatic update schedule
                          </p>
                        </div>
                        <Switch
                          checked={selectedStack.autoUpdate || false}
                          onCheckedChange={checked => updateStackMutation.mutate({ id: selectedStack.id, autoUpdate: checked })}
                        />
                      </div>

                      {/* Next window info */}
                      {settings?.autoUpdateSchedule && (
                        <Card className="p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Next Update Window</Label>
                          </div>
                          {settings.autoUpdateSchedule.enabled ? (
                            <div>
                              <p className="text-sm font-mono">{toHumanCronLabel(settings.autoUpdateSchedule.cron)}</p>
                              <p className="text-xs text-muted-foreground font-mono mt-0.5">{settings.autoUpdateSchedule.cron}</p>
                              {settings.globalUpdateFreeze && (
                                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" />
                                  Global Update Freeze is active - updates paused
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">No schedule configured - go to Settings &gt; Update Management</p>
                          )}
                        </Card>
                      )}

                      {/* Run backup before update */}
                      <div className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-muted/20">
                        <div>
                          <Label className="text-sm font-semibold">Run Backup Before Update</Label>
                          <p className="text-xs text-muted-foreground">
                            Automatically back up this stack immediately before each auto update
                          </p>
                        </div>
                        <Switch
                          checked={selectedStack.runBackupBeforeUpdate || false}
                          onCheckedChange={checked => updateStackMutation.mutate({ id: selectedStack.id, runBackupBeforeUpdate: checked })}
                        />
                      </div>
                      {selectedStack.runBackupBeforeUpdate && !stackBackupConfig?.enabled && (
                        <p className="text-xs text-amber-500 px-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          Configure backup settings in the Backup tab to enable pre-update backups
                        </p>
                      )}

                      <Card className="p-3 space-y-2">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent Update History</Label>
                        {updateHistory.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No update actions recorded yet.</p>
                        ) : (
                          <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                            {updateHistory.map((entry: any) => (
                              <div key={entry.id} className="rounded border border-border/40 bg-muted/20 px-2 py-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-mono">{entry.actionLabel || entry.action}</span>
                                  <span className="text-[10px] text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</span>
                                </div>
                                <div className="mt-1 flex items-center gap-2">
                                  <Badge variant="outline" className="text-[10px] py-0 px-1.5">{entry.trigger || 'Manual'}</Badge>
                                  <Badge variant={entry.isUpdate ? 'default' : 'secondary'} className="text-[10px] py-0 px-1.5">
                                    {entry.isUpdate ? 'Update flow' : 'Operational action'}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </Card>
                    </div>
                  )}

                  {/* PORT CONFLICTS (edit mode) */}
                  {rightPanel === 'conflicts' && (() => {
                    const editPorts = extractPorts(composeContent)
                    const compareStacks = stacks.filter((s) => s.id !== selectedStack.id)
                    return (
                      <div className="flex-1 overflow-y-auto space-y-3">
                        {(() => {
                          const SYSTEM_PORTS: Record<number, string> = {
                            20: 'FTP data', 21: 'FTP control', 22: 'SSH', 23: 'Telnet',
                            25: 'SMTP', 53: 'DNS', 67: 'DHCP', 68: 'DHCP', 80: 'HTTP',
                            110: 'POP3', 123: 'NTP', 143: 'IMAP', 161: 'SNMP', 194: 'IRC',
                            443: 'HTTPS', 445: 'SMB', 465: 'SMTPS', 587: 'SMTP submission',
                            993: 'IMAPS', 995: 'POP3S',
                            3306: 'MySQL', 5432: 'PostgreSQL', 6379: 'Redis', 27017: 'MongoDB',
                          }
                          const sysHits = editPorts.filter(p => SYSTEM_PORTS[p])
                          if (sysHits.length === 0) return null
                          return (
                            <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/8 px-3 py-2 space-y-1">
                              <p className="text-[10px] font-semibold text-yellow-400 uppercase tracking-wide flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Well-known port{sysHits.length > 1 ? 's' : ''} in use
                              </p>
                              {sysHits.map(p => (
                                <p key={p} className="text-xs text-yellow-300 font-mono">
                                  :{p} <span className="text-yellow-400/70">- {SYSTEM_PORTS[p]}</span>
                                </p>
                              ))}
                              <p className="text-[10px] text-yellow-400/60 mt-1">These ports are typically reserved by the OS or standard services. Consider using ports above 1024.</p>
                            </div>
                          )
                        })()}

                        {editPorts.length === 0 ? (
                          <div className="flex items-center justify-center h-24">
                            <p className="text-xs text-muted-foreground font-mono">No ports defined in compose yet</p>
                          </div>
                        ) : (
                          <>
                            <p className="text-xs text-muted-foreground">Ports declared in your compose:</p>
                            {editPorts.map(port => {
                              const conflicts = compareStacks.filter((s) => getStackPortList(s).includes(port))
                              return (
                                <div key={port} className={`flex items-center justify-between px-3 py-2 rounded-lg border ${conflicts.length > 0 ? 'border-destructive/60 bg-destructive/5' : 'border-border/40 bg-muted/20'}`}>
                                  <span className="font-mono text-sm font-semibold">:{port}</span>
                                  {conflicts.length > 0 ? (
                                    <span className="text-xs text-destructive flex items-center gap-1">
                                      <AlertCircle className="w-3 h-3" />
                                      Used by <strong className="ml-0.5">{conflicts.map(c => c.name).join(', ')}</strong>
                                    </span>
                                  ) : (
                                    <span className="text-xs text-green-500">&#10003; Available</span>
                                  )}
                                </div>
                              )
                            })}
                          </>
                        )}

                        <p className="text-xs text-muted-foreground pt-1 pb-1">Service name conflicts across other stacks:</p>
                        {activeServiceNames.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">No services defined in compose yet</p>
                        ) : (
                          <div className="space-y-1.5">
                            {activeServiceNames.map((serviceName) => {
                              const clashes = serviceNameConflicts.get(serviceName) || []
                              return (
                                <div key={serviceName} className={`flex items-center justify-between px-3 py-2 rounded-lg border ${clashes.length > 0 ? 'border-amber-500/60 bg-amber-500/5' : 'border-border/40 bg-muted/20'}`}>
                                  <span className="font-mono text-xs font-semibold">{serviceName}</span>
                                  {clashes.length > 0 ? (
                                    <span className="text-xs text-amber-400 flex items-center gap-1">
                                      <AlertTriangle className="w-3 h-3" />
                                      Reused by <strong className="ml-0.5">{clashes.join(', ')}</strong>
                                    </span>
                                  ) : (
                                    <span className="text-xs text-green-500">Unique</span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}

                        <p className="text-[10px] text-muted-foreground">Service-name reuse is valid in Docker, but unique names across stacks reduce operator mistakes and improve diagnostics clarity.</p>

                        <p className="text-xs text-muted-foreground pt-1 pb-1">All ports in use across other stacks:</p>
                        <div className="flex flex-wrap gap-1">
                          {compareStacks.flatMap((s) => getStackPortList(s).map((p) => ({ p, name: s.name }))).map(({ p, name }, i) => (
                            <Tooltip key={i}>
                              <TooltipTrigger asChild>
                                <Badge variant={editPorts.includes(p) ? 'destructive' : 'outline'} className="font-mono text-xs cursor-default">:{p}</Badge>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs">{name}</TooltipContent>
                            </Tooltip>
                          ))}
                          {compareStacks.every((s) => getStackPortList(s).length === 0) && (
                            <span className="text-xs text-muted-foreground italic">No ports in use across other stacks</span>
                          )}
                        </div>

                        <p className="text-xs text-muted-foreground pt-1 pb-1">Recommended homelab ranges:</p>
                        <div className="rounded-lg border border-border/40 bg-muted/10 px-3 py-2 space-y-1.5">
                          {[
                            { range: '1024-1999', label: 'General homelab / self-hosted services' },
                            { range: '3000-3999', label: 'Web UIs and dashboards (Grafana 3000, THC 3210)' },
                            { range: '5000-5999', label: 'Dev and build tools (Registry 5000)' },
                            { range: '8000-8999', label: 'Proxies and web apps (nginx 8080, Traefik 8443)' },
                            { range: '9000-9999', label: 'Monitoring (Portainer 9000, Prometheus 9090)' },
                            { range: '10000-19999', label: 'Custom app ports' },
                          ].map(({ range, label }) => (
                            <div key={range} className="flex items-baseline gap-2">
                              <span className="font-mono text-[10px] text-primary/80 shrink-0 w-20">{range}</span>
                              <span className="text-[10px] text-muted-foreground">{label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })()}

                  {/* STACK REFERENCE (edit mode) */}
                  {rightPanel === 'reference' && (
                    <div className="flex-1 flex flex-col min-h-0 gap-2">
                      <Select value={refStackId ?? ''} onValueChange={v => setRefStackId(v || null)}>
                        <SelectTrigger className="h-7 text-xs shrink-0">
                          <SelectValue placeholder="Pick a stack to reference..." />
                        </SelectTrigger>
                        <SelectContent>
                          {stacks.filter(s => s.id !== selectedStack.id).map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {refStackId ? (
                        <YamlEditor value={refStackCompose} readOnly minHeight="180px" className="flex-1" />
                      ) : (
                        <div className="flex-1 flex items-center justify-center">
                          <p className="text-xs text-muted-foreground text-center">Select a stack above to view its compose as reference</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* COPY-PASTE HELPERS (edit mode) */}
                  {rightPanel === 'helpers' && (
                    <div className="flex-1 overflow-y-auto space-y-2">
                      <p className="text-xs text-muted-foreground mb-1">Global helpers from Settings. Click to copy.</p>
                      {(settings?.copyPasteHelpers ?? []).length === 0 ? (
                        <p className="text-xs text-muted-foreground italic px-1">No helpers configured. Add them in Settings ? Helpers.</p>
                      ) : (
                        (settings?.copyPasteHelpers ?? []).map(h => (
                          <div key={h.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border/40 bg-muted/20">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold">{h.label}</p>
                              <p className="font-mono text-xs text-muted-foreground truncate">{h.value}</p>
                            </div>
                            <button
                              onClick={() => { navigator.clipboard.writeText(h.value); toast.success('Copied') }}
                              className="text-muted-foreground hover:text-foreground shrink-0"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))
                      )}

                      <div className="pt-3 space-y-2">
                        <p className="text-xs text-muted-foreground mb-1">Manually created networks from Networks. Create them once, then reference them in this stack as external networks.</p>
                        {manualNetworkHelpers.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic px-1">No manually managed networks found.</p>
                        ) : (
                          manualNetworkHelpers.map((h) => (
                            <div key={h.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border/40 bg-muted/20">
                              <div className="min-w-0">
                                <p className="text-xs font-semibold">{h.label}</p>
                                <p className="font-mono text-xs text-muted-foreground truncate">{h.value}</p>
                                {h.meta && <p className="text-[10px] text-muted-foreground/70">{h.meta}</p>}
                              </div>
                              <button
                                onClick={() => { navigator.clipboard.writeText(h.value); toast.success('Copied network helper') }}
                                className="text-muted-foreground hover:text-foreground shrink-0"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>

                      <div className="pt-3 space-y-2">
                        <p className="text-xs text-muted-foreground mb-1">Networks discovered from stacks. These are not manually managed, but can still be reused as external networks if they remain available.</p>
                        {discoveredNetworkHelpers.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic px-1">No stack-created reusable networks found.</p>
                        ) : (
                          discoveredNetworkHelpers.map((h) => (
                            <div key={h.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border/40 bg-muted/10">
                              <div className="min-w-0">
                                <p className="text-xs font-semibold">{h.label}</p>
                                <p className="font-mono text-xs text-muted-foreground truncate">{h.value}</p>
                                {h.meta && <p className="text-[10px] text-muted-foreground/70">{h.meta}</p>}
                              </div>
                              <button
                                onClick={() => { navigator.clipboard.writeText(h.value); toast.success('Copied network helper') }}
                                className="text-muted-foreground hover:text-foreground shrink-0"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* FILE BROWSER (edit mode) */}
                  {rightPanel === 'files' && (
                    <div className="flex-1 overflow-y-auto space-y-0.5">
                      {(stackFiles as any[]).length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-32 gap-2">
                          <FolderOpen className="w-8 h-8 text-muted-foreground opacity-40" />
                          <p className="text-xs text-muted-foreground">No files found in stack directory</p>
                          <p className="text-[10px] text-muted-foreground/60">Stack may use DB-only storage</p>
                        </div>
                      ) : (
                        flatFiles.map((f: any, i: number) => (
                          <button
                            key={f.path ?? i}
                            onClick={() => {
                              if (f.type === 'directory') return
                              setActiveFile(f.path)
                              setIsDirty(false)
                            }}
                            disabled={f.type === 'directory'}
                            className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-xs text-left transition-colors ${
                              f.type === 'directory'
                                ? 'text-muted-foreground/70 cursor-default'
                                : activeFile === f.path
                                  ? 'bg-primary text-primary-foreground'
                                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                            }`}
                            style={{ paddingLeft: `${8 + (f.depth ?? 0) * 14}px` }}
                          >
                            {f.type === 'directory'
                              ? <Folder className="w-3 h-3 shrink-0 text-blue-400" />
                              : <FileText className="w-3 h-3 shrink-0" />
                            }
                            <span className="font-mono truncate">{f.name}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ─── Restart After Save Dialog ─── */}
      <AlertDialog open={showRestartAfterSaveConfirm} onOpenChange={setShowRestartAfterSaveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply Saved Changes Now?</AlertDialogTitle>
            <AlertDialogDescription>
              Compose/.env files were saved successfully, but running containers still use the previous runtime config.
              <span className="block mt-2 font-mono text-xs text-muted-foreground">Command: docker compose restart</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogCancel>Later</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (!selectedStack) return
              onRestartStack(selectedStack.id)
              setShowRestartAfterSaveConfirm(false)
            }}
          >
            Restart Now
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Delete Confirm Dialog (Step 1) ─── */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Stack from THC?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <span className="font-mono font-semibold">{selectedStack?.name}</span> from the THC database and stack list.
              This does not automatically remove compose files from disk.
              {selectedStack?.status === 'running' && (
                <span className="block mt-2 text-amber-500 text-xs font-mono">Warning: stack is currently running. Deactivate first to avoid orphaned running containers.</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowDeleteConfirm(false)
                setShowDeleteFinalConfirm(true)
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Delete Confirm Dialog (Step 2) ─── */}
      <AlertDialog open={showDeleteFinalConfirm} onOpenChange={setShowDeleteFinalConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Final Confirmation</AlertDialogTitle>
            <AlertDialogDescription>
              Final step: delete stack record <span className="font-mono font-semibold">{selectedStack?.name}</span> from THC.
              <span className="block mt-2 font-mono text-xs text-muted-foreground">API call: DELETE /api/stacks/{selectedStack?.id}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => { if (selectedStack) deleteStackMutation.mutate(selectedStack.id) }}
            disabled={deleteStackMutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteStackMutation.isPending ? 'Deleting...' : 'Delete Now'}
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>

      <ContainerShellDialog
        open={!!shellTarget}
        onOpenChange={(open) => { if (!open) setShellTarget(null) }}
        containerId={shellTarget?.containerId}
        containerName={shellTarget?.containerName}
        serviceName={shellTarget?.serviceName}
        image={shellTarget?.image}
      />
    </TooltipProvider>
  )
}

