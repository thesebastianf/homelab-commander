import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Wrench, ImageIcon, HardDrive, Box, AlertTriangle, Loader2, CheckCircle, Network, Wifi, WifiOff } from 'lucide-react'
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
        className="max-w-6xl"
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

        <div className="space-y-3 mt-2">
          {/* Compact System Health Row */}
          <div className={`rounded-lg border p-3 ${isHealthy ? 'border-success/30 bg-success/[0.03]' : 'border-warning/30 bg-warning/[0.03]'}`}>
            <div className="grid grid-cols-4 gap-4 items-start">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-muted-foreground">Disk {diskPct.toFixed(1)}%</span>
                  {diskWarning && <AlertTriangle className="w-3 h-3 text-warning" />}
                </div>
                <Progress value={diskPct} className="h-1.5" />
                <p className="text-[10px] text-muted-foreground mt-0.5">{diskTotal} total</p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-muted-foreground">Memory {memPct.toFixed(1)}%</span>
                </div>
                <Progress value={memPct} className="h-1.5" />
                <p className="text-[10px] text-muted-foreground mt-0.5">{memTotal} total</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Reclaimable</p>
                <p className="text-xl font-mono font-bold text-warning">~{formatBytes(totalReclaimable)}</p>
                <p className="text-[10px] text-muted-foreground">images + volumes + containers</p>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
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

          {/* Row 1: Images | Volumes | Stopped Containers */}
          <div className="grid grid-cols-3 gap-3">
            {/* Purge Unused Images */}
            <div className="rounded-lg border border-l-4 border-blue-500/20 border-l-blue-500 bg-card p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-blue-500 shrink-0" />
                <h4 className="font-mono font-semibold text-xs">Purge Unused Images</h4>
              </div>
              <p className="text-[11px] text-muted-foreground">Remove images not associated with any container.</p>
              {dfData?.images && (
                <div className="flex gap-4">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Count</p>
                    <p className="text-lg font-mono font-bold text-blue-500">{dfData.images.count ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Reclaimable</p>
                    <p className="text-lg font-mono font-bold text-warning">~{formatBytes(dfData.images.reclaimable)}</p>
                  </div>
                </div>
              )}
              <div className="mt-auto flex flex-col gap-1">
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-7 w-fit"
                  disabled={pruning !== null} onClick={() => handlePrune('images', 'Image prune', 'All unused images (not associated with any container) will be permanently deleted. This frees up disk space but images must be re-pulled to use again.')}>
                  {pruning === 'images' ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Pruning...</> : 'Purge Images'}
                </Button>
                <code className="text-[10px] font-mono text-muted-foreground/60">docker image prune -a -f</code>
              </div>
            </div>

            {/* Prune Unused Volumes */}
            <div className="rounded-lg border border-l-4 border-primary/20 border-l-primary bg-card p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-primary shrink-0" />
                <h4 className="font-mono font-semibold text-xs">Prune Unused Volumes</h4>
              </div>
              <p className="text-[11px] text-muted-foreground">Remove volumes not referenced by any container.</p>
              {dfData?.volumes && (
                <div className="flex gap-4">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Count</p>
                    <p className="text-lg font-mono font-bold text-primary">{dfData.volumes.count ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Reclaimable</p>
                    <p className="text-lg font-mono font-bold text-warning">~{formatBytes(dfData.volumes.reclaimable)}</p>
                  </div>
                </div>
              )}
              <div className="mt-auto flex flex-col gap-1">
                <Button size="sm" className="bg-primary hover:bg-primary/90 text-white text-xs h-7 w-fit"
                  disabled={pruning !== null} onClick={() => handlePrune('volumes', 'Volume prune', 'All volumes not referenced by any container will be permanently deleted including their data. This cannot be undone.')}>
                  {pruning === 'volumes' ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Pruning...</> : 'Prune Volumes'}
                </Button>
                <code className="text-[10px] font-mono text-muted-foreground/60">docker volume prune -f</code>
              </div>
            </div>

            {/* Remove Stopped Containers */}
            <div className={`rounded-lg border border-l-4 bg-card p-3 flex flex-col gap-2 ${zombieWarning ? 'border-warning/40 border-l-warning' : 'border-warning/20 border-l-warning'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Box className="w-4 h-4 text-warning shrink-0" />
                  <h4 className="font-mono font-semibold text-xs">Remove Stopped</h4>
                </div>
                {zombieWarning && <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />}
              </div>
              <p className="text-[11px] text-muted-foreground">Clean up stopped / exited containers.</p>
              <div>
                <p className="text-[10px] text-muted-foreground">To remove</p>
                <p className={`text-lg font-mono font-bold ${zombieWarning ? 'text-warning' : 'text-muted-foreground'}`}>{stoppedContainers.length} containers</p>
              </div>
              {stoppedContainers.length > 0 ? (
                <div className="space-y-0.5 max-h-12 overflow-y-auto">
                  {stoppedContainers.slice(0, 3).map((c: any) => (
                    <div key={c.id} className="flex items-center gap-1.5 text-[10px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
                      <span className="font-mono truncate text-muted-foreground">{c.name}</span>
                    </div>
                  ))}
                  {stoppedContainers.length > 3 && <p className="text-[10px] text-muted-foreground">+{stoppedContainers.length - 3} more</p>}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-[10px] text-success">
                  <CheckCircle className="w-3 h-3" />No stopped containers
                </div>
              )}
              <div className="mt-auto flex flex-col gap-1">
                <Button size="sm" className="bg-warning/90 hover:bg-warning text-black text-xs h-7 w-fit"
                  disabled={pruning !== null || stoppedContainers.length === 0}
                  onClick={() => handlePrune('containers', 'Container prune', `${stoppedContainers.length} stopped container(s) will be permanently removed. Their writable layers will be lost. Volumes are not affected.`)}>
                  {pruning === 'containers' ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Removing...</> : 'Remove Stopped'}
                </Button>
                <code className="text-[10px] font-mono text-muted-foreground/60">docker container prune -f</code>
              </div>
            </div>
          </div>

          {/* Row 2: Full Prune | Networks | Docker Connectivity */}
          <div className="grid grid-cols-3 gap-3">
            {/* Full System Prune */}
            <div className="rounded-lg border border-l-4 border-destructive/30 border-l-destructive bg-destructive/[0.03] p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                <h4 className="font-mono font-semibold text-xs text-destructive">Full System Prune</h4>
              </div>
              <p className="text-[11px] text-muted-foreground">Remove ALL unused images, volumes, containers, and networks.</p>
              <div>
                <p className="text-[10px] text-muted-foreground">Total to reclaim</p>
                <p className="text-lg font-mono font-bold text-destructive">~{formatBytes(totalReclaimable)}</p>
              </div>
              <div className="rounded bg-destructive/10 border border-destructive/20 p-1.5 text-[10px] text-destructive/80">
                Irreversible. Running containers not affected.
              </div>
              <div className="mt-auto flex flex-col gap-1">
                <Button size="sm" variant="destructive" className="text-xs h-7 w-fit"
                  disabled={pruning !== null} onClick={() => handlePrune('all', 'Full system prune', 'ALL unused images, volumes, stopped containers, and networks will be permanently deleted. Running containers are not affected but this action cannot be undone.')}>
                  {pruning === 'all' ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Pruning...</> : 'Full System Prune'}
                </Button>
                <code className="text-[10px] font-mono text-muted-foreground/60">docker system prune -a --volumes -f</code>
              </div>
            </div>

            {/* Prune Networks */}
            <div className={`rounded-lg border border-l-4 bg-card p-3 flex flex-col gap-2 ${networkPoolWarning ? 'border-orange-500/40 border-l-orange-500' : 'border-orange-500/20 border-l-orange-500'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Network className="w-4 h-4 text-orange-500 shrink-0" />
                  <h4 className="font-mono font-semibold text-xs">Prune Networks</h4>
                </div>
                {networkPoolWarning && (
                  <Badge className="text-[10px] bg-orange-500/15 text-orange-400 border-orange-500/30 py-0">Full!</Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">Remove unused networks. Prevents "address pool exhausted" errors.</p>
              <div className="flex gap-4">
                <div>
                  <p className="text-[10px] text-muted-foreground">Active</p>
                  <p className={`text-lg font-mono font-bold ${networkPoolWarning ? 'text-orange-400' : 'text-orange-500'}`}>{networkCount}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Threshold</p>
                  <p className="text-lg font-mono font-bold text-muted-foreground">{NETWORK_WARN_THRESHOLD}</p>
                </div>
              </div>
              {networkPoolWarning && (
                <div className="rounded bg-orange-500/10 border border-orange-500/20 p-1.5 text-[10px] text-orange-400">
                  Pool nearly full — remove unused stacks or prune now.
                </div>
              )}
              <div className="mt-auto flex flex-col gap-1">
                <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-white text-xs h-7 w-fit"
                  disabled={pruning !== null} onClick={() => handlePrune('networks', 'Network prune', 'All unused Docker networks (not connected to any container) will be removed. Running containers are not affected.')}>
                  {pruning === 'networks' ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Pruning...</> : 'Prune Networks'}
                </Button>
                <code className="text-[10px] font-mono text-muted-foreground/60">docker network prune -f</code>
              </div>
            </div>

            {/* Docker Connectivity */}
            <div className="rounded-lg border border-l-4 border-muted/30 border-l-muted bg-card p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Wifi className="w-4 h-4 text-muted-foreground shrink-0" />
                <h4 className="font-mono font-semibold text-xs">Docker Connectivity</h4>
              </div>
              <p className="text-[11px] text-muted-foreground">Test the connection to the Docker daemon via /var/run/docker.sock.</p>
              <div className="flex items-center gap-2 min-h-[1.5rem]">
                {socketResult === 'ok' && (
                  <div className="flex items-center gap-1.5 text-xs text-success"><CheckCircle className="w-3.5 h-3.5" />Socket OK</div>
                )}
                {socketResult === 'error' && (
                  <div className="flex items-center gap-1.5 text-xs text-destructive"><WifiOff className="w-3.5 h-3.5" />Socket unreachable!</div>
                )}
                {socketResult === null && !socketChecking && (
                  <span className="text-[11px] text-muted-foreground">Not tested yet</span>
                )}
              </div>
              <div className="mt-auto flex flex-col gap-1">
                <Button size="sm" variant="outline" className="text-xs h-7 w-fit"
                  disabled={socketChecking} onClick={checkSocket}>
                  {socketChecking ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Checking...</> : 'Check Socket'}
                </Button>
                <code className="text-[10px] font-mono text-muted-foreground/60">docker info</code>
              </div>
            </div>
          </div>
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
