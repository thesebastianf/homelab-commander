import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Download, Trash2, Tag } from 'lucide-react'
import type { Image } from '@/lib/types'

interface ImageCardProps {
  image: Image
  onPull: () => void
  onRemove: () => void
  onTag: () => void
}

export function ImageCard({ image, onPull, onRemove, onTag }: ImageCardProps) {
  return (
    <Card className="p-6 hover:shadow-lg transition-all duration-200">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-mono font-semibold text-lg">{image.repository}</h3>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="font-mono">{image.tag}</Badge>
            <span className="text-sm text-muted-foreground">{image.size}</span>
            {image.inUse && <Badge variant="secondary" className="text-xs">In Use</Badge>}
          </div>
        </div>
        <p className="text-xs text-muted-foreground font-mono">{image.id}</p>
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={onPull} size="sm" variant="outline">
          <Download className="w-4 h-4 mr-2" /> Pull
        </Button>
        <Button onClick={onTag} size="sm" variant="outline">
          <Tag className="w-4 h-4 mr-2" /> Tag
        </Button>
        <Button onClick={onRemove} size="sm" variant="outline" className="text-destructive" disabled={image.inUse}>
          <Trash2 className="w-4 h-4 mr-2" /> Remove
        </Button>
      </div>
    </Card>
  )
}
