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
import { Layers, MoreHorizontal, Play, Square, RotateCw, Trash2, FileText, Code, Pencil, Save, Zap, Clock, HardDrive } from 'lucide-react'
import type { Stack } from '@/lib/types'
import { cn } from '@/lib/utils'
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

  return (
    <Card className="p-6 hover:shadow-lg transition-all duration-200 group relative overflow-hidden border-l-4" style={{
      borderLeftColor: stack.status === 'running' ? 'var(--success)' : stack.status === 'failed' ? 'var(--destructive)' : 'var(--border)'
    }}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-mono font-semibold text-lg">{stack.name}</h3>
            <p className="text-sm text-muted-foreground">{stack.services} services • Version {stack.version}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={cn(getStatusColor(stack.status), isRunning && "animate-pulse-glow")}>
            {stack.status}
          </Badge>
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

      <div className="text-xs text-muted-foreground font-mono bg-muted/30 p-3 rounded max-h-32 overflow-auto">
        <pre className="whitespace-pre-wrap break-all">{stack.compose.slice(0, 200)}...</pre>
      </div>
    </Card>
  )
}
