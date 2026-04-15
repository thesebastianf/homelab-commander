import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Trash2, Search } from 'lucide-react'
import type { Volume } from '@/lib/types'

interface VolumeCardProps {
  volume: Volume
  onRemove: () => void
  onInspect: () => void
}

export function VolumeCard({ volume, onRemove, onInspect }: VolumeCardProps) {
  const isInUse = volume.containers.length > 0
  const isOrphaned = !isInUse

  return (
    <Card className="p-4 hover:shadow-lg transition-all duration-200">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-mono font-semibold text-sm truncate">{volume.name}</h3>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="font-mono text-xs">{volume.driver}</Badge>
            {volume.size && <span className="text-xs text-muted-foreground">{volume.size}</span>}
          </div>
        </div>
      </div>

      {isInUse && (
        <div className="mb-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Used by</p>
          <div className="flex flex-wrap gap-1">
            {volume.containers.map((c, i) => (
              <span
                key={i}
                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-primary/10 text-primary border border-primary/20"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button onClick={onInspect} size="sm" variant="outline" className="h-7 px-2 text-xs">
          <Search className="w-3.5 h-3.5 mr-1" /> Inspect
        </Button>
        <Button
          onClick={onRemove}
          size="sm"
          variant="outline"
          className={
            isOrphaned
              ? 'h-7 px-2 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive'
              : 'h-7 px-2 text-xs text-muted-foreground'
          }
          disabled={isInUse}
        >
          <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
        </Button>
      </div>
    </Card>
  )
}
