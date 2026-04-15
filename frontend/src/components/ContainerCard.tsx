import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
  const getStatusColor = (status: Container['status']) => {
    switch (status) {
      case 'running': return 'bg-success text-success-foreground'
      case 'stopped': return 'bg-muted text-muted-foreground'
      case 'paused': return 'bg-warning text-warning-foreground'
      case 'restarting': return 'bg-info text-info-foreground'
      default: return 'bg-muted text-muted-foreground'
    }
  }

  const isRunning = container.status === 'running'

  return (
    <Card className="p-6 hover:shadow-lg transition-all duration-200 group relative overflow-hidden border-l-4" style={{
      borderLeftColor: isRunning ? 'var(--success)' : 'var(--border)'
    }}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Box className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-mono font-semibold text-lg">{container.name}</h3>
              {container.updateAvailable && (
                <Badge variant="outline" className="border-warning text-warning">
                  <CloudDownload className="w-3 h-3 mr-1" />
                  Update
                </Badge>
              )}
              {container.autoUpdate && (
                <Badge variant="secondary" className="text-xs">Auto-Update</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground font-mono">{container.image}</p>
          </div>
        </div>
        <Badge className={cn(getStatusColor(container.status), isRunning && "animate-pulse-glow")}>
          {container.status}
        </Badge>
      </div>

      {/* Restart policy & Smart Start indicators */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {container.restartPolicy && container.restartPolicy !== 'no' && (
          <Badge variant="outline" className="text-xs font-mono gap-1">
            <RefreshCw className="w-3 h-3" />
            {container.restartPolicy}
          </Badge>
        )}
        {smartStartEnabled && (
          <Badge variant="outline" className="text-xs border-warning text-warning gap-1">
            <Zap className="w-3 h-3" />
            Smart Start
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
        <div>
          <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">CPU</p>
          <div className="flex items-baseline gap-1">
            <span className="font-mono font-semibold text-lg">{container.cpu.toFixed(1)}</span>
            <span className="text-muted-foreground">%</span>
          </div>
        </div>
        <div>
          <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Memory</p>
          <div className="flex items-baseline gap-1">
            <span className="font-mono font-semibold text-lg">{container.memory.toFixed(0)}</span>
            <span className="text-muted-foreground">MB</span>
          </div>
        </div>
        <div>
          <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Network RX</p>
          <div className="flex items-baseline gap-1">
            <span className="font-mono font-semibold text-lg">{(container.network.rx / 1024).toFixed(1)}</span>
            <span className="text-muted-foreground">KB/s</span>
          </div>
        </div>
        <div>
          <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">Network TX</p>
          <div className="flex items-baseline gap-1">
            <span className="font-mono font-semibold text-lg">{(container.network.tx / 1024).toFixed(1)}</span>
            <span className="text-muted-foreground">KB/s</span>
          </div>
        </div>
      </div>

      {container.ports.length > 0 && (
        <div className="mb-4 pb-4 border-b border-border">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Ports</p>
          <div className="flex flex-wrap gap-2">
            {container.ports.map((port, idx) => (
              <Badge key={idx} variant="outline" className="font-mono text-xs">{port}</Badge>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {!isRunning && (
          <Button onClick={() => onStart(container.id)} size="sm" variant="outline">
            <Play className="w-4 h-4 mr-2" /> Start
          </Button>
        )}
        {isRunning && (
          <>
            <Button onClick={() => onStop(container.id)} size="sm" variant="outline">
              <Square className="w-4 h-4 mr-2" /> Stop
            </Button>
            <Button onClick={() => onRestart(container.id)} size="sm" variant="outline">
              <RotateCw className="w-4 h-4 mr-2" /> Restart
            </Button>
          </>
        )}
        <Button onClick={() => onViewLogs(container.id)} size="sm" variant="outline">
          <FileText className="w-4 h-4 mr-2" /> Logs
        </Button>
        <Button onClick={() => onOpenTerminal(container.id)} size="sm" variant="outline" disabled={!isRunning}>
          <Terminal className="w-4 h-4 mr-2" /> Terminal
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm"><MoreHorizontal className="w-5 h-5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onRemove(container.id)} className="text-destructive">
              <Trash2 className="w-4 h-4 mr-2" /> Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  )
}
