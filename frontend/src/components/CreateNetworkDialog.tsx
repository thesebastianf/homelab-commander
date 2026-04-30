import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useCreateNetwork } from '@/hooks/useNetworks'

interface CreateNetworkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateNetworkDialog({ open, onOpenChange }: CreateNetworkDialogProps) {
  const [name, setName] = useState('')
  const [driver, setDriver] = useState('bridge')
  const createMutation = useCreateNetwork()

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Network name is required')
      return
    }

    try {
      await createMutation.mutateAsync({ name: name.trim(), driver })
      toast.success(`Network "${name}" created successfully`)
      setName('')
      setDriver('bridge')
      onOpenChange(false)
    } catch (error) {
      toast.error(`Failed to create network: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Central Network</DialogTitle>
          <DialogDescription>
            Create a new network to share across multiple stacks. This helps avoid Docker network pool exhaustion.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="network-name" className="text-sm font-medium">
              Network Name
            </Label>
            <Input
              id="network-name"
              placeholder="e.g., proxy_net, monitoring_net"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={createMutation.isPending}
              className="mt-1.5 font-mono"
            />
          </div>

          <div>
            <Label htmlFor="network-driver" className="text-sm font-medium">
              Driver
            </Label>
            <Select value={driver} onValueChange={setDriver} disabled={createMutation.isPending}>
              <SelectTrigger id="network-driver" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bridge">bridge</SelectItem>
                <SelectItem value="overlay">overlay</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="bg-accent/10 border border-accent/20 rounded p-3 text-xs text-muted-foreground">
            <p className="font-semibold text-accent mb-1">Tip:</p>
            <p>
              Use <span className="font-mono">bridge</span> for local networks.{' '}
              <span className="font-mono">overlay</span> requires Docker Swarm mode. Reference this network in multiple
              stacks using <span className="font-mono">external: true</span> in your compose file.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending || !name.trim()}>
              {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Network
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
