import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Zap, Loader2, Info, Wifi, WifiOff, Clock, Timer } from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import type { Stack, SmartStartupConfig } from '@/lib/types'
import {
  useSmartStartupConfigs,
  useSmartStartupDeviceStatus,
  useCreateSmartStartupConfig,
  useUpdateSmartStartupConfig,
  useDeleteSmartStartupConfig,
} from '@/hooks/useServices'

interface SmartStartupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  stacks: Stack[]
}

interface StackRowProps {
  stack: Stack
  config?: SmartStartupConfig
  onCreate: ReturnType<typeof useCreateSmartStartupConfig>
  onUpdate: ReturnType<typeof useUpdateSmartStartupConfig>
  onDelete: ReturnType<typeof useDeleteSmartStartupConfig>
}

function StackRow({ stack, config, onCreate, onUpdate }: StackRowProps) {
  const [draft, setDraft] = useState<Partial<SmartStartupConfig> | null>(null)
  const enabled = config?.enabled ?? false
  const isDirty = draft !== null
  const isBusy = onCreate.isPending || onUpdate.isPending
  const merged = { ...config, ...draft } as SmartStartupConfig

  const handleToggle = (on: boolean) => {
    if (on && !config) {
      onCreate.mutate(
        { targetType: 'stack', targetId: stack.id, triggerValue: '', startDelay: 60, monitorInterval: 30, enabled: true },
        {
          onSuccess: () => toast.success(`Smart startup enabled for ${stack.name}`),
          onError: (e: any) => toast.error(`Failed: ${e.message}`),
        }
      )
    } else if (config) {
      onUpdate.mutate(
        { id: config.id, targetType: 'stack', targetId: stack.id, triggerValue: config.triggerValue, startDelay: config.startDelay, monitorInterval: config.monitorInterval, enabled: on },
        {
          onSuccess: () => toast.success(`Smart startup ${on ? 'enabled' : 'disabled'} for ${stack.name}`),
          onError: (e: any) => toast.error(`Failed: ${e.message}`),
        }
      )
    }
    setDraft(null)
  }

  const handleSave = () => {
    if (!draft || !config) return
    onUpdate.mutate(
      { ...config, ...draft },
      {
        onSuccess: () => { toast.success('Config saved'); setDraft(null) },
        onError: (e: any) => toast.error(`Failed: ${e.message}`),
      }
    )
  }

  const isOnline = config?.deviceOnline ?? false
  const lastChecked = config?.lastCheckedAt ? new Date(config.lastCheckedAt) : null
  const lastSeen = config?.lastSeenAt ? new Date(config.lastSeenAt) : null

  return (
    <div className={`rounded-lg border overflow-hidden relative ${enabled ? 'border-primary/20' : 'border-border/40'}`}>
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${enabled ? 'bg-primary' : 'bg-transparent'}`} />

      {/* Row header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`font-mono font-semibold text-sm truncate ${!enabled ? 'text-muted-foreground' : ''}`}>{stack.name}</span>
          <span className="text-xs text-muted-foreground shrink-0">{stack.services} svc</span>
          <Badge className={`text-[9px] px-1.5 py-0 border shrink-0 ${enabled ? 'bg-primary/10 text-primary border-primary/30' : 'bg-muted/30 text-muted-foreground border-border/40'}`}>
            {enabled ? 'Active' : 'Inactive'}
          </Badge>
          {/* Device online status when enabled */}
          {enabled && config?.triggerValue && (
            <Badge className={`text-[9px] px-1.5 py-0 border shrink-0 ${isOnline ? 'bg-green-500/10 text-green-400 border-green-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
              {isOnline ? <Wifi className="w-2.5 h-2.5 mr-0.5 inline" /> : <WifiOff className="w-2.5 h-2.5 mr-0.5 inline" />}
              {isOnline ? 'Device online' : 'Device offline'}
            </Badge>
          )}
        </div>
        <Switch checked={enabled} onCheckedChange={handleToggle} disabled={isBusy} />
      </div>

      {/* Config form - shown when enabled */}
      {enabled && config && (
        <div className="px-4 pb-3 space-y-3 border-t border-border/30 pt-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Device IP / Hostname</Label>
              <Input
                className="h-7 text-xs font-mono"
                placeholder="e.g. 192.168.1.100 or synology.local"
                value={merged.triggerValue ?? ''}
                onChange={(e) => setDraft(d => ({ ...d, triggerValue: e.target.value }))}
              />
              <p className="text-[10px] text-muted-foreground">The NAS or device that must be online to trigger stack start</p>
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Timer className="w-3 h-3" /> Start Delay (seconds)
              </Label>
              <Input
                type="number"
                className="h-7 w-full text-xs font-mono"
                min={0}
                max={3600}
                value={merged.startDelay ?? 60}
                onChange={(e) => setDraft(d => ({ ...d, startDelay: parseInt(e.target.value) || 0 }))}
              />
              <p className="text-[10px] text-muted-foreground">Wait this long after device comes online before starting</p>
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" /> Check Interval (seconds)
              </Label>
              <Input
                type="number"
                className="h-7 w-full text-xs font-mono"
                min={5}
                max={3600}
                value={merged.monitorInterval ?? 30}
                onChange={(e) => setDraft(d => ({ ...d, monitorInterval: parseInt(e.target.value) || 30 }))}
              />
              <p className="text-[10px] text-muted-foreground">How often to ping the device</p>
            </div>
          </div>

          {/* Device status */}
          {config.triggerValue && (
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-mono bg-muted/20 rounded px-2 py-1.5">
              <span>Last check: {lastChecked ? formatDistanceToNow(lastChecked, { addSuffix: true }) : 'pending�'}</span>
              {lastSeen && <span>Last seen: {formatDistanceToNow(lastSeen, { addSuffix: true })}</span>}
            </div>
          )}

          {isDirty && (
            <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={isBusy}>
              {isBusy ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
              Save
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

export function SmartStartupDialog({ open, onOpenChange, stacks }: SmartStartupDialogProps) {
  const { data: configs = [] } = useSmartStartupConfigs()
  const { data: deviceStatuses = {} } = useSmartStartupDeviceStatus()
  const createConfig = useCreateSmartStartupConfig()
  const updateConfig = useUpdateSmartStartupConfig()
  const deleteConfig = useDeleteSmartStartupConfig()

  const getConfig = (stackId: string) =>
    configs.find((c) => c.targetId === stackId)

  // Collect unique monitored devices from active configs
  const monitoredDevices = [...new Set(
    configs.filter(c => c.enabled && c.triggerValue).map(c => c.triggerValue)
  )]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono">
            <Zap className="w-5 h-5 text-primary" />
            Smart Startup
          </DialogTitle>
          <DialogDescription>
            Start stacks automatically when a monitored device (e.g. NAS) comes online
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-3 flex gap-2 text-xs text-blue-400 shrink-0">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Smart Startup pings the configured device IP or hostname at the set interval.
            When the device comes online, the stack starts automatically after the configured delay.
            Ideal for NAS-dependent stacks � just enter your Synology's IP or <code className="font-mono">synology.local</code>.
          </span>
        </div>

        {/* Monitored devices summary */}
        {monitoredDevices.length > 0 && (
          <Card className="p-3 shrink-0">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Monitored Devices</p>
            <div className="flex flex-wrap gap-2">
              {monitoredDevices.map(addr => {
                const live = deviceStatuses[addr]
                const online = live?.isOnline ?? false
                const checked = live?.lastCheckedAt ? new Date(live.lastCheckedAt) : null
                return (
                  <div key={addr} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-mono ${online ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                    {online
                      ? <Wifi className="w-3.5 h-3.5 text-green-400" />
                      : <WifiOff className="w-3.5 h-3.5 text-red-400" />}
                    <span className={online ? 'text-green-400' : 'text-red-400'}>{addr}</span>
                    {checked && <span className="text-muted-foreground text-[10px]">{formatDistanceToNow(checked, { addSuffix: true })}</span>}
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        <ScrollArea className="flex-1 min-h-0 mt-2">
          <div className="space-y-2 pr-4 pb-2">
            {stacks.length === 0 && (
              <p className="text-xs text-muted-foreground">No stacks found.</p>
            )}
            {stacks.map((stack) => (
              <StackRow
                key={stack.id}
                stack={stack}
                config={getConfig(stack.id)}
                onCreate={createConfig}
                onUpdate={updateConfig}
                onDelete={deleteConfig}
              />
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

