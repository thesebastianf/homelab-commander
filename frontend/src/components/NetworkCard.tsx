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
import { Network as NetworkIcon, MoreHorizontal, Trash2, Info, Link2 } from 'lucide-react'
import type { Network } from '@/lib/types'
import { cn } from '@/lib/utils'

interface NetworkCardProps {
  network: Network
  onRemove?: (id: string) => void
  onInspect?: (id: string) => void
}

export function NetworkCard({ network, onRemove, onInspect }: NetworkCardProps) {
  const isInUse = network.containers.length > 0
  const isSystemNetwork = ['bridge', 'host', 'none'].includes(network.name)

  return (
    <Card className="p-6 hover:shadow-lg transition-all duration-200 group">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-3 flex-1">
          <div className="p-2 rounded-lg bg-accent/10 text-accent">
            <NetworkIcon className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="font-mono font-semibold text-lg">{network.name}</h3>
              {isSystemNetwork && (
                <Badge variant="outline" className="font-mono text-xs">
                  System
                </Badge>
              )}
              {isInUse && (
                <Badge className="bg-success/10 text-success border-success/20 gap-1">
                  <Link2 className="w-3.5 h-3.5" />
                  {network.containers.length} Connected
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="font-mono">
                {network.driver}
              </Badge>
              <span className="text-sm text-muted-foreground">•</span>
              <span className="text-sm text-muted-foreground capitalize">{network.scope}</span>
            </div>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="w-5 h-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onInspect?.(network.id)}>
              <Info className="w-4 h-4 mr-2" />
              Inspect
            </DropdownMenuItem>
            {!isSystemNetwork && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={() => onRemove?.(network.id)} 
                  className={cn("text-destructive", isInUse && "opacity-50 cursor-not-allowed")}
                  disabled={isInUse}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Remove {isInUse && "(In Use)"}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isInUse && (
        <div className="text-xs text-muted-foreground">
          <span className="font-semibold">Connected containers:</span>
          <div className="flex flex-wrap gap-2 mt-2">
            {network.containers.map(container => (
              <Badge key={container} variant="outline" className="font-mono">
                {container}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {!isInUse && (
        <div className="text-xs text-muted-foreground italic">
          No containers connected
        </div>
      )}
    </Card>
  )
}
