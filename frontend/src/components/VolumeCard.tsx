import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Trash2, Search } from 'lucide-react'
import type { Volume } from '@/lib/types'

interface VolumeCardProps {
  volume: Volume
  onRemove: () => void
  onInspect: () => void
}

export function VolumeCard({ volume, onRemove, onInspect }: VolumeCardProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const isInUse = volume.containers.length > 0
  const isOrphaned = !isInUse

  return (
    <>
    <Card className="card-surface lift p-4 rounded-xl">
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
        <TooltipProvider delayDuration={400}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button onClick={onInspect} size="sm" variant="outline" className="h-7 px-2 text-xs">
              <Search className="w-3.5 h-3.5 mr-1" /> Inspect
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="font-mono text-xs">docker volume inspect {volume.name}</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={() => setConfirmOpen(true)}
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
          </TooltipTrigger>
          <TooltipContent>
            <p className="font-mono text-xs">docker volume rm {volume.name}</p>
            {isInUse && <p className="text-xs text-muted-foreground mt-0.5">Cannot remove: volume is in use</p>}
          </TooltipContent>
        </Tooltip>
        </TooltipProvider>
      </div>
    </Card>

    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Volume?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the volume <span className="font-mono font-semibold">{volume.name}</span> and all its data.
            This action cannot be undone and the data will be unrecoverable.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => { setConfirmOpen(false); onRemove(); }}
          >
            Delete Volume
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
