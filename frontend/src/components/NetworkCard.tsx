import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Network as NetworkIcon, Trash2, Info } from 'lucide-react'
import type { Network } from '@/lib/types'

interface NetworkCardProps {
  network: Network
  onRemove?: (id: string) => void
  onInspect?: (id: string) => void
}

export function NetworkCard({ network, onRemove, onInspect }: NetworkCardProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const isInUse = network.containers.length > 0
  const isSystemNetwork = ['bridge', 'host', 'none'].includes(network.name)
  const isManuallyCreated = network.isManuallyCreated === true

  return (
    <>
    <Card className={`p-4 hover:shadow-lg transition-all duration-200 ${
      isManuallyCreated 
        ? 'border-accent/50 bg-accent/5' 
        : ''
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={`p-2 rounded-lg shrink-0 ${
            isManuallyCreated
              ? 'bg-accent/20 text-accent'
              : 'bg-accent/10 text-accent'
          }`}>
            <NetworkIcon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="font-mono font-semibold text-sm">{network.name}</h3>
              {isManuallyCreated && (
                <Badge variant="default" className="font-mono text-xs bg-accent text-accent-foreground">
                  central
                </Badge>
              )}
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
          <TooltipProvider delayDuration={400}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onInspect?.(network.id)}
              >
                <Info className="w-3.5 h-3.5 mr-1" />
                Inspect
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-mono text-xs">docker network inspect {network.name}</p>
            </TooltipContent>
          </Tooltip>
          {!isSystemNetwork && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirmOpen(true)}
                  disabled={isInUse}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Remove
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-mono text-xs">docker network rm {network.name}</p>
                {isInUse && <p className="text-xs text-muted-foreground mt-0.5">Cannot remove: network is in use</p>}
              </TooltipContent>
            </Tooltip>
          )}
          </TooltipProvider>
        </div>
      </div>
    </Card>

    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Network?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the network <span className="font-mono font-semibold">{network.name}</span>.
            {isManuallyCreated && (
              <p className="mt-2 text-accent">
                This is a central network. Stacks using <span className="font-mono">external: true</span> will lose connectivity if they still reference it.
              </p>
            )}
            Containers connected to this network will lose their connection. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => { setConfirmOpen(false); onRemove?.(network.id); }}
          >
            Remove Network
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
