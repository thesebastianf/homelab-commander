import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Plus, Trash2, Send, Mail, Globe, FlaskConical, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import * as api from '@/lib/api'
import type { NotificationService } from '@/lib/types'

interface NotificationServicesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  services: NotificationService[]
  onSave: (services: NotificationService[]) => Promise<void>
}

export function NotificationServicesDialog({ open, onOpenChange, services, onSave }: NotificationServicesDialogProps) {
  const [localServices, setLocalServices] = useState<NotificationService[]>(services)
  const [newServiceType, setNewServiceType] = useState<NotificationService['type']>('telegram')
  const [testingId, setTestingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setLocalServices(services)
    }
  }, [open, services])

  const isSavedService = (id: string) => !id.startsWith('service-')

  const handleTestService = async (service: NotificationService) => {
    setTestingId(service.id)
    try {
      if (isSavedService(service.id)) {
        await api.testNotificationService(service.id)
      } else {
        await api.testNotificationServiceConfig({
          name: service.name,
          type: service.type,
          enabled: service.enabled,
          config: service.config,
        })
      }
      toast.success('Test notification sent successfully!')
    } catch (e: any) {
      toast.error(`Test failed: ${e.message}`)
    } finally {
      setTestingId(null)
    }
  }

  const handleAddService = () => {
    const newService: NotificationService = {
      id: `service-${Date.now()}`,
      type: newServiceType,
      name: `New ${newServiceType.charAt(0).toUpperCase() + newServiceType.slice(1)} Service`,
      enabled: true,
      config: {}
    }
    setLocalServices([...localServices, newService])
  }

  const handleUpdateService = (id: string, updates: Partial<NotificationService>) => {
    setLocalServices(localServices.map(s => s.id === id ? { ...s, ...updates } : s))
  }

  const handleRemoveService = (id: string) => {
    setLocalServices(localServices.filter(s => s.id !== id))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(localServices)
      onOpenChange(false)
    } catch (e: any) {
      toast.error(`Failed to save services: ${e.message || 'Unknown error'}`)
    } finally {
      setSaving(false)
    }
  }

  const getConfigFields = (type: NotificationService['type']) => {
    switch (type) {
      case 'telegram':
        return [
          { key: 'botToken', label: 'Bot Token', type: 'password' },
          { key: 'chatId', label: 'Chat ID', type: 'text' }
        ]
      case 'discord':
        return [{ key: 'webhookUrl', label: 'Webhook URL', type: 'password' }]
      case 'slack':
        return [{ key: 'webhookUrl', label: 'Webhook URL', type: 'password' }]
      case 'email':
        return [
          { key: 'smtpHost', label: 'SMTP Host', type: 'text' },
          { key: 'smtpPort', label: 'SMTP Port', type: 'text' },
          { key: 'username', label: 'Username', type: 'text' },
          { key: 'password', label: 'Password', type: 'password' },
          { key: 'from', label: 'From Address', type: 'text' },
          { key: 'to', label: 'To Address', type: 'text' }
        ]
      case 'webhook':
        return [
          { key: 'url', label: 'Webhook URL', type: 'text' },
          { key: 'method', label: 'Method (GET/POST)', type: 'text' }
        ]
    }
  }

  const getServiceIcon = (type: NotificationService['type']) => {
    switch (type) {
      case 'telegram': return <Send className="w-4 h-4" />
      case 'discord': return <Globe className="w-4 h-4" />
      case 'slack': return <Globe className="w-4 h-4" />
      case 'email': return <Mail className="w-4 h-4" />
      case 'webhook': return <Globe className="w-4 h-4" />
    }
  }

  return (
    <TooltipProvider delayDuration={350}>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] sm:max-w-5xl lg:max-w-6xl h-[88vh] max-h-[88vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Notification Services</DialogTitle>
          <DialogDescription>
            Configure notification services to receive alerts about your homelab
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4 flex-1 min-h-0 overflow-y-auto pr-1">
          <div className="flex items-center gap-3">
            <Select value={newServiceType} onValueChange={(v) => setNewServiceType(v as NotificationService['type'])}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="telegram">Telegram</SelectItem>
                <SelectItem value="discord">Discord</SelectItem>
                <SelectItem value="slack">Slack</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="webhook">Webhook</SelectItem>
              </SelectContent>
            </Select>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={handleAddService} size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Service
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Add a new notification provider of the selected type</p>
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="space-y-3">
            {localServices.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  No notification services configured. Add one to get started.
                </CardContent>
              </Card>
            ) : (
              localServices.map((service) => (
                <Card key={service.id} className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {getServiceIcon(service.type)}
                      <div>
                        <Input
                          value={service.name}
                          onChange={(e) => handleUpdateService(service.id, { name: e.target.value })}
                          className="h-8 font-semibold border-none p-0 text-base focus-visible:ring-0"
                        />
                        <Badge variant="outline" className="mt-1 capitalize">{service.type}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={service.enabled}
                        onCheckedChange={(checked) => handleUpdateService(service.id, { enabled: checked })}
                      />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleTestService(service)}
                            disabled={testingId !== null}
                            className="gap-1.5"
                          >
                            {testingId === service.id ? (
                              <><Loader2 className="w-3.5 h-3.5 animate-spin" />Testing...</>
                            ) : (
                              <><FlaskConical className="w-3.5 h-3.5" />Test</>
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">{isSavedService(service.id) ? 'Send a live test notification to verify this saved service' : 'Test this draft configuration without saving first'}</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveService(service.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">Remove this notification service from settings</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {getConfigFields(service.type).map((field) => (
                      <div key={field.key} className="space-y-1">
                        <Label className="text-xs">{field.label}</Label>
                        <Input
                          type={field.type}
                          value={(service.config as Record<string, string>)[field.key] || ''}
                          onChange={(e) => handleUpdateService(service.id, {
                            config: { ...service.config, [field.key]: e.target.value }
                          })}
                          className="h-8 text-sm font-mono"
                        />
                      </div>
                    ))}
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
            ) : 'Save Services'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </TooltipProvider>
  )
}
