import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Play, Square, RotateCw, Trash2, MoreHorizontal, Terminal, FileText, Box, CloudDownload, Zap, RefreshCw } from 'lucide-react'
import type { Container } from '@/lib/types'
import { cn } from '@/lib/utils'

interface ContainerCardProps {
  container: Container
  onStart: (id: string) => void
  onStop: (id: string) => void
  onRestart: (id: string) => void
  onRemove: (id: string) => void
  onViewLogs: (id: string) => void
  onOpenTerminal: (id: string) => void
  smartStartEnabled?: boolean
}

export function ContainerCard({
  container, onStart, onStop, onRestart, onRemove, onViewLogs, onOpenTerminal, smartStartEnabled,
}: ContainerCardProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const isRunning = container.status === 'running'
  const isStopped = container.status === 'stopped'

  const statusColor =
    container.status === 'running' ? 'bg-success/15 text-success border-success/30' :
    container.status === 'stopped' ? 'bg-muted/50 text-muted-foreground border-border' :
    container.status === 'paused' ? 'bg-warning/15 text-warning border-warning/30' :
    'bg-info/15 text-info border-info/30'

  const formatBytes = (bytes: number) => {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${bytes} B`
  }

  const formatNet = (kbps: number) => {
    const mbps = kbps / 1024
    return mbps >= 1 ? `${mbps.toFixed(1)} MB/s` : `${kbps.toFixed(0)} KB/s`
  }

  return (
    <>
    <Card className={cn(
      "card-surface lift relative px-4 sm:px-5 py-3.5 sm:py-4 rounded-xl overflow-hidden",
      "before:absolute before:left-0 before:top-0 before:h-full before:w-[3px] before:content-['']",
      isRunning ? "before:bg-success" : isStopped ? "before:bg-border" : "before:bg-warning"
    )}>
      {/* Top row: name + status + badges + actions */}
      <div className="relative flex items-center gap-3 justify-between">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
          <div className="relative shrink-0">
            <div className="p-1.5 rounded-lg bg-surface-3 border border-border/60 text-foreground/80">
              <Box className="w-4 h-4" strokeWidth={2.25} />
            </div>
            <span
              className="status-dot absolute -top-0.5 -right-0.5 ring-2 ring-card"
              data-state={isRunning ? 'running' : container.status === 'paused' ? 'warning' : isStopped ? 'idle' : 'deploying'}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <h3 className="font-mono font-semibold text-[15px] leading-tight truncate">{container.name}</h3>
              <Badge className={cn("text-[10px] px-2 py-0 border uppercase tracking-wider font-semibold", statusColor)}>
                {container.status}
              </Badge>
              {container.restartPolicy && container.restartPolicy !== 'no' && (
                <Badge variant="outline" className="text-xs font-mono gap-1 px-1.5 py-0">
                  <RefreshCw className="w-2.5 h-2.5" />
                  {container.restartPolicy}
                </Badge>
              )}
              {smartStartEnabled && (
                <Badge variant="outline" className="text-xs border-warning text-warning gap-1 px-1.5 py-0">
                  <Zap className="w-2.5 h-2.5" />
                  <span className="hidden sm:inline">Smart Start</span>
                  <span className="sm:hidden">SS</span>
                </Badge>
              )}
              {container.updateAvailable && (
                <Badge variant="outline" className="text-xs border-warning text-warning gap-1 px-1.5 py-0">
                  <CloudDownload className="w-2.5 h-2.5" />
                  <span className="hidden sm:inline">Update avail.</span>
                  <span className="sm:hidden">Upd</span>
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">{container.image}</p>
          </div>
        </div>

        {/* Action buttons right-aligned */}
        <div className="flex items-center gap-1 shrink-0">
          <TooltipProvider delayDuration={400}>
          {!isRunning && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={() => onStart(container.id)} size="sm" variant="ghost" className="h-8 w-8 p-0 text-success hover:text-success hover:bg-success/10">
                  <Play className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-mono text-xs">docker start {container.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Start the stopped container</p>
              </TooltipContent>
            </Tooltip>
          )}
          {isRunning && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={() => onStop(container.id)} size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive">
                    <Square className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-mono text-xs">docker stop {container.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Gracefully stop the container</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={() => onRestart(container.id)} size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
                    <RotateCw className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-mono text-xs">docker restart {container.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Stop and start the container</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={() => onViewLogs(container.id)} size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
                    <FileText className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-mono text-xs">docker logs --tail 100 {container.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">View recent container logs</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={() => onOpenTerminal(container.id)} size="sm" variant="ghost"
                    className="h-8 w-8 p-0 text-primary hover:text-primary hover:bg-primary/10 border border-primary/30">
                    <Terminal className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-mono text-xs">docker exec -it {container.name} sh</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Open interactive shell in container</p>
                </TooltipContent>
              </Tooltip>
            </>
          )}
          {isStopped && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={() => setConfirmOpen(true)} size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-mono text-xs">docker rm {container.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Permanently remove this container</p>
              </TooltipContent>
            </Tooltip>
          )}
          </TooltipProvider>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isRunning && (
                <DropdownMenuItem onClick={() => onViewLogs(container.id)}>
                  <FileText className="w-4 h-4 mr-2" /> View Logs
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setConfirmOpen(true)} className="text-destructive">
                <Trash2 className="w-4 h-4 mr-2" /> Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Metrics row (only for running containers) */}
      {isRunning && (
        <div className="flex items-center gap-4 mt-2 text-xs font-mono text-muted-foreground flex-wrap">
          <span>CPU <span className="text-foreground font-semibold">{container.cpu.toFixed(1)}%</span></span>
          <span>MEM <span className="text-foreground font-semibold">{container.memory.toFixed(0)} MB</span></span>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help flex items-center">
                  NET ↓ <span className="text-foreground font-semibold ml-1">{formatNet(container.network.rx / 1024)}</span>
                  <span className="text-[10px] text-muted-foreground/70 ml-1">({formatBytes(container.network.totalRx || 0)})</span>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Current rate: {formatNet(container.network.rx / 1024)}</p>
                <p className="text-xs">Total Downloaded: {formatBytes(container.network.totalRx || 0)}</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help flex items-center">
                  NET ↑ <span className="text-foreground font-semibold ml-1">{formatNet(container.network.tx / 1024)}</span>
                  <span className="text-[10px] text-muted-foreground/70 ml-1">({formatBytes(container.network.totalTx || 0)})</span>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Current rate: {formatNet(container.network.tx / 1024)}</p>
                <p className="text-xs">Total Uploaded: {formatBytes(container.network.totalTx || 0)}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}

      {/* Ports */}
      {container.ports.length > 0 && (
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Ports:</span>
          {container.ports.map((port, idx) => (
            <Badge key={idx} variant="outline" className="font-mono text-xs px-1.5 py-0">{port}</Badge>
          ))}
        </div>
      )}
    </Card>

    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Container?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove the container <span className="font-mono font-semibold">{container.name}</span>.
            The container and its writable layer will be deleted. Volumes are not affected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => { setConfirmOpen(false); onRemove(container.id); }}
          >
            Remove Container
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
