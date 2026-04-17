import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Save, Clock, HardDrive, CheckCircle, XCircle, Loader2, Play, Database, Copy, ShieldCheck, FileArchive } from 'lucide-react'
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
  backupsBasePath: string
  onUpdateBackupsPath: (path: string) => void
  // Legacy props kept for backward compat but no longer used:
  backupConfigs?: Record<string, BackupConfig>
  backupJobs?: Record<string, BackupJob[]>
  onUpdateBackupConfig?: (stackId: string, config: Partial<BackupConfig>) => void
  onRunBackup?: (stackId: string) => void
}

// ── per-stack self-contained components ────────────────────────────────────

const DEFAULT_CONFIG: BackupConfig = {
  enabled: false, cronSchedule: '0 2 * * *', retentionDays: 7,
  includeStackFolder: true, includeVolumes: true, includeDatabases: false,
  useAdvancedRetention: false,
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
    <AccordionItem value={stack.id} className="border rounded-lg px-4">
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
                  <ScheduleEditor value={cfg.cronSchedule ?? '0 2 * * *'} onChange={(v) => u({ cronSchedule: v })} />
                </div>
                <div className="flex items-end">
                  <Button size="sm" variant="outline" disabled={run.isPending} onClick={() => run.mutate()}>
                    {run.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Play className="w-3 h-3 mr-1" />}
                    Run Now
                  </Button>
                </div>
              </div>
            </Card>

            <Card className="p-3 space-y-3">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Retention Policy</Label>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox checked={!cfg.useAdvancedRetention} onCheckedChange={() => u({ useAdvancedRetention: false })} />
                  <Label className="text-xs">Simple (days)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={cfg.useAdvancedRetention} onCheckedChange={() => u({ useAdvancedRetention: true })} />
                  <Label className="text-xs">Advanced</Label>
                </div>
              </div>
              {!cfg.useAdvancedRetention ? (
                <div className="space-y-1">
                  <Label className="text-xs">Keep backups for (days)</Label>
                  <Input type="number" value={cfg.retentionDays} onChange={(e) => u({ retentionDays: Number(e.target.value) })} className="h-8 text-xs font-mono w-24" min={1} max={365} />
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {(['daily', 'weekly', 'monthly', 'yearly'] as const).map(period => (
                    <div key={period} className="space-y-1">
                      <Label className="text-xs capitalize">{period}</Label>
                      <Input type="number" value={cfg.retentionPolicy?.[period] ?? (period === 'daily' ? 7 : period === 'weekly' ? 4 : period === 'monthly' ? 6 : 2)}
                        onChange={(e) => u({ retentionPolicy: { ...{ daily: 7, weekly: 4, monthly: 6, yearly: 2, ...cfg.retentionPolicy }, [period]: Number(e.target.value) } })}
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
            {job.sizeBytes > 0 && <span className="text-xs text-muted-foreground font-mono">{(job.sizeBytes / 1024 / 1024).toFixed(1)} MB</span>}
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
  backupsBasePath,
  onUpdateBackupsPath,
}: BackupManagementDialogProps) {
  const [localBackupsPath, setLocalBackupsPath] = useState(backupsBasePath)

  useEffect(() => {
    setLocalBackupsPath(backupsBasePath)
  }, [backupsBasePath])

  const nasScript = `#!/bin/bash
# NAS Pull Script — run from your NAS via cron
# Pulls the latest backup from the Homelab Commander backup directory

REMOTE_HOST="homelab-server"
REMOTE_PATH="${localBackupsPath}"
LOCAL_PATH="/volume1/backups/homelab-commander"

rsync -avz --delete \\
  "\${REMOTE_HOST}:\${REMOTE_PATH}/" \\
  "\${LOCAL_PATH}/"

echo "Backup sync completed at $(date)"
`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="w-6 h-6 text-primary" />
            Backup Management
          </DialogTitle>
          <DialogDescription>
            Configure automated backups for your stacks
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="stacks" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="stacks">Stack Backups</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="stacks" className="mt-4">
            <ScrollArea className="h-[500px]">
              <Accordion type="multiple" className="space-y-2">
                {stacks.map((stack) => (
                  <StackBackupItem key={stack.id} stack={stack} />
                ))}
              </Accordion>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <ScrollArea className="h-[500px]">
              <div className="space-y-2">
                {stacks.map((stack) => (
                  <StackJobHistoryItems key={stack.id} stack={stack} />
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="settings" className="mt-4 space-y-4">
            <Card className="p-4 space-y-3">
              <Label className="text-base">Backups Base Path</Label>
              <div className="flex gap-2">
                <Input
                  value={localBackupsPath}
                  onChange={(e) => setLocalBackupsPath(e.target.value)}
                  className="font-mono"
                  placeholder="/mnt/backups"
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    onUpdateBackupsPath(localBackupsPath)
                    toast.success('Backups path updated')
                  }}
                >
                  Save
                </Button>
              </div>
            </Card>

            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">NAS Pull Script</Label>
                  <p className="text-xs text-muted-foreground">Run this script from your NAS to pull backups via rsync</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => {
                  navigator.clipboard.writeText(nasScript)
                  toast.success('Script copied to clipboard')
                }}>
                  <Copy className="w-3.5 h-3.5 mr-1" /> Copy
                </Button>
              </div>
              <Textarea
                value={nasScript}
                readOnly
                className="min-h-[160px] font-mono text-xs"
              />
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
