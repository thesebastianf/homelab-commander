import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Wrench, ImageIcon, HardDrive, Box, AlertTriangle, Loader2, CheckCircle, Network, Wifi, WifiOff, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import * as api from '@/lib/api'

interface MaintenanceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

export function MaintenanceDialog({ open, onOpenChange }: MaintenanceDialogProps) {
  const [pruning, setPruning] = useState<string | null>(null)
  const [pendingPrune, setPendingPrune] = useState<{ type: string; label: string; description: string } | null>(null)
  const [socketChecking, setSocketChecking] = useState(false)
  const [socketResult, setSocketResult] = useState<'ok' | 'error' | null>(null)
  const focusRef = useRef<HTMLDivElement | null>(null)
  const qc = useQueryClient()

  const { data: systemInfo } = useQuery({
    queryKey: ['systemInfo'],
    queryFn: api.fetchSystemInfo,
    enabled: open,
  })

  const { data: dfData } = useQuery({
    queryKey: ['systemDf'],
    queryFn: api.fetchSystemDf,
    enabled: open,
  })

  const { data: containers = [] } = useQuery({
    queryKey: ['containers'],
    queryFn: api.fetchContainers,
    enabled: open,
  })

  const { data: networks = [] } = useQuery({
    queryKey: ['networks'],
    queryFn: api.fetchNetworks,
    enabled: open,
  })

  const { data: appSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: api.fetchSettings,
    enabled: open,
  })

  const stoppedContainers = (containers as any[]).filter((c: any) => c.status !== 'running')
  const networkCount = (networks as any[]).length
  const registryConfigPresent = (appSettings as any)?.dockerCompose?.registryConfigPresent ?? true

  const diskPct = systemInfo?.diskUsedPercent ?? 0
  const diskTotal = systemInfo?.diskTotal ?? '-'
  const memPct = systemInfo?.memoryUsedPercent ?? 0
  const memTotal = systemInfo?.memoryTotal ?? '-'

  const NETWORK_WARN_THRESHOLD = (appSettings as any)?.warningThresholds?.networkWarn ?? 25
  const ZOMBIE_WARN_THRESHOLD = (appSettings as any)?.warningThresholds?.zombieWarn ?? 5
  const DISK_WARN_THRESHOLD = (appSettings as any)?.warningThresholds?.diskWarn ?? 90

  const networkPoolWarning = networkCount > NETWORK_WARN_THRESHOLD
  const zombieWarning = stoppedContainers.length > ZOMBIE_WARN_THRESHOLD
  const diskWarning = diskPct > DISK_WARN_THRESHOLD
  const hasAnyWarning = networkPoolWarning || zombieWarning || diskWarning || !registryConfigPresent

  const checkSocket = async () => {
    setSocketChecking(true)
    setSocketResult(null)
    try {
      await api.fetchSystemInfo()
      setSocketResult('ok')
      toast.success('Docker socket reachable — connection OK')
    } catch {
      setSocketResult('error')
      toast.error('Docker socket unreachable!')
    } finally {
      setSocketChecking(false)
    }
  }

  const totalReclaimable =
    (dfData?.images?.reclaimable ?? 0) +
    (dfData?.volumes?.reclaimable ?? 0) +
    (dfData?.containers?.reclaimable ?? 0)

  const prune = useMutation({
    mutationFn: async (type: string) => {
      if (type === 'images') return api.pruneImages()
      if (type === 'volumes') return api.pruneVolumes()
      if (type === 'containers') return api.pruneContainers()
      if (type === 'networks') return api.pruneNetworks()
      return api.pruneSystem()
    },
    onMutate: (type) => setPruning(type),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['containers'] })
      qc.invalidateQueries({ queryKey: ['images'] })
      qc.invalidateQueries({ queryKey: ['volumes'] })
      qc.invalidateQueries({ queryKey: ['networks'] })
      qc.invalidateQueries({ queryKey: ['systemDf'] })
      qc.invalidateQueries({ queryKey: ['systemInfo'] })
    },
    onSettled: () => setPruning(null),
  })

  const handlePrune = (type: string, label: string, description: string) => {
    setPendingPrune({ type, label, description })
  }

  const confirmPrune = () => {
    if (!pendingPrune) return
    const { type, label } = pendingPrune
    setPendingPrune(null)
    prune.mutate(type, {
      onSuccess: () => toast.success(`${label} completed`),
      onError: (e: any) => toast.error(`Failed: ${e.message}`),
    })
  }

  const isHealthy = diskPct < DISK_WARN_THRESHOLD && memPct < 90 && !hasAnyWarning

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl max-h-[90vh] overflow-y-auto"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          focusRef.current?.focus()
        }}
      >
        <DialogHeader>
          <div ref={focusRef} tabIndex={-1} className="outline-none" />
          <DialogTitle className="flex items-center gap-2 font-mono">
            <Wrench className="w-5 h-5 text-primary" />
            System Maintenance
          </DialogTitle>
          <DialogDescription>
            Clean up unused resources and monitor system health
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* System Health Card */}
          <div className={`rounded-xl border p-5 ${isHealthy ? 'border-success/30 bg-success/[0.03]' : 'border-destructive/30 bg-destructive/[0.03]'}`}>
            <div className="flex items-center gap-3 mb-4">
              <h3 className="font-mono font-semibold text-base">System Health</h3>
              <Badge className={`text-[10px] ${isHealthy ? 'bg-success/15 text-success border-success/30' : 'bg-destructive/15 text-destructive border-destructive/30'}`}>
                {isHealthy ? 'Healthy' : 'Warning'}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Disk Usage</span>
                  <span className="text-xs font-mono">{diskPct.toFixed(1)}%</span>
                </div>
                <Progress value={diskPct} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">{diskTotal} total</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">Memory Usage</span>
                  <span className="text-xs font-mono">{memPct.toFixed(1)}%</span>
                </div>
                <Progress value={memPct} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">{memTotal} total</p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Estimated Reclaimable</p>
                <p className="text-2xl font-mono font-bold text-warning">~{formatBytes(totalReclaimable)}</p>
                <p className="text-xs text-muted-foreground">unused images, volumes &amp; stopped containers</p>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-muted-foreground">Docker</span>
                <span className="font-mono">{systemInfo?.dockerVersion ?? '-'}</span>
                <span className="text-muted-foreground">Containers</span>
                <span className="font-mono">{systemInfo?.containers?.total ?? '-'} ({systemInfo?.containers?.running ?? 0} up)</span>
                <span className="text-muted-foreground">Images</span>
                <span className="font-mono">{systemInfo?.images ?? '-'}</span>
                <span className="text-muted-foreground">OS</span>
                <span className="font-mono truncate">{systemInfo?.os ?? '-'}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Purge Unused Images */}
            <div className="rounded-xl border border-blue-500/20 border-l-4 border-l-blue-500 bg-card p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-blue-500" />
                <h4 className="font-mono font-semibold text-sm">Purge Unused Images</h4>
              </div>
              <p className="text-xs text-muted-foreground">Remove images not associated with any container.</p>
              {dfData?.images && (
                <div className="flex gap-6">
                  <div>
                    <p className="text-xs text-muted-foreground">Count</p>
                    <p className="text-xl font-mono font-bold text-blue-500">{dfData.images.count ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Reclaimable</p>
                    <p className="text-xl font-mono font-bold text-warning">~{formatBytes(dfData.images.reclaimable)}</p>
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <Button size="sm" className="mt-auto bg-blue-600 hover:bg-blue-700 text-white w-fit"
                  disabled={pruning !== null} onClick={() => handlePrune('images', 'Image prune', 'All unused images (not associated with any container) will be permanently deleted. This frees up disk space but images must be re-pulled to use again.')}>
                  {pruning === 'images' ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Pruning...</> : 'Purge Images'}
                </Button>
                <code className="text-[10px] font-mono text-muted-foreground/70">docker image prune -a -f</code>
              </div>
            </div>

            {/* Prune Unused Volumes */}
            <div className="rounded-xl border border-primary/20 border-l-4 border-l-primary bg-card p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-primary" />
                <h4 className="font-mono font-semibold text-sm">Prune Unused Volumes</h4>
              </div>
              <p className="text-xs text-muted-foreground">Remove volumes not referenced by any container.</p>
              {dfData?.volumes && (
                <div className="flex gap-6">
                  <div>
                    <p className="text-xs text-muted-foreground">Count</p>
                    <p className="text-xl font-mono font-bold text-primary">{dfData.volumes.count ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Reclaimable</p>
                    <p className="text-xl font-mono font-bold text-warning">~{formatBytes(dfData.volumes.reclaimable)}</p>
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <Button size="sm" className="mt-auto bg-primary hover:bg-primary/90 text-white w-fit"
                  disabled={pruning !== null} onClick={() => handlePrune('volumes', 'Volume prune', 'All volumes not referenced by any container will be permanently deleted including their data. This cannot be undone.')}>
                  {pruning === 'volumes' ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Pruning...</> : 'Prune Volumes'}
                </Button>
                <code className="text-[10px] font-mono text-muted-foreground/70">docker volume prune -f</code>
              </div>
            </div>

            {/* Remove Stopped Containers */}
            <div className="rounded-xl border border-warning/20 border-l-4 border-l-warning bg-card p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Box className="w-4 h-4 text-warning" />
                <h4 className="font-mono font-semibold text-sm">Remove Stopped Containers</h4>
              </div>
              <p className="text-xs text-muted-foreground">Clean up containers in stopped/exited state.</p>
              <div>
                <p className="text-xs text-muted-foreground">Containers to Remove</p>
                <p className="text-xl font-mono font-bold text-warning">{stoppedContainers.length} containers</p>
              </div>
              {stoppedContainers.length > 0 ? (
                <div className="space-y-1 max-h-20 overflow-y-auto">
                  {stoppedContainers.slice(0, 4).map((c: any) => (
                    <div key={c.id} className="flex items-center gap-2 text-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
                      <span className="font-mono truncate text-muted-foreground">{c.name}</span>
                    </div>
                  ))}
                  {stoppedContainers.length > 4 && <p className="text-xs text-muted-foreground">+ {stoppedContainers.length - 4} more</p>}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-success">
                  <CheckCircle className="w-3.5 h-3.5" />No stopped containers
                </div>
              )}
              <div className="flex flex-col gap-1">
                <Button size="sm" className="mt-auto bg-warning/90 hover:bg-warning text-black w-fit"
                  disabled={pruning !== null || stoppedContainers.length === 0}
                  onClick={() => handlePrune('containers', 'Container prune', `${stoppedContainers.length} stopped container(s) will be permanently removed. Their writable layers will be lost. Volumes are not affected.`)}>
                  {pruning === 'containers' ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Removing...</> : 'Remove Stopped'}
                </Button>
                <code className="text-[10px] font-mono text-muted-foreground/70">docker container prune -f</code>
              </div>
            </div>

            {/* Full System Prune — Danger Zone */}
            <div className="rounded-xl border border-destructive/40 border-l-4 border-l-destructive bg-destructive/[0.03] p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                <h4 className="font-mono font-semibold text-sm text-destructive">Full System Prune</h4>
              </div>
              <p className="text-xs text-muted-foreground">Remove ALL unused images, volumes, containers, and networks.</p>
              <div>
                <p className="text-xs text-muted-foreground">Total to Reclaim</p>
                <p className="text-2xl font-mono font-bold text-destructive">~{formatBytes(totalReclaimable)}</p>
              </div>
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2 text-xs text-destructive/80">
                This action is irreversible. Running containers will not be affected.
              </div>
              <div className="flex flex-col gap-1">
                <Button size="sm" variant="destructive" className="mt-auto w-fit"
                  disabled={pruning !== null} onClick={() => handlePrune('all', 'Full system prune', 'ALL unused images, volumes, stopped containers, and networks will be permanently deleted. Running containers are not affected but this action cannot be undone.')}>
                  {pruning === 'all' ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Pruning...</> : 'Full System Prune'}
                </Button>
                <code className="text-[10px] font-mono text-muted-foreground/70">docker system prune -a --volumes -f</code>
              </div>
            </div>

            {/* Prune Networks */}
            <div className={`rounded-xl border bg-card p-4 flex flex-col gap-3 ${networkPoolWarning ? 'border-orange-500/40 border-l-4 border-l-orange-500' : 'border-orange-500/20 border-l-4 border-l-orange-500'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Network className="w-4 h-4 text-orange-500" />
                  <h4 className="font-mono font-semibold text-sm">Prune Networks</h4>
                </div>
                {networkPoolWarning && (
                  <Badge className="text-[10px] bg-orange-500/15 text-orange-400 border-orange-500/30">Pool Nearly Full!</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Remove unused networks. Prevents "address pool exhausted" errors during deploys.</p>
              <div className="flex gap-6">
                <div>
                  <p className="text-xs text-muted-foreground">Active Networks</p>
                  <p className={`text-xl font-mono font-bold ${networkPoolWarning ? 'text-orange-400' : 'text-orange-500'}`}>{networkCount}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Threshold</p>
                  <p className="text-xl font-mono font-bold text-muted-foreground">{NETWORK_WARN_THRESHOLD}</p>
                </div>
              </div>
              {networkPoolWarning && (
                <div className="rounded bg-orange-500/10 border border-orange-500/20 p-2 text-xs text-orange-400">
                  Network pool nearly full. Remove unused stacks or run Prune Networks.
                </div>
              )}
              <div className="flex flex-col gap-1">
                <Button size="sm" className="mt-auto bg-orange-600 hover:bg-orange-700 text-white w-fit"
                  disabled={pruning !== null} onClick={() => handlePrune('networks', 'Network prune', 'All unused Docker networks (not connected to any container) will be removed. Running containers are not affected.')}>
                  {pruning === 'networks' ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Pruning...</> : 'Prune Networks'}
                </Button>
                <code className="text-[10px] font-mono text-muted-foreground/70">docker network prune -f</code>
              </div>
            </div>

            {/* Docker Connectivity */}
            <div className="rounded-xl border border-muted/40 border-l-4 border-l-muted bg-card p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Wifi className="w-4 h-4 text-muted-foreground" />
                <h4 className="font-mono font-semibold text-sm">Docker Connectivity</h4>
              </div>
              <p className="text-xs text-muted-foreground">Test the connection to the Docker daemon via /var/run/docker.sock.</p>
              <div className="flex items-center gap-3">
                {socketResult === 'ok' && (
                  <div className="flex items-center gap-1.5 text-xs text-success"><CheckCircle className="w-3.5 h-3.5" />Socket OK</div>
                )}
                {socketResult === 'error' && (
                  <div className="flex items-center gap-1.5 text-xs text-destructive"><WifiOff className="w-3.5 h-3.5" />Socket unreachable!</div>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <Button size="sm" variant="outline" className="mt-auto w-fit"
                  disabled={socketChecking} onClick={checkSocket}>
                  {socketChecking ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Checking...</> : 'Check Socket'}
                </Button>
                <code className="text-[10px] font-mono text-muted-foreground/70">docker info</code>
              </div>
            </div>
          </div>

          {/* Docker Warnings Section */}
          {hasAnyWarning && (
            <div className="space-y-2">
              <h3 className="font-mono font-semibold text-sm flex items-center gap-2 text-warning">
                <AlertTriangle className="w-4 h-4" /> Docker Warnings
              </h3>
              {diskWarning && (
                <Alert variant="destructive" className="py-2">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    <strong>Disk &gt;{DISK_WARN_THRESHOLD}%:</strong> Docker partition nearly full ({diskPct.toFixed(1)}%). Clean up images and volumes.
                  </AlertDescription>
                </Alert>
              )}
              {networkPoolWarning && (
                <Alert className="py-2 border-orange-500/40 bg-orange-500/5">
                  <Network className="h-4 w-4 text-orange-400" />
                  <AlertDescription className="text-xs text-orange-300">
                    <strong>Network pool nearly full:</strong> {networkCount} networks (threshold: {NETWORK_WARN_THRESHOLD}). Remove unused stacks or run Prune Networks.
                  </AlertDescription>
                </Alert>
              )}
              {zombieWarning && (
                <Alert className="py-2 border-warning/40 bg-warning/5">
                  <Box className="h-4 w-4 text-warning" />
                  <AlertDescription className="text-xs text-warning/90">
                    <strong>Zombie containers:</strong> {stoppedContainers.length} stopped containers (threshold: {ZOMBIE_WARN_THRESHOLD}). Consider running Container Prune.
                  </AlertDescription>
                </Alert>
              )}
              {!registryConfigPresent && (
                <Alert className="py-2 border-muted/40 bg-muted/5">
                  <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                  <AlertDescription className="text-xs text-muted-foreground">
                    <strong>No GHCR access:</strong> /root/.docker/config.json is missing. Private images (GHCR) cannot be pulled. Check the volume mapping in docker-compose.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>

    <AlertDialog open={pendingPrune !== null} onOpenChange={(o) => { if (!o) setPendingPrune(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            Confirm: {pendingPrune?.label}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {pendingPrune?.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={confirmPrune}
          >
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
