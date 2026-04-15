import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Paintbrush, ImageIcon, HardDrive, Box, Network, Trash2, AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface SystemDfData {
  images?: { totalSize: number; reclaimable: number; count: number }
  volumes?: { totalSize: number; reclaimable: number; count: number }
  containers?: { totalSize: number; reclaimable: number; count: number }
}

interface MaintenanceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPurgeUnusedImages: () => Promise<void>
  onPruneSystems: () => Promise<void>
  onPruneImages?: () => Promise<void>
  onPruneVolumes?: () => Promise<void>
  onPruneContainers?: () => Promise<void>
  fetchSystemDf?: () => Promise<SystemDfData>
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

export function MaintenanceDialog({
  open,
  onOpenChange,
  onPurgeUnusedImages,
  onPruneSystems,
  onPruneImages,
  onPruneVolumes,
  onPruneContainers,
  fetchSystemDf,
}: MaintenanceDialogProps) {
  const [pruningType, setPruningType] = useState<string | null>(null)
  const [dfData, setDfData] = useState<SystemDfData | null>(null)

  useEffect(() => {
    if (open && fetchSystemDf) {
      fetchSystemDf().then(setDfData).catch(() => {})
    }
  }, [open, fetchSystemDf])

  const handlePrune = async (type: string, fn: () => Promise<void>, label: string) => {
    setPruningType(type)
    try {
      await fn()
      toast.success(`${label} completed`)
      if (fetchSystemDf) {
        fetchSystemDf().then(setDfData).catch(() => {})
      }
    } catch {
      toast.error(`Failed to ${label.toLowerCase()}`)
    } finally {
      setPruningType(null)
    }
  }

  const pruneItems: { id: string; icon: typeof ImageIcon; color: string; title: string; desc: string; fn: () => Promise<void>; reclaimable?: number }[] = [
    {
      id: 'images',
      icon: ImageIcon,
      color: 'text-accent',
      title: 'Prune Unused Images',
      desc: 'Remove dangling and unused Docker images',
      fn: onPruneImages || onPurgeUnusedImages,
      reclaimable: dfData?.images?.reclaimable,
    },
    {
      id: 'volumes',
      icon: HardDrive,
      color: 'text-yellow-500',
      title: 'Prune Unused Volumes',
      desc: 'Remove volumes not attached to any container',
      fn: onPruneVolumes || (async () => {}),
      reclaimable: dfData?.volumes?.reclaimable,
    },
    {
      id: 'containers',
      icon: Box,
      color: 'text-blue-500',
      title: 'Remove Stopped Containers',
      desc: 'Clean up containers that have exited',
      fn: onPruneContainers || (async () => {}),
      reclaimable: dfData?.containers?.reclaimable,
    },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Paintbrush className="w-6 h-6 text-primary" />
            System Maintenance
          </DialogTitle>
          <DialogDescription>
            Clean up unused resources and optimize your homelab
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* System Health */}
          {dfData && (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">System Disk Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  {([
                    { label: 'Images', data: dfData.images, icon: ImageIcon },
                    { label: 'Volumes', data: dfData.volumes, icon: HardDrive },
                    { label: 'Containers', data: dfData.containers, icon: Box },
                  ] as const).map(({ label, data, icon: Icon }) => (
                    <div key={label} className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Icon className="w-3 h-3" />
                        {label} ({data?.count ?? 0})
                      </div>
                      <div className="text-sm font-mono">{formatBytes(data?.totalSize ?? 0)}</div>
                      {(data?.reclaimable ?? 0) > 0 && (
                        <Badge variant="outline" className="text-[9px]">
                          {formatBytes(data!.reclaimable)} reclaimable
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Granular Prune Cards */}
          {pruneItems.map(item => {
            const Icon = item.icon
            return (
              <Card key={item.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Icon className={`w-6 h-6 ${item.color}`} />
                      <div>
                        <CardTitle className="text-base">{item.title}</CardTitle>
                        <CardDescription>
                          {item.desc}
                          {item.reclaimable != null && item.reclaimable > 0 && (
                            <span className="ml-2 text-primary">~{formatBytes(item.reclaimable)} reclaimable</span>
                          )}
                        </CardDescription>
                      </div>
                    </div>
                    <Button
                      onClick={() => handlePrune(item.id, item.fn, item.title)}
                      disabled={pruningType !== null}
                      variant="outline"
                      size="sm"
                    >
                      {pruningType === item.id ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Pruning...</>
                      ) : (
                        <><Trash2 className="w-4 h-4 mr-2" /> Prune</>
                      )}
                    </Button>
                  </div>
                </CardHeader>
              </Card>
            )
          })}

          {/* Full System Prune — Danger Zone */}
          <Card className="border-destructive/50 bg-destructive/5">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-6 h-6 text-destructive" />
                  <div>
                    <CardTitle className="text-base">Full System Prune</CardTitle>
                    <CardDescription>Remove ALL unused images, volumes, containers, and networks at once</CardDescription>
                  </div>
                </div>
                <Button
                  onClick={() => handlePrune('system', onPruneSystems, 'Full system prune')}
                  disabled={pruningType !== null}
                  variant="destructive"
                  size="sm"
                >
                  {pruningType === 'system' ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Pruning...</>
                  ) : (
                    <><Trash2 className="w-4 h-4 mr-2" /> Prune All</>
                  )}
                </Button>
              </div>
            </CardHeader>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  )
}
