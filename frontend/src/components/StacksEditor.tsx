import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
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
} from 'lucide-react'
import type { Stack, BackupConfig } from '@/lib/types'
import { toast } from 'sonner'
import * as api from '@/lib/api'
import { useSettings } from '@/hooks/useSettings'
import { ScheduleEditor } from '@/components/ScheduleEditor'
import { ComposeAiPanel } from '@/components/ComposeAiPanel'

// ── FullBackupPanel — matches BackupManagementDialog options ────────────────
interface FullBackupPanelProps {
  config: Partial<BackupConfig>
  onChange: (cfg: Partial<BackupConfig>) => void
  onSave?: () => void
  isSaving?: boolean
  onRunNow?: () => void
  isRunning?: boolean
}

function FullBackupPanel({ config: cfg, onChange: u, onSave, isSaving, onRunNow, isRunning }: FullBackupPanelProps) {
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
                <ScheduleEditor value={cfg.cronSchedule || '0 2 * * *'} onChange={v => u({ ...cfg, cronSchedule: v })} />
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
                <Label className="text-xs">Simple (days)</Label>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={cfg.useAdvancedRetention || false} onCheckedChange={() => u({ ...cfg, useAdvancedRetention: true })} />
                <Label className="text-xs">Advanced</Label>
              </label>
            </div>
            {!cfg.useAdvancedRetention ? (
              <div className="space-y-1">
                <Label className="text-xs">Keep backups for (days)</Label>
                <Input type="number" value={cfg.retentionDays ?? 7}
                  onChange={e => u({ ...cfg, retentionDays: Number(e.target.value) })}
                  className="h-8 text-xs font-mono w-24" min={1} max={365} />
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {(['daily', 'weekly', 'monthly', 'yearly'] as const).map(period => (
                  <div key={period} className="space-y-1">
                    <Label className="text-xs capitalize">{period}</Label>
                    <Input type="number"
                      value={cfg.retentionPolicy?.[period] ?? (period === 'daily' ? 7 : period === 'weekly' ? 4 : period === 'monthly' ? 6 : 2)}
                      onChange={e => u({ ...cfg, retentionPolicy: { daily: 7, weekly: 4, monthly: 6, yearly: 2, ...cfg.retentionPolicy, [period]: Number(e.target.value) } })}
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
                <Label className="text-xs">All attached Docker volumes</Label>
              </label>
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
                <div className="space-y-1">
                  <Label className="text-xs">Container Name</Label>
                  <Input value={cfg.databaseConfig?.containerName || ''}
                    onChange={e => u({ ...cfg, databaseConfig: { ...cfg.databaseConfig, containerName: e.target.value } })}
                    className="h-7 text-xs font-mono" placeholder="postgres-db" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Database Name</Label>
                  <Input value={cfg.databaseConfig?.databaseName || ''}
                    onChange={e => u({ ...cfg, databaseConfig: { ...cfg.databaseConfig, databaseName: e.target.value } })}
                    className="h-7 text-xs font-mono" placeholder="mydb" />
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
                  <Label className="text-xs">Compression Level (1–9)</Label>
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
                <Switch checked={cfg.encrypted ?? false} onCheckedChange={v => u({ ...cfg, encrypted: v })} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-3.5 h-3.5 text-muted-foreground" />
                  <Label className="text-xs">Incremental Backup</Label>
                </div>
                <Switch checked={cfg.incremental ?? false} onCheckedChange={v => u({ ...cfg, incremental: v })} />
              </div>
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

// ── EditBackupPanel (wraps FullBackupPanel with live query) ─────────────────
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
      onSave={() => onSave(local)}
      isSaving={isSaving}
      onRunNow={() => runMutation.mutate()}
      isRunning={runMutation.isPending}
    />
  )
}

// â”€â”€ WebSocket URL helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function wsUrl(path: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}${path}`
}

// â”€â”€ WebSocket-based stack log aggregation hook â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        setLines(prev => [...prev, { container: name, text: 'âš  WebSocket error', ts: Date.now() }])
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
  containers: { id: string; name: string; stackId?: string; ports?: string[] }[]
  onDeployStack: (id: string) => void
  onStopStack: (id: string) => void
  onRestartStack: (id: string) => void
}

type SortedStackGroup = 'running' | 'stopped' | 'failed'

export function StacksEditor({
  stacks,
  externalStacks = [],
  onDeployStack,
  onStopStack,
  onRestartStack,
}: StacksEditorProps) {
  // â”€â”€ Core state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  // Two-panel state
  const [activeFile, setActiveFile] = useState<'compose' | 'env' | string>('compose')
  const [rightPanel, setRightPanel] = useState<'logs' | 'compare' | 'backup' | 'autoupdate' | 'ai'>('logs')
  const [compareVersion, setCompareVersion] = useState<number | null>(null)
  // Operation terminal
  const [isOperating, setIsOperating] = useState(false)
  const [operationDone, setOperationDone] = useState(false)
  const logsEndRef = useRef<HTMLDivElement>(null)
  // Create mode right panel
  const [createRightPanel, setCreateRightPanel] = useState<'conflicts' | 'reference' | 'volumes' | 'backup' | 'autoupdate' | 'ai'>('conflicts')
  const [refStackId, setRefStackId] = useState<string | null>(null)
  const [createBackupConfig, setCreateBackupConfig] = useState<Partial<BackupConfig>>({
    enabled: false, cronSchedule: '0 2 * * *', retentionDays: 7,
    includeStackFolder: true, includeVolumes: true, includeDatabases: false, useAdvancedRetention: false,
  })
  const qc = useQueryClient()
  const { data: settings } = useSettings()

  // â”€â”€ Queries â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      toast.success('Backup config saved')
    },
    onError: (e: any) => toast.error(`Backup save failed: ${e.message}`),
  })

  // â”€â”€ Sync operation done â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (operation?.done) {
      setIsOperating(false)
      setOperationDone(true)
      qc.invalidateQueries({ queryKey: ['stacks'] })
      qc.invalidateQueries({ queryKey: ['stackContainers', selectedStack?.id] })
    }
  }, [operation?.done])

  // â”€â”€ Sync custom file content â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (rawCustomFile !== undefined) {
      setCustomFileContent(rawCustomFile)
      setIsDirty(false)
    }
  }, [rawCustomFile])

  // â”€â”€ WebSocket logs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const logsEnabled = rightPanel === 'logs' && !!selectedStack && !isCreating
  const logLines = useStackLogs(
    stackContainers.map((c: any) => ({ id: c.id, name: c.name })),
    logsEnabled
  )

  useEffect(() => {
    if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [logLines.length])

  // â”€â”€ Sync stack content when selection changes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    }
  }, [selectedStack?.id])

  // â”€â”€ Mutations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      setCreateBackupConfig({ enabled: false, cronSchedule: '0 2 * * *', retentionDays: 7, includeStackFolder: true, includeVolumes: true, includeDatabases: false, useAdvancedRetention: false })
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
    },
    onError: () => toast.error('Failed to save stack'),
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
      toast.info('Update started - pulling new images...')
    },
    onError: (e: any) => toast.error(e.message || 'Update failed'),
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
    mutationFn: ({ name, stackPath }: { name: string; stackPath: string }) =>
      api.adoptStack(name, stackPath),
    onSuccess: (adopted) => {
      toast.success(`“${adopted.name}” is now managed by THC`)
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

  const extractPorts = (yaml: string): number[] => {
    const matches = yaml.match(/["']?(\d+)["']?\s*:\s*["']?(\d+)["']?/g) || []
    return [...new Set(matches.map(m => parseInt(m.split(':')[0].replace(/['"]/g, ''))))]
  }

  const getPortConflicts = (ports: number[]): number[] => {
    if (!selectedStack) return []
    const portMap = new Map<number, string[]>()
    stacks.forEach(s => (s.ports || []).forEach(p => { if (!portMap.has(p)) portMap.set(p, []); portMap.get(p)!.push(s.name) }))
    return ports.filter(p => (portMap.get(p) || []).some(n => n !== selectedStack.name))
  }

  const parseServices = (yaml: string): Array<{ name: string; ports: Array<{ host: number; container: number }>; image?: string }> => {
    try {
      const doc = YAML.load(yaml) as any
      if (!doc?.services) return []
      return Object.entries(doc.services as Record<string, any>).map(([name, svc]) => {
        const rawPorts: unknown[] = Array.isArray(svc?.ports) ? svc.ports : []
        const ports = rawPorts.flatMap((p): Array<{ host: number; container: number }> => {
          const str = String(p)
          const match = str.match(/(?:[\d.]+:)?(\d+):(\d+)/)
          if (match) return [{ host: parseInt(match[1]), container: parseInt(match[2]) }]
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
        updateStackMutation.mutate({ id: selectedStack.id, composeContent, envContent })
      } else if (activeFile === 'env') {
        updateStackMutation.mutate({ id: selectedStack.id, composeContent, envContent })
      } else {
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
    const order = { running: 0, stopped: 1, failed: 2, deploying: 3 }
    const ao = order[a.status as keyof typeof order] ?? 99
    const bo = order[b.status as keyof typeof order] ?? 99
    return ao !== bo ? ao - bo : a.name.localeCompare(b.name)
  })
  const filteredStacks = sortedStacks.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
  const filteredExternalStacks = externalStacks
    .filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))

  const editorValue = activeFile === 'compose' ? composeContent : activeFile === 'env' ? envContent : customFileContent
  const handleEditorChange = (val: string) => {
    if (activeFile === 'compose') { setComposeContent(val); setIsDirty(true); validateYAML(val) }
    else if (activeFile === 'env') { setEnvContent(val); setIsDirty(true) }
    else { setCustomFileContent(val); setIsDirty(true) }
  }

  const ports = activeFile === 'compose' ? extractPorts(composeContent) : []
  const portConflicts = getPortConflicts(ports)
  const compareVersionObj = versions.find((v: any) => v.version === compareVersion) ?? null
  const otherFiles = (stackFiles as any[]).filter(f => f.type !== 'directory' && f.name !== 'docker-compose.yml' && f.name !== '.env').slice(0, 6)
  const opLines: string[] = operation?.lines || []
  const parsedServices = parseServices(composeContent)
  // Create mode derived
  const newPorts = isCreating ? extractPorts(composeContent) : []
  const refStackCompose = refStackId ? (stacks.find(s => s.id === refStackId) as any)?.composeContent ?? (stacks.find(s => s.id === refStackId) as any)?.compose ?? '' : ''
  const volBase = settings?.volumesBasePath ?? '/data/volumes'

  // Keyboard shortcut: Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); if (isDirty) handleSave() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  // Render
  return (
    <TooltipProvider>
      <div className="flex h-[calc(100vh-200px)] gap-4">

        {/* LEFT SIDEBAR - Stack List */}
        <div className="w-56 flex flex-col gap-3 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search stacks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 font-mono text-sm"
            />
          </div>

          <Button onClick={handleCreateNew} disabled={isCreating} className="w-full gap-2" size="sm">
            <Plus className="w-4 h-4" />
            New Stack
          </Button>

          <ScrollArea className="flex-1 rounded-lg border">
            <div className="p-2 space-y-1.5">
              {filteredStacks.length === 0 && filteredExternalStacks.length === 0 ? (
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
                      className={`p-2 cursor-pointer transition-all ${
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
                            {stack.backupConfig?.enabled && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-[10px] text-blue-400 flex items-center gap-0.5 cursor-default">
                                    <Archive className="w-2.5 h-2.5" />bkp
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="text-xs">
                                  {stack.backupConfig.lastBackupAt
                                    ? `Last backup: ${formatDistanceToNow(new Date(stack.backupConfig.lastBackupAt), { addSuffix: true })}`
                                    : 'Backup enabled — no backup run yet'}
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </div>
                        <span className={`text-[10px] mt-0.5 ${stack.status === 'running' ? 'text-green-500' : stack.status === 'failed' ? 'text-destructive' : 'text-muted-foreground/40'}`}>&#9679;</span>
                      </div>
                    </Card>
                  ))}
                </>
              )}

              {filteredExternalStacks.length > 0 && (
                <>
                  <p className="px-1 pt-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">External Compose Projects</p>
                  {filteredExternalStacks.map(stack => (
                    <Card key={stack.id} className="p-2 border-dashed border-border/60 bg-muted/10">
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
                              <TooltipContent className="text-xs">Detected from Docker Compose labels. Click “Adopt” to manage in THC without moving any files.</TooltipContent>
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
                        <span className={`text-[10px] mt-0.5 ${stack.status === 'running' ? 'text-green-500' : stack.status === 'failed' ? 'text-destructive' : 'text-muted-foreground/40'}`}>&#9679;</span>
                      </div>
                      {stack.stackPath && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full mt-2 h-6 text-[10px] gap-1 border-primary/40 text-primary hover:bg-primary/10"
                          disabled={adoptMutation.isPending}
                          onClick={() => adoptMutation.mutate({ name: stack.name, stackPath: stack.stackPath! })}
                        >
                          <Rocket className="w-3 h-3" />
                          {adoptMutation.isPending ? 'Adopting…' : 'Adopt into THC'}
                        </Button>
                      )}
                    </Card>
                  ))}
                </>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* â•â•â• MAIN AREA â•â•â• */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">

          {isCreating ? (
            /* --- CREATE MODE --- */
            <>
              <div className="flex items-center justify-between gap-3 pb-3 border-b shrink-0">
                <h2 className="text-lg font-mono font-semibold">New Stack</h2>
                <Button variant="outline" size="sm" onClick={() => { setIsCreating(false); setNewStackName(''); setComposeContent(''); setEnvContent(''); setActiveFile('compose'); setIsDirty(false) }} className="gap-1.5">
                  <X className="w-4 h-4" />
                  Cancel
                </Button>
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
                    <button
                      onClick={() => setActiveFile('compose')}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono transition-colors ${activeFile === 'compose' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                    >
                      <FileCode className="w-3 h-3" />
                      compose.yml
                    </button>
                    <button
                      onClick={() => setActiveFile('env')}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono transition-colors ${activeFile === 'env' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                    >
                      <File className="w-3 h-3" />
                      .env
                    </button>
                  </div>
                  {yamlError && activeFile === 'compose' && (
                    <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/5 px-3 py-2 mb-2 shrink-0">
                      <AlertTriangle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                      <p className="text-xs text-destructive font-mono break-all">{yamlError}</p>
                    </div>
                  )}
                  <Textarea
                    value={activeFile === 'env' ? envContent : composeContent}
                    onChange={(e) => {
                      if (activeFile === 'env') { setEnvContent(e.target.value) }
                      else { setComposeContent(e.target.value); setIsDirty(true); validateYAML(e.target.value) }
                    }}
                    className={`flex-1 font-mono text-xs resize-none min-h-0 ${yamlError && activeFile === 'compose' ? 'border-destructive' : ''}`}
                    spellCheck={false}
                    placeholder={activeFile === 'env' ? 'MY_VAR=value\nANOTHER_VAR=value' : ''}
                  />
                  <div className="flex items-center justify-end gap-2 pt-2 border-t shrink-0 mt-2">
                    <Button
                      onClick={handleSave}
                      disabled={!newStackName.trim() || createStackMutation.isPending || !!yamlError}
                      className="gap-1.5"
                      size="sm"
                    >
                      {createStackMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      Create Stack
                    </Button>
                  </div>
                </div>

                {/* -- RIGHT: port conflicts / reference / volumes -- */}
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="flex items-center gap-1 mb-2 shrink-0">
                    <button
                      onClick={() => setCreateRightPanel('conflicts')}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${createRightPanel === 'conflicts' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                    >
                      <AlertCircle className="w-3 h-3" />
                      Port Conflicts
                    </button>
                    <button
                      onClick={() => setCreateRightPanel('reference')}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${createRightPanel === 'reference' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                    >
                      <FileCode className="w-3 h-3" />
                      Reference
                    </button>
                    <button
                      onClick={() => setCreateRightPanel('volumes')}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${createRightPanel === 'volumes' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                    >
                      <HardDrive className="w-3 h-3" />
                      Volumes
                    </button>
                    <button
                      onClick={() => setCreateRightPanel('backup')}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${createRightPanel === 'backup' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                    >
                      <Archive className="w-3 h-3" />
                      Backup
                    </button>
                    <button
                      onClick={() => setCreateRightPanel('autoupdate')}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${createRightPanel === 'autoupdate' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                    >
                      <Zap className="w-3 h-3" />
                      Auto Update
                    </button>
                    <button
                      onClick={() => setCreateRightPanel('ai')}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${createRightPanel === 'ai' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                    >
                      <WandSparkles className="w-3 h-3" />
                      AI
                    </button>
                  </div>

                  {/* PORT CONFLICTS */}
                  {createRightPanel === 'conflicts' && (
                    <div className="flex-1 overflow-y-auto space-y-2">
                      {newPorts.length === 0 ? (
                        <div className="flex items-center justify-center h-32">
                          <p className="text-xs text-muted-foreground font-mono">No ports defined in compose yet</p>
                        </div>
                      ) : (
                        <>
                          <p className="text-xs text-muted-foreground mb-2">Ports declared in your compose:</p>
                          {newPorts.map(port => {
                            const conflict = stacks.find(s => (s.ports || []).includes(port))
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
                        </>
                      )}
                      <p className="text-xs text-muted-foreground pt-3 pb-1">All ports in use across stacks:</p>
                      <div className="flex flex-wrap gap-1">
                        {stacks.flatMap(s => (s.ports || []).map(p => ({ p, name: s.name }))).map(({ p, name }, i) => (
                          <Tooltip key={i}>
                            <TooltipTrigger asChild>
                              <Badge variant={newPorts.includes(p) ? 'destructive' : 'outline'} className="font-mono text-xs cursor-default">:{p}</Badge>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">{name}</TooltipContent>
                          </Tooltip>
                        ))}
                        {stacks.every(s => !s.ports?.length) && <span className="text-xs text-muted-foreground italic">No ports in use across stacks</span>}
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
                        <Textarea value={refStackCompose} readOnly className="flex-1 font-mono text-xs resize-none bg-muted/30 min-h-0" />
                      ) : (
                        <div className="flex-1 flex items-center justify-center">
                          <p className="text-xs text-muted-foreground text-center">Select a stack above to view its compose as reference</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* VOLUME PATH TEMPLATES */}
                  {createRightPanel === 'volumes' && (
                    <div className="flex-1 overflow-y-auto space-y-2">
                      <p className="text-xs text-muted-foreground mb-1">Named volume path templates. Click to copy. Based on Settings &#8594; Named Volumes Base Path.</p>
                      {(['config', 'data', 'cache', 'logs'] as const).map(sub => {
                        const path = `${volBase}/${newStackName || '<stack-name>'}/${sub}`
                        return (
                          <div key={sub} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border/40 bg-muted/20">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold capitalize">{sub}</p>
                              <p className="font-mono text-xs text-muted-foreground truncate">{path}</p>
                            </div>
                            <button onClick={() => { navigator.clipboard.writeText(path); toast.success('Path copied') }} className="text-muted-foreground hover:text-foreground shrink-0">
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )
                      })}
                      <div className="pt-2 border-t">
                        <p className="text-xs text-muted-foreground mb-1">Named volume snippet for compose.yml:</p>
                        <div className="rounded-lg border border-border/40 bg-muted/20 p-2 relative">
                          <pre className="font-mono text-xs text-muted-foreground whitespace-pre">{`volumes:\n  ${newStackName || 'stack'}_data:\n    driver: local\n    driver_opts:\n      type: none\n      o: bind\n      device: ${volBase}/${newStackName || '<stack>'}/data`}</pre>
                          <button
                            onClick={() => { navigator.clipboard.writeText(`volumes:\n  ${newStackName || 'stack'}_data:\n    driver: local\n    driver_opts:\n      type: none\n      o: bind\n      device: ${volBase}/${newStackName || '<stack>'}/data`); toast.success('Copied') }}
                            className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
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
              <div className="flex items-center gap-2 pb-3 border-b shrink-0 flex-wrap">
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

              {/* Operation Terminal */}
              {(isOperating || (operationDone && opLines.length > 0)) && (
                <div className="rounded-lg border border-border/60 bg-black/80 shrink-0 flex flex-col max-h-44 min-h-0">
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/30 shrink-0">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs font-mono text-muted-foreground">
                        {isOperating ? 'Updating...' : 'Update complete'}
                      </span>
                      {isOperating && <Loader2 className="w-3 h-3 animate-spin text-blue-400" />}
                      {operationDone && !isOperating && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                    </div>
                    <button
                      onClick={() => { setIsOperating(false); setOperationDone(false) }}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <ScrollArea className="flex-1 p-2">
                    <div className="font-mono text-xs space-y-0.5">
                      {opLines.map((line, i) => (
                        <div key={i} className={
                          line.includes('OK') || line.includes('Started') || line.includes('Running') ? 'text-green-400' :
                          line.includes('Error') || line.includes('error') || line.includes('failed') ? 'text-red-400' :
                          line.includes('Pulling') || line.includes('Pulled') || line.includes('pull') ? 'text-blue-400' :
                          'text-foreground/70'
                        }>
                          {line}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
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
                            <Button size="sm" variant="outline" onClick={() => onRestartStack(selectedStack.id)} disabled={isOperating} className="gap-1 text-xs">
                              <RotateCw className="w-3.5 h-3.5" />
                              Restart
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs">docker compose restart</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button size="sm" variant="outline" onClick={() => onStopStack(selectedStack.id)} disabled={isOperating} className="gap-1 text-xs">
                              <Square className="w-3.5 h-3.5" />
                              Stop
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs">docker compose down</TooltipContent>
                        </Tooltip>
                      </>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="sm" onClick={() => onDeployStack(selectedStack.id)} disabled={isOperating} className="gap-1 text-xs">
                            <Play className="w-3.5 h-3.5" />
                            Deploy
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">docker compose up -d</TooltipContent>
                      </Tooltip>
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
                          {isOperating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                          Update
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Pull new images and redeploy</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="destructive" onClick={() => setShowDeleteConfirm(true)} disabled={isOperating} className="gap-1 text-xs">
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Delete this stack</TooltipContent>
                    </Tooltip>
                  </div>

                  {/* File tab bar */}
                  <div className="flex items-center gap-1 mb-2 shrink-0 flex-wrap">
                    {/* compose.yml tab */}
                    <button
                      onClick={() => setActiveFile('compose')}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono transition-colors ${activeFile === 'compose' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                    >
                      <FileCode className="w-3 h-3" />
                      compose.yml
                      {isDirty && activeFile === 'compose' && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                    </button>

                    {/* .env tab */}
                    <button
                      onClick={() => setActiveFile('env')}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono transition-colors ${activeFile === 'env' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                    >
                      <File className="w-3 h-3" />
                      .env
                      {isDirty && activeFile === 'env' && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                    </button>

                    {/* Other files */}
                    {otherFiles.map((f: any) => (
                      <button
                        key={f.path}
                        onClick={() => { setActiveFile(f.path); setIsDirty(false) }}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono transition-colors ${activeFile === f.path ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                      >
                        <FileText className="w-3 h-3" />
                        {f.name}
                        {isDirty && activeFile === f.path && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                      </button>
                    ))}
                  </div>

                  {/* YAML error */}
                  {yamlError && activeFile === 'compose' && (
                    <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/5 px-3 py-2 mb-2 shrink-0">
                      <AlertTriangle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                      <p className="text-xs text-destructive font-mono break-all">{yamlError}</p>
                    </div>
                  )}

                  {/* Port conflict warning */}
                  {portConflicts.length > 0 && (
                    <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/5 px-3 py-2 mb-2 shrink-0">
                      <AlertCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                      <p className="text-xs text-destructive">Port conflict: {portConflicts.join(', ')} already in use by another stack</p>
                    </div>
                  )}

                  {/* Editor */}
                  <Textarea
                    value={editorValue}
                    onChange={(e) => handleEditorChange(e.target.value)}
                    className={`flex-1 font-mono text-xs resize-none min-h-0 ${yamlError && activeFile === 'compose' ? 'border-destructive' : ''}`}
                    spellCheck={false}
                    placeholder={activeFile === 'env' ? 'KEY=value\nANOTHER_KEY=value' : ''}
                  />

                  {/* Services panel — shown for compose.yml */}
                  {activeFile === 'compose' && parsedServices.length > 0 && (
                    <div className="shrink-0 mt-2 border rounded-md p-2 space-y-1 bg-muted/20">
                      {parsedServices.map(svc => (
                        <div key={svc.name} className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-semibold w-28 shrink-0 truncate">{svc.name}</span>
                          {svc.image && (
                            <span className="text-[10px] text-muted-foreground truncate max-w-[110px]" title={svc.image}>
                              {svc.image.split('/').pop()?.split(':')[0]}
                            </span>
                          )}
                          <div className="flex items-center gap-1 flex-wrap ml-auto">
                            {svc.ports.length === 0 && (
                              <span className="text-[10px] text-muted-foreground/40 italic">no ports</span>
                            )}
                            {svc.ports.map((p, i) => (
                              <Tooltip key={i}>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => window.open(`http://${window.location.hostname}:${p.host}`, '_blank')}
                                    className="flex items-center gap-0.5 font-mono text-[10px] px-1.5 py-0.5 rounded border border-border/60 hover:border-primary hover:text-primary transition-colors"
                                  >
                                    :{p.host}
                                    <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent className="text-xs font-mono">
                                  {`http://${window.location.hostname}:${p.host}`}
                                </TooltipContent>
                              </Tooltip>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Footer: ports + git + save */}
                  <div className="flex items-center justify-between pt-2 mt-2 border-t shrink-0 gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      {ports.length > 0 && activeFile === 'compose' && (
                        <Badge
                          variant="outline"
                          className={`font-mono text-xs gap-1 cursor-pointer ${portConflicts.length > 0 ? 'border-destructive text-destructive' : ''}`}
                          onClick={() => { navigator.clipboard.writeText(ports.join(', ')); toast.success('Ports copied') }}
                        >
                          Ports: {ports.join(', ')}
                          <Copy className="w-3 h-3" />
                        </Badge>
                      )}

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
                  </div>
                </div>

                {/* RIGHT PANEL: Logs or Compare */}
                <div className="flex flex-col min-w-0 min-h-0 flex-1">

                  {/* Panel toggle header */}
                  <div className="flex items-center gap-1 mb-2 shrink-0">
                    <button
                      onClick={() => setRightPanel('logs')}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${rightPanel === 'logs' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                    >
                      <Terminal className="w-3 h-3" />
                      Logs
                    </button>
                    <button
                      onClick={() => setRightPanel('compare')}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${rightPanel === 'compare' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                    >
                      <Diff className="w-3 h-3" />
                      Compare
                    </button>
                    <button
                      onClick={() => setRightPanel('backup')}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${rightPanel === 'backup' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                    >
                      <Archive className="w-3 h-3" />
                      Backup
                    </button>
                    <button
                      onClick={() => setRightPanel('autoupdate')}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${rightPanel === 'autoupdate' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                    >
                      <Zap className="w-3 h-3" />
                      Auto Update
                    </button>
                    <button
                      onClick={() => setRightPanel('ai')}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${rightPanel === 'ai' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                    >
                      <WandSparkles className="w-3 h-3" />
                      AI
                    </button>
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
                        <ScrollArea className="flex-1">
                          <div className="font-mono text-xs space-y-0.5 p-2">
                            {logLines.slice(-500).map((line, i) => (
                              <div key={i} className="flex gap-2 leading-relaxed min-w-0">
                                <span className="text-amber-500 shrink-0">[{line.container}]</span>
                                <span className="text-foreground/75 break-all min-w-0">{line.text}</span>
                              </div>
                            ))}
                            <div ref={logsEndRef} />
                          </div>
                        </ScrollArea>
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
                              {compareVersionObj.description && <span className="ml-1 text-muted-foreground/60">— {compareVersionObj.description}</span>}
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
                        <div className="flex items-center justify-center h-32 text-muted-foreground text-xs font-mono">Loading backup config…</div>
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
                              <p className="text-sm font-mono">{settings.autoUpdateSchedule.label}</p>
                              <p className="text-xs text-muted-foreground font-mono mt-0.5">{settings.autoUpdateSchedule.cron}</p>
                              {settings.globalUpdateFreeze && (
                                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" />
                                  Global Update Freeze is active — updates paused
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">No schedule configured — go to Settings → Update Management</p>
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
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* â”€â”€â”€ Delete Confirm Dialog â”€â”€â”€ */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Stack?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <span className="font-mono font-semibold">{selectedStack?.name}</span>? This cannot be undone.
              {selectedStack?.status === 'running' && (
                <span className="block mt-2 text-amber-500 text-xs font-mono">âš  Stack is currently running. Stop it first.</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => { if (selectedStack) deleteStackMutation.mutate(selectedStack.id) }}
            disabled={deleteStackMutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteStackMutation.isPending ? 'Deleting...' : 'Delete Stack'}
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  )
}

