import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Network as NetworkIcon, Trash2, Info } from 'lucide-react'
import type { Network } from '@/lib/types'

interface NetworkCardProps {
  network: Network
  onRemove?: (id: string) => void
  onInspect?: (id: string) => void
}

export function NetworkCard({ network, onRemove, onInspect }: NetworkCardProps) {
  const isInUse = network.containers.length > 0
  const isSystemNetwork = ['bridge', 'host', 'none'].includes(network.name)

  return (
    <Card className="p-4 hover:shadow-lg transition-all duration-200">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="p-2 rounded-lg bg-accent/10 text-accent shrink-0">
            <NetworkIcon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="font-mono font-semibold text-sm">{network.name}</h3>
              {isSystemNetwork && (
                <Badge variant="outline" className="font-mono text-xs">system</Badge>
              )}
              <Badge variant="outline" className="font-mono text-xs">{network.driver}</Badge>
            </div>
            {(network.subnet || network.gateway) && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
                {network.subnet && <span>subnet: {network.subnet}</span>}
                {network.gateway && <span>gw: {network.gateway}</span>}
              </div>
            )}
            {isInUse && (
              <div className="flex flex-wrap gap-1 mt-2">
                {network.containers.map(container => (
                  <span
                    key={container}
                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-success/15 text-success border border-success/30"
                  >
                    {container}
                  </span>
                ))}
              </div>
            )}
            {!isInUse && (
              <p className="text-xs text-muted-foreground italic mt-1">No containers connected</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onInspect?.(network.id)}
          >
            <Info className="w-3.5 h-3.5 mr-1" />
            Inspect
          </Button>
          {!isSystemNetwork && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => onRemove?.(network.id)}
              disabled={isInUse}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Remove
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}
