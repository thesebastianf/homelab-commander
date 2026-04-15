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
  return (
    <Card className="p-6 hover:shadow-lg transition-all duration-200">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-mono font-semibold text-lg">{volume.name}</h3>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="font-mono">{volume.driver}</Badge>
            <span className="text-sm text-muted-foreground">{volume.size}</span>
          </div>
        </div>
      </div>

      {volume.containers.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Used by</p>
          <div className="flex flex-wrap gap-1">
            {volume.containers.map((c, i) => (
              <Badge key={i} variant="secondary" className="text-xs font-mono">{c}</Badge>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button onClick={onInspect} size="sm" variant="outline">
          <Search className="w-4 h-4 mr-2" /> Inspect
        </Button>
        <Button onClick={onRemove} size="sm" variant="outline" className="text-destructive"
          disabled={volume.containers.length > 0}>
          <Trash2 className="w-4 h-4 mr-2" /> Remove
        </Button>
      </div>
    </Card>
  )
}
