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
import { Layers, MoreHorizontal, Play, Square, RotateCw, Trash2, FileText, Code, Pencil, Save, Zap, Clock, HardDrive, AlertTriangle, Network } from 'lucide-react'
import type { Stack } from '@/lib/types'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatDistanceToNow } from 'date-fns'

interface StackCardProps {
  stack: Stack
  onStart?: (id: string) => void
  onStop?: (id: string) => void
  onRestart?: (id: string) => void
  onRemove?: (id: string) => void
  onViewCompose?: (id: string) => void
  onViewLogs?: (id: string) => void
  onEdit?: (stack: Stack) => void
}

export function StackCard({ stack, onStart, onStop, onRestart, onRemove, onViewCompose, onViewLogs, onEdit }: StackCardProps) {
  const getStatusColor = (status: Stack['status']) => {
    switch (status) {
      case 'running':
        return 'bg-success text-success-foreground'
      case 'stopped':
        return 'bg-muted text-muted-foreground'
      case 'failed':
        return 'bg-destructive text-destructive-foreground'
      case 'deploying':
        return 'bg-info text-info-foreground'
      default:
        return 'bg-muted text-muted-foreground'
    }
  }

  const isRunning = stack.status === 'running'
  const accentClass =
    stack.status === 'running' ? 'before:bg-success' :
    stack.status === 'failed' ? 'before:bg-destructive' :
    stack.status === 'deploying' ? 'before:bg-info' :
    'before:bg-border'

  const dotState =
    stack.status === 'running' ? 'running' :
    stack.status === 'failed' ? 'failed' :
    stack.status === 'deploying' ? 'deploying' : 'idle'

  return (
    <TooltipProvider delayDuration={200}>
    <Card className={cn(
      "card-surface lift p-4 sm:p-5 lg:p-6 group relative overflow-hidden rounded-xl",
      "before:absolute before:left-0 before:top-0 before:h-full before:w-[3px] before:content-['']",
      accentClass
    )}>
      {/* Decorative gradient halo on hover */}
      <div className="pointer-events-none absolute -top-24 -right-24 w-72 h-72 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500"
           style={{ background: 'radial-gradient(circle, color-mix(in oklch, var(--accent) 18%, transparent) 0%, transparent 70%)' }} />

      <div className="relative flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="relative shrink-0">
            <div className="p-2.5 rounded-xl brand-grad text-primary-foreground shadow-lg shadow-accent/20">
              <Layers className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={2.25} />
            </div>
            <span className={cn("status-dot absolute -top-0.5 -right-0.5 ring-2 ring-card")} data-state={dotState} />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-base sm:text-lg truncate tracking-tight">{stack.name}</h3>
            <p className="text-xs sm:text-sm text-muted-foreground truncate">
              <span className="font-mono">{stack.services}</span> services · v<span className="font-mono">{stack.version}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <Badge className={cn(getStatusColor(stack.status), "uppercase text-[10px] tracking-wider font-semibold px-2 py-0.5")}>
            {stack.status}
          </Badge>
          {stack.hasHostNetworking && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="gap-1.5 bg-warning/15 text-warning border-warning/40 hover:bg-warning/25">
                  <Network className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Host Network</span>
                  <span className="sm:hidden">Host</span>
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">This stack uses host networking mode. All container ports are directly exposed on the host network without explicit port mappings.</p>
              </TooltipContent>
            </Tooltip>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!isRunning && stack.status !== 'deploying' && (
                <DropdownMenuItem onClick={() => onStart?.(stack.id)}>
                  <Play className="w-4 h-4 mr-2" />
                  Start Stack
                </DropdownMenuItem>
              )}
              {isRunning && (
                <>
                  <DropdownMenuItem onClick={() => onStop?.(stack.id)}>
                    <Square className="w-4 h-4 mr-2" />
                    Stop Stack
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onRestart?.(stack.id)}>
                    <RotateCw className="w-4 h-4 mr-2" />
                    Restart Stack
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onEdit?.(stack)}>
                <Pencil className="w-4 h-4 mr-2" />
                Edit Stack
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewCompose?.(stack.id)}>
                <Code className="w-4 h-4 mr-2" />
                View Compose File
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewLogs?.(stack.id)}>
                <FileText className="w-4 h-4 mr-2" />
                View Logs
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onRemove?.(stack.id)} className="text-destructive">
                <Trash2 className="w-4 h-4 mr-2" />
                Remove Stack
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mb-4 pb-4 border-b border-border space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stack.backupConfig && (
            <>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Backups</p>
                <div className="flex items-center gap-1">
                  <Save className={cn("w-3.5 h-3.5", stack.backupConfig.enabled ? "text-accent" : "text-muted-foreground")} />
                  <span className={cn("text-sm font-medium", stack.backupConfig.enabled ? "text-accent" : "text-muted-foreground")}>
                    {stack.backupConfig.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>
              
              {stack.backupConfig.enabled && stack.backupConfig.lastBackup && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Last Backup</p>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm font-mono font-medium" title={stack.backupConfig.lastBackup}>
                      {formatDistanceToNow(new Date(stack.backupConfig.lastBackup), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              )}
              
              {stack.backupConfig.enabled && stack.backupConfig.backupSize && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Backup Size</p>
                  <div className="flex items-center gap-1">
                    <HardDrive className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm font-mono font-medium">
                      {stack.backupConfig.backupSize}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
          
          {stack.smartStartup && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Smart Start</p>
              <div className="flex items-center gap-1">
                <Zap className={cn("w-3.5 h-3.5", stack.smartStartup.enabled ? "text-accent" : "text-muted-foreground")} />
                <span className={cn("text-sm font-medium", stack.smartStartup.enabled ? "text-accent" : "text-muted-foreground")}>
                  {stack.smartStartup.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="text-xs text-muted-foreground font-mono surface-2 p-3 rounded-md max-h-32 overflow-auto border border-border/50">
        <pre className="whitespace-pre-wrap break-all">{stack.compose.slice(0, 200)}...</pre>
      </div>
    </Card>
    </TooltipProvider>
  )
}
