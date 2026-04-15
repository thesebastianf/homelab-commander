import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Zap, Loader2, Info } from 'lucide-react'
import { toast } from 'sonner'
import type { Stack, Container, SmartStartupConfig } from '@/lib/types'
import {
  useSmartStartupConfigs,
  useCreateSmartStartupConfig,
  useUpdateSmartStartupConfig,
  useDeleteSmartStartupConfig,
} from '@/hooks/useServices'

interface SmartStartupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  stacks: Stack[]
  containers: Container[]
}

interface TriggerRowProps {
  itemId: string
  name: string
  subtitle?: string
  targetType: 'stack' | 'container'
  status?: string
  config?: SmartStartupConfig
  onCreate: ReturnType<typeof useCreateSmartStartupConfig>
  onUpdate: ReturnType<typeof useUpdateSmartStartupConfig>
  onDelete: ReturnType<typeof useDeleteSmartStartupConfig>
}

function TriggerRow({ itemId, name, subtitle, targetType, status, config, onCreate, onUpdate }: TriggerRowProps) {
  const [draft, setDraft] = useState<Partial<SmartStartupConfig> | null>(null)

  const enabled = config?.enabled ?? false
  const isDirty = draft !== null
  const isBusy = onCreate.isPending || onUpdate.isPending

  const handleToggle = (on: boolean) => {
    if (on && !config) {
      onCreate.mutate(
        { targetType, targetId: itemId, triggerType: 'nas', triggerValue: '', autoStart: true, startDelay: 30, enabled: true },
        {
          onSuccess: () => toast.success(`Smart startup enabled for ${name}`),
          onError: (e: any) => toast.error(`Failed: ${e.message}`),
        }
      )
    } else if (config) {
      onUpdate.mutate(
        { id: config.id, targetType, targetId: itemId, triggerType: config.triggerType, triggerValue: config.triggerValue, autoStart: config.autoStart, startDelay: config.startDelay, enabled: on },
        {
          onSuccess: () => toast.success(`Smart startup ${on ? 'enabled' : 'disabled'} for ${name}`),
          onError: (e: any) => toast.error(`Failed: ${e.message}`),
        }
      )
    }
    setDraft(null)
  }

  const handleSave = () => {
    if (!draft || !config) return
    onUpdate.mutate(
      { id: config.id, ...config, ...draft },
      {
        onSuccess: () => { toast.success('Config saved'); setDraft(null) },
        onError: (e: any) => toast.error(`Failed: ${e.message}`),
      }
    )
  }

  const merged = { ...config, ...draft } as SmartStartupConfig

  return (
    <div className={`rounded-lg border overflow-hidden relative ${enabled ? 'border-success/20' : 'border-border/40'}`}>
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${enabled ? 'bg-success' : 'bg-transparent'}`} />

      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`font-mono font-semibold text-sm ${!enabled ? 'text-muted-foreground' : ''}`}>{name}</span>
          {subtitle && <span className="text-xs text-muted-foreground font-mono truncate">{subtitle}</span>}
          <Badge
            className={`text-[9px] px-1.5 py-0 border shrink-0 ${enabled ? 'bg-success/10 text-success border-success/30' : 'bg-muted/30 text-muted-foreground border-border/40'}`}>
            {enabled ? 'Active' : 'Inactive'}
          </Badge>
        </div>
        <Switch checked={enabled} onCheckedChange={handleToggle} disabled={isBusy} />
      </div>

      {enabled && config && (
        <div className="px-4 pb-3 space-y-2 border-t border-border/30 pt-2">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Trigger Type</Label>
              <Select
                value={merged.triggerType ?? 'nas'}
                onValueChange={(v) => setDraft((d) => ({ ...d, triggerType: v as SmartStartupConfig['triggerType'] }))}>
                <SelectTrigger className="h-7 w-36 text-xs font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nas">NAS Device</SelectItem>
                  <SelectItem value="ping">Ping</SelectItem>
                  <SelectItem value="ip">IP Address</SelectItem>
                  <SelectItem value="device">Network Device</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Device / IP</Label>
              <Input
                className="h-7 w-44 text-xs font-mono"
                placeholder="e.g. nas.local or 192.168.1.x"
                value={merged.triggerValue ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, triggerValue: e.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Start Delay (s)</Label>
              <Input
                type="number"
                className="h-7 w-16 text-xs font-mono"
                min={0}
                value={merged.startDelay ?? 0}
                onChange={(e) => setDraft((d) => ({ ...d, startDelay: parseInt(e.target.value) || 0 }))}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Auto-start</Label>
              <div className="flex items-center h-7">
                <Switch
                  checked={merged.autoStart ?? true}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, autoStart: v }))}
                />
              </div>
            </div>

            {isDirty && (
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-transparent select-none">Save</Label>
                <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={isBusy}>
                  {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                </Button>
              </div>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground font-mono">
            Status: {merged.triggerType ?? 'nas'} trigger · {merged.triggerValue ? `${merged.triggerValue} · ` : ''}
            {status === 'running' ? `${targetType} running ✓` : `${targetType} stopped`}
          </p>
        </div>
      )}
    </div>
  )
}

export function SmartStartupDialog({ open, onOpenChange, stacks, containers }: SmartStartupDialogProps) {
  const { data: configs = [] } = useSmartStartupConfigs()
  const createConfig = useCreateSmartStartupConfig()
  const updateConfig = useUpdateSmartStartupConfig()
  const deleteConfig = useDeleteSmartStartupConfig()

  const getConfig = (targetType: 'stack' | 'container', id: string) =>
    configs.find((c) => c.targetType === targetType && c.targetId === id)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-mono">
            <Zap className="w-5 h-5 text-primary" />
            Smart Startup
          </DialogTitle>
          <DialogDescription>
            Auto-start stacks and containers when devices come online
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-3 flex gap-2 text-xs text-blue-400 shrink-0">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Smart Startup monitors network devices and automatically starts stacks and containers when trigger devices come online. Supports NAS, IP, Ping, and network device detection.</span>
        </div>

        <ScrollArea className="flex-1 min-h-0 mt-2">
          <div className="space-y-5 pr-4 pb-2">
            {/* Stack Triggers */}
            <div>
              <h3 className="font-mono font-semibold text-sm mb-3 text-foreground/80">Stack Triggers</h3>
              <div className="space-y-2">
                {stacks.length === 0 && (
                  <p className="text-xs text-muted-foreground">No stacks found.</p>
                )}
                {stacks.map((stack) => (
                  <TriggerRow
                    key={stack.id}
                    itemId={stack.id}
                    name={stack.name}
                    subtitle={stack.serviceCount != null ? `${stack.serviceCount} services` : undefined}
                    targetType="stack"
                    status={stack.status}
                    config={getConfig('stack', stack.id)}
                    onCreate={createConfig}
                    onUpdate={updateConfig}
                    onDelete={deleteConfig}
                  />
                ))}
              </div>
            </div>

            <div className="h-px bg-border/50" />

            {/* Container Triggers */}
            <div>
              <h3 className="font-mono font-semibold text-sm mb-3 text-foreground/80">Container Triggers</h3>
              <div className="space-y-2">
                {containers.length === 0 && (
                  <p className="text-xs text-muted-foreground">No containers found.</p>
                )}
                {containers.map((container) => (
                  <TriggerRow
                    key={container.id}
                    itemId={container.id}
                    name={container.name}
                    subtitle={container.image}
                    targetType="container"
                    status={container.status}
                    config={getConfig('container', container.id)}
                    onCreate={createConfig}
                    onUpdate={updateConfig}
                    onDelete={deleteConfig}
                  />
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
