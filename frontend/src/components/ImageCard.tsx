import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Download, Trash2 } from 'lucide-react'
import type { Image } from '@/lib/types'

interface ImageCardProps {
  image: Image
  onPull: () => void
  onRemove: () => void
}

function formatRelativeTime(isoDate: string): string {
  const seconds = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`
  return `${Math.floor(months / 12)} year${Math.floor(months / 12) !== 1 ? 's' : ''} ago`
}

export function ImageCard({ image, onPull, onRemove }: ImageCardProps) {
  return (
    <Card className="p-4 hover:shadow-lg transition-all duration-200">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-mono font-semibold text-sm truncate">{image.repository}</h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant="outline" className="font-mono text-xs">{image.tag}</Badge>
            <span className="text-xs text-muted-foreground">{image.size}</span>
            <span className="text-xs text-muted-foreground">•</span>
            <span className="text-xs text-muted-foreground">{formatRelativeTime(image.created)}</span>
          </div>
        </div>
        {image.inUse ? (
          <Badge className="shrink-0 bg-success/15 text-success border-success/30 text-xs">In Use</Badge>
        ) : (
          <Badge variant="outline" className="shrink-0 text-muted-foreground text-xs">Unused</Badge>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={onPull} size="sm" variant="outline" className="h-7 px-2 text-xs">
          <Download className="w-3.5 h-3.5 mr-1" /> Pull
        </Button>
        <Button
          onClick={onRemove}
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
          disabled={image.inUse}
        >
          <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
        </Button>
      </div>
    </Card>
  )
}
