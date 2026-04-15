import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Zap, Plus, Trash2, Server } from 'lucide-react'
import type { Stack, Container } from '@/lib/types'
import { toast } from 'sonner'

interface SmartStartupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  stacks: Stack[]
  containers: Container[]
  onUpdateStack: (stack: Stack) => void
  onUpdateContainer: (container: Container) => void
}

export function SmartStartupDialog({
  open,
  onOpenChange,
  stacks,
  containers,
  onUpdateStack
}: SmartStartupDialogProps) {
  const [newDeviceName, setNewDeviceName] = useState('')
  const [newDeviceIp, setNewDeviceIp] = useState('')

  const handleToggleSmartStartup = (stack: Stack, enabled: boolean) => {
    onUpdateStack({
      ...stack,
      smartStartup: {
        ...(stack.smartStartup || { enabled: false, triggerType: 'ping', devices: [] }),
        enabled
      }
    })
    toast.success(`Smart startup ${enabled ? 'enabled' : 'disabled'} for ${stack.name}`)
  }

  const handleUpdateTriggerType = (stack: Stack, triggerType: string) => {
    onUpdateStack({
      ...stack,
      smartStartup: {
        ...(stack.smartStartup || { enabled: true, triggerType: 'ping', devices: [] }),
        triggerType
      }
    })
  }

  const handleAddDevice = (stack: Stack) => {
    if (!newDeviceName.trim() || !newDeviceIp.trim()) {
      toast.error('Device name and IP are required')
      return
    }
    const devices = [...(stack.smartStartup?.devices || []), {
      name: newDeviceName.trim(),
      ip: newDeviceIp.trim(),
      online: false
    }]
    onUpdateStack({
      ...stack,
      smartStartup: {
        ...(stack.smartStartup || { enabled: true, triggerType: 'ping' }),
        devices
      }
    })
    setNewDeviceName('')
    setNewDeviceIp('')
    toast.success(`Device "${newDeviceName}" added`)
  }

  const handleRemoveDevice = (stack: Stack, deviceIndex: number) => {
    const devices = (stack.smartStartup?.devices || []).filter((_, i) => i !== deviceIndex)
    onUpdateStack({
      ...stack,
      smartStartup: {
        ...(stack.smartStartup || { enabled: true, triggerType: 'ping' }),
        devices
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-6 h-6 text-primary" />
            Smart Startup
          </DialogTitle>
          <DialogDescription>
            Automatically start stacks when devices come online
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[500px] mt-4">
          <div className="space-y-4">
            {stacks.map((stack) => (
              <Card key={stack.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-mono">{stack.name}</CardTitle>
                      <CardDescription>
                        <Badge variant={stack.status === 'running' ? 'default' : 'secondary'} className="mt-1">
                          {stack.status}
                        </Badge>
                      </CardDescription>
                    </div>
                    <Switch
                      checked={stack.smartStartup?.enabled || false}
                      onCheckedChange={(checked) => handleToggleSmartStartup(stack, checked)}
                    />
                  </div>
                </CardHeader>
                {stack.smartStartup?.enabled && (
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs">Trigger Type</Label>
                      <Select
                        value={stack.smartStartup.triggerType || 'ping'}
                        onValueChange={(v) => handleUpdateTriggerType(stack, v)}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ping">Ping (ICMP)</SelectItem>
                          <SelectItem value="arp">ARP Table</SelectItem>
                          <SelectItem value="tcp">TCP Port Check</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Trigger Devices</Label>
                      <div className="space-y-2">
                        {(stack.smartStartup.devices || []).map((device, idx) => (
                          <div key={idx} className="flex items-center gap-2 p-2 rounded border border-border bg-muted/30">
                            <Server className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm font-mono flex-1">{device.name}</span>
                            <Badge variant="outline" className="font-mono text-xs">{device.ip}</Badge>
                            <Badge variant={device.online ? 'default' : 'secondary'} className="text-xs">
                              {device.online ? 'Online' : 'Offline'}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => handleRemoveDevice(stack, idx)}
                            >
                              <Trash2 className="w-3 h-3 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          value={newDeviceName}
                          onChange={(e) => setNewDeviceName(e.target.value)}
                          placeholder="Device name"
                          className="h-8 text-sm"
                        />
                        <Input
                          value={newDeviceIp}
                          onChange={(e) => setNewDeviceIp(e.target.value)}
                          placeholder="192.168.1.x"
                          className="h-8 text-sm font-mono"
                        />
                        <Button size="sm" onClick={() => handleAddDevice(stack)}>
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
