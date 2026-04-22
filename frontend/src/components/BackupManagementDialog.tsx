import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Save, CheckCircle, XCircle, Loader2, Play, Copy, ShieldCheck, FileArchive, HardDrive } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { Stack, BackupConfig, BackupJob } from '@/lib/types'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import * as api from '@/lib/api'
import { ScheduleEditor } from '@/components/ScheduleEditor'



interface BackupManagementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  stacks: Stack[]
  onUpdateStack?: (stack: Stack) => void
  // Legacy props kept for backward compat but no longer used:
  backupConfigs?: Record<string, BackupConfig>
  backupJobs?: Record<string, BackupJob[]>
  onUpdateBackupConfig?: (stackId: string, config: Partial<BackupConfig>) => void
  onRunBackup?: (stackId: string) => void
}

// ── per-stack self-contained components ────────────────────────────────────

const DEFAULT_CONFIG: BackupConfig = {
  enabled: false,
  cronSchedule: '0 22 * * 3',
  retentionDays: 7,
  includeStackFolder: true,
  includeVolumes: true,
  includeDatabases: false,
  useAdvancedRetention: false,
  retentionPolicy: {
    keepLast: 10,
    keepHourly: 24,
    keepDaily: 7,
    keepWeekly: 4,
    keepMonthly: 6,
    keepYearly: 2,
  },
}

function StackBackupItem({ stack }: { stack: Stack }) {
  const qc = useQueryClient()
  const { data: cfg = DEFAULT_CONFIG } = useQuery({
    queryKey: ['backupConfig', stack.id],
    queryFn: () => api.fetchBackupConfig(stack.id),
  })

  const update = useMutation({
    mutationFn: (patch: Partial<BackupConfig>) => api.updateBackupConfig(stack.id, { ...cfg, ...patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backupConfig', stack.id] }),
    onError: (e: any) => toast.error(`Save failed: ${e.message}`),
  })

  const run = useMutation({
    mutationFn: () => api.runBackup(stack.id),
    onSuccess: () => {
      toast.success(`Backup started for ${stack.name}`)
      qc.invalidateQueries({ queryKey: ['backupJobs', stack.id] })
    },
    onError: (e: any) => toast.error(`Backup failed: ${e.message}`),
  })

  const u = (patch: Partial<BackupConfig>) => update.mutate(patch)

  return (
    <AccordionItem value={stack.id} className="border rounded-lg px-4 !border-b">
      <AccordionTrigger className="hover:no-underline">
        <div className="flex items-center gap-3 flex-1">
          <span className="font-mono text-sm">{stack.name}</span>
          <Badge variant="outline" className="text-[10px]">{stack.services} services</Badge>
          {cfg.enabled && <Badge className="text-[10px] bg-primary/20 text-primary">Enabled</Badge>}
        </div>
      </AccordionTrigger>
      <AccordionContent className="space-y-4 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <Label>Enable Backups</Label>
            <p className="text-xs text-muted-foreground">Automated scheduled backups</p>
          </div>
          <Switch checked={cfg.enabled} onCheckedChange={(v) => u({ enabled: v })} />
        </div>

        {cfg.enabled && (
          <>
            <Card className="p-3 space-y-3">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Schedule &amp; Timing</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Schedule</Label>
                  <ScheduleEditor value={cfg.cronSchedule ?? '0 22 * * 3'} onChange={(v) => u({ cronSchedule: v })} />
                </div>
                <div className="flex items-end">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" variant="outline" disabled={run.isPending} onClick={() => run.mutate()}>
                        {run.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Play className="w-3 h-3 mr-1" />}
                        Run Now
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">Start this stack backup immediately, independent of schedule</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </Card>

            <Card className="p-3 space-y-3">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Retention Policy</Label>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox checked={!cfg.useAdvancedRetention} onCheckedChange={() => u({ useAdvancedRetention: false })} />
                  <Label className="text-xs">Simple (keep last N)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={cfg.useAdvancedRetention} onCheckedChange={() => u({ useAdvancedRetention: true })} />
                  <Label className="text-xs">Advanced</Label>
                </div>
              </div>
              {!cfg.useAdvancedRetention ? (
                <div className="space-y-1">
                  <Label className="text-xs">Keep last backups</Label>
                  <Input type="number" value={cfg.retentionDays} onChange={(e) => u({ retentionDays: Number(e.target.value) })} className="h-8 text-xs font-mono w-24" min={1} max={5000} />
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
                        <TooltipContent><p className="text-xs">{period.hint}</p></TooltipContent>
                      </Tooltip>
                      <Input type="number" value={cfg.retentionPolicy?.[period.key] ?? period.def}
                        onChange={(e) => u({ retentionPolicy: { ...{ keepLast: 10, keepHourly: 24, keepDaily: 7, keepWeekly: 4, keepMonthly: 6, keepYearly: 2, ...cfg.retentionPolicy }, [period.key]: Number(e.target.value) } })}
                        className="h-8 text-xs font-mono" min={0} />
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-3 space-y-3">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Backup Contents</Label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox checked={cfg.includeStackFolder} onCheckedChange={(v) => u({ includeStackFolder: !!v })} />
                  <Label className="text-xs">Full stack folder</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={cfg.includeVolumes} onCheckedChange={(v) => u({ includeVolumes: !!v })} />
                  <Label className="text-xs">All attached Docker volumes</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={cfg.includeDatabases} onCheckedChange={(v) => u({ includeDatabases: !!v })} />
                  <Label className="text-xs">Database dumps</Label>
                </div>
              </div>
              {cfg.includeDatabases && (
                <div className="ml-5 p-2 bg-muted/50 rounded space-y-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Database Type</Label>
                    <Select value={cfg.databaseType || 'auto'} onValueChange={(v) => u({ databaseType: v })}>
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
                    <Input value={cfg.databaseConfig?.containerName || ''} onChange={(e) => u({ databaseConfig: { ...cfg.databaseConfig, containerName: e.target.value } })} className="h-7 text-xs font-mono" placeholder="postgres-db" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Database Name</Label>
                    <Input value={cfg.databaseConfig?.databaseName || ''} onChange={(e) => u({ databaseConfig: { ...cfg.databaseConfig, databaseName: e.target.value } })} className="h-7 text-xs font-mono" placeholder="mydb" />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Redis and InfluxDB are best protected by volume backups. Logical dumps are used when supported by the running container image.
                  </p>
                </div>
              )}
            </Card>

            <Card className="p-3 space-y-3">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Advanced Options</Label>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><FileArchive className="w-3.5 h-3.5 text-muted-foreground" /><Label className="text-xs">Compression Level (1-9)</Label></div>
                  <Input type="number" value={cfg.compressionLevel ?? 6} onChange={(e) => u({ compressionLevel: Number(e.target.value) })} className="h-7 text-xs font-mono w-16" min={1} max={9} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" /><Label className="text-xs">Encrypt Backup</Label></div>
                  <Switch checked={cfg.encrypted ?? false} onCheckedChange={(v) => u({ encrypted: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><HardDrive className="w-3.5 h-3.5 text-muted-foreground" /><Label className="text-xs">Incremental Backup</Label></div>
                  <Switch checked={cfg.incremental ?? false} onCheckedChange={(v) => u({ incremental: v })} />
                </div>
              </div>
            </Card>
          </>
        )}
      </AccordionContent>
    </AccordionItem>
  )
}

function StackJobHistoryItems({ stack }: { stack: Stack }) {
  const { data: jobs = [] } = useQuery({
    queryKey: ['backupJobs', stack.id],
    queryFn: () => api.fetchBackupJobs(stack.id),
  })
  if (jobs.length === 0) return null
  const formatSize = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${bytes} B`
  }
  return (
    <>
      {jobs.map((job: BackupJob) => (
        <div key={job.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
          <div className="flex items-center gap-3">
            {job.status === 'completed' ? (
              <CheckCircle className="w-4 h-4 text-green-500" />
            ) : job.status === 'failed' ? (
              <XCircle className="w-4 h-4 text-destructive" />
            ) : (
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            )}
            <div>
              <span className="text-sm font-mono">{stack.name}</span>
              <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(job.startedAt), { addSuffix: true })}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={job.status === 'completed' ? 'default' : job.status === 'failed' ? 'destructive' : 'outline'} className="text-[10px]">{job.status}</Badge>
            {job.sizeBytes > 0 && <span className="text-xs text-muted-foreground font-mono">{formatSize(job.sizeBytes)}</span>}
          </div>
        </div>
      ))}
    </>
  )
}

export function BackupManagementDialog({
  open,
  onOpenChange,
  stacks,
}: BackupManagementDialogProps) {

  const nasScript = `#!/bin/bash
# NAS Pull Script — run from your NAS via cron
# Pulls latest backups from the Homelab Commander backup volume on your Docker host.
#
# STEP 1: Find the volume mount point on your Docker host:
#   docker volume inspect hlc_backups | grep -i mountpoint
#   (the volume is named after your compose project, e.g. homelab-commander_backups)
#
# STEP 2: Replace REMOTE_PATH below with that Mountpoint path.

REMOTE_HOST="homelab-server"       # SSH hostname or IP of your Docker host
REMOTE_PATH="/var/lib/docker/volumes/hlc_backups/_data"  # from docker volume inspect
LOCAL_PATH="/volume1/backups/homelab-commander"           # destination on your NAS

rsync -avz --delete \\
  "\${REMOTE_HOST}:\${REMOTE_PATH}/" \\
  "\${LOCAL_PATH}/"

echo "Backup sync completed at \$(date)"
`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] sm:max-w-5xl h-[90vh] overflow-hidden">
        <TooltipProvider delayDuration={350}>
        <div className="flex h-full min-h-0 flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="w-6 h-6 text-primary" />
            Backup Management
          </DialogTitle>
          <DialogDescription>
            Configure automated backups for your stacks
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="stacks" className="mt-4 flex-1 min-h-0 flex flex-col">
          <TabsList className="grid w-full grid-cols-3 h-auto">
            <TabsTrigger value="stacks">Stack Backups</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="stacks" className="mt-4 flex-1 min-h-0">
            <ScrollArea className="h-full pr-1">
              <Accordion type="multiple" className="space-y-2">
                {stacks.map((stack) => (
                  <StackBackupItem key={stack.id} stack={stack} />
                ))}
              </Accordion>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="history" className="mt-4 flex-1 min-h-0">
            <ScrollArea className="h-full pr-1">
              <div className="space-y-2">
                {stacks.map((stack) => (
                  <StackJobHistoryItems key={stack.id} stack={stack} />
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="settings" className="mt-4 flex-1 min-h-0">
            <ScrollArea className="h-full pr-1">
            <div className="space-y-4 pb-2">
            <Card className="p-4 space-y-2 border-border/60 bg-muted/10">
              <Label className="text-base">Backup Storage</Label>
              <p className="text-sm text-muted-foreground">
                Backups are written to the <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">/data/backups</span> path
                inside the THC container, which maps to the <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">hlc_backups</span> named Docker volume on your host.
                Do <strong>not</strong> change this internal path — control where it lands on your host by editing your <span className="font-mono text-xs">docker-compose.yml</span> volume binding instead.
              </p>
              <div className="mt-1 rounded-md border border-border/50 bg-black/50 p-2">
                <pre className="font-mono text-xs text-muted-foreground whitespace-pre">{`volumes:\n  hlc_backups:\n    driver: local\n    driver_opts:\n      type: none\n      o: bind\n      device: /your/host/backup/path`}</pre>
              </div>
            </Card>

            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">NAS Pull Script</Label>
                  <p className="text-xs text-muted-foreground">Run this script from your NAS to pull backups via rsync</p>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={() => {
                      navigator.clipboard.writeText(nasScript)
                      toast.success('Script copied to clipboard')
                    }}>
                      <Copy className="w-3.5 h-3.5 mr-1" /> Copy
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Copy the full NAS rsync pull script to your clipboard</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Textarea
                value={nasScript}
                readOnly
                className="min-h-[220px] font-mono text-xs whitespace-pre overflow-x-auto resize-none"
              />
            </Card>
            </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
        </div>
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  )
}
