import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
    <Card className={cn(
      "px-5 py-4 hover:shadow-md transition-all duration-200 border-l-4",
      isRunning ? "border-l-success" : isStopped ? "border-l-border" : "border-l-warning"
    )}>
      {/* Top row: name + status + badges + actions */}
      <div className="flex items-center gap-3 justify-between">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="p-1.5 rounded-md bg-primary/10 text-primary shrink-0">
            <Box className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-mono font-semibold text-base leading-tight truncate">{container.name}</h3>
              <Badge className={cn("text-xs px-2 py-0 border", statusColor)}>
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
                  Smart Start
                </Badge>
              )}
              {container.updateAvailable && (
                <Badge variant="outline" className="text-xs border-warning text-warning gap-1 px-1.5 py-0">
                  <CloudDownload className="w-2.5 h-2.5" />
                  Update avail.
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">{container.image}</p>
          </div>
        </div>

        {/* Action buttons right-aligned */}
        <div className="flex items-center gap-1 shrink-0">
          {!isRunning && (
            <Button onClick={() => onStart(container.id)} size="sm" variant="ghost" className="h-8 w-8 p-0 text-success hover:text-success hover:bg-success/10">
              <Play className="w-4 h-4" />
            </Button>
          )}
          {isRunning && (
            <>
              <Button onClick={() => onStop(container.id)} size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive">
                <Square className="w-4 h-4" />
              </Button>
              <Button onClick={() => onRestart(container.id)} size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
                <RotateCw className="w-4 h-4" />
              </Button>
              <Button onClick={() => onViewLogs(container.id)} size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
                <FileText className="w-4 h-4" />
              </Button>
              <Button onClick={() => onOpenTerminal(container.id)} size="sm" variant="ghost"
                className="h-8 w-8 p-0 text-primary hover:text-primary hover:bg-primary/10 border border-primary/30">
                <Terminal className="w-4 h-4" />
              </Button>
            </>
          )}
          {isStopped && (
            <Button onClick={() => onRemove(container.id)} size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive">
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
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
              <DropdownMenuItem onClick={() => onRemove(container.id)} className="text-destructive">
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
          <span>NET ↓ <span className="text-foreground font-semibold">{formatNet(container.network.rx / 1024)}</span></span>
          <span>NET ↑ <span className="text-foreground font-semibold">{formatNet(container.network.tx / 1024)}</span></span>
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
  )
}
