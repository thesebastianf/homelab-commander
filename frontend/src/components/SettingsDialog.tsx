import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Settings, FolderOpen, Bell, Link, Snowflake, CloudDownload } from 'lucide-react'
import type { AppSettings } from '@/lib/types'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: AppSettings
  onSave: (settings: AppSettings) => void
}

export function SettingsDialog({ open, onOpenChange, settings, onSave }: SettingsDialogProps) {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings)

  useEffect(() => {
    setLocalSettings(settings)
  }, [settings])

  const handleSave = () => {
    onSave(localSettings)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-6 h-6 text-primary" />
            Settings
          </DialogTitle>
          <DialogDescription>
            Configure your Homelab Commander preferences
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="general" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="general" className="gap-2">
              <FolderOpen className="w-4 h-4" />
              General
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2">
              <Bell className="w-4 h-4" />
              Notifications
            </TabsTrigger>
            <TabsTrigger value="integrations" className="gap-2">
              <Link className="w-4 h-4" />
              Integrations
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6 mt-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="stacks-path">Stacks Base Path</Label>
                <Input
                  id="stacks-path"
                  value={localSettings.stacksBasePath}
                  onChange={(e) => setLocalSettings({ ...localSettings, stacksBasePath: e.target.value })}
                  placeholder="/path/to/stacks"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Base directory where stack folders will be created.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="volumes-path">Named Volumes Base Path</Label>
                <Input
                  id="volumes-path"
                  value={localSettings.volumesBasePath}
                  onChange={(e) => setLocalSettings({ ...localSettings, volumesBasePath: e.target.value })}
                  placeholder="/path/to/volumes"
                  className="font-mono"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="backups-path">Backups Base Path</Label>
                <Input
                  id="backups-path"
                  value={localSettings.backupsBasePath}
                  onChange={(e) => setLocalSettings({ ...localSettings, backupsBasePath: e.target.value })}
                  placeholder="/mnt/backups"
                  className="font-mono"
                />
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="font-mono font-semibold text-sm flex items-center gap-2">
                  <CloudDownload className="w-[18px] h-[18px]" />
                  Update Management
                </h3>
                
                <Card className={`p-4 border-2 ${localSettings.globalUpdateFreeze ? 'border-destructive bg-destructive/10' : 'border-border'}`}>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <Snowflake className={`w-5 h-5 ${localSettings.globalUpdateFreeze ? 'text-destructive' : 'text-muted-foreground'}`} />
                        <Label htmlFor="global-freeze" className="text-base">Global Update Freeze</Label>
                        {localSettings.globalUpdateFreeze && (
                          <Badge variant="destructive" className="gap-1">
                            <Snowflake className="w-3 h-3" />
                            FROZEN
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Disable ALL container updates for maximum stability.
                      </p>
                    </div>
                    <Switch
                      id="global-freeze"
                      checked={localSettings.globalUpdateFreeze}
                      onCheckedChange={(checked) => setLocalSettings({ ...localSettings, globalUpdateFreeze: checked })}
                    />
                  </div>
                </Card>

                <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-card">
                  <div className="space-y-0.5">
                    <Label htmlFor="auto-update" className="text-base">Automatic Container Updates</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically update containers when new images are available
                    </p>
                  </div>
                  <Switch
                    id="auto-update"
                    checked={localSettings.autoUpdate}
                    disabled={localSettings.globalUpdateFreeze}
                    onCheckedChange={(checked) => setLocalSettings({ ...localSettings, autoUpdate: checked })}
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-6 mt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-card">
                <div className="space-y-0.5">
                  <Label htmlFor="notifications-enabled" className="text-base">Enable Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive notifications about system events
                  </p>
                </div>
                <Switch
                  id="notifications-enabled"
                  checked={localSettings.notifications.enabled}
                  onCheckedChange={(checked) => setLocalSettings({
                    ...localSettings,
                    notifications: { ...localSettings.notifications, enabled: checked }
                  })}
                />
              </div>

              <div className="space-y-3">
                <Label className="text-base">Event Notifications</Label>
                <div className="space-y-2">
                  {Object.entries({
                    updateAvailable: 'Update Available',
                    containerAutoUpdated: 'Container Auto-Updated',
                    containerFailed: 'Container Failed',
                    containerStarted: 'Container Started',
                    containerStopped: 'Container Stopped',
                    stackDeployed: 'Stack Deployed',
                    stackFailed: 'Stack Failed',
                    highMemory: 'High Memory Usage',
                    highCpu: 'High CPU Usage'
                  }).map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between py-2">
                      <Label htmlFor={key} className="text-sm font-normal">{label}</Label>
                      <Switch
                        id={key}
                        checked={localSettings.notifications.events[key as keyof typeof localSettings.notifications.events]}
                        onCheckedChange={(checked) => setLocalSettings({
                          ...localSettings,
                          notifications: {
                            ...localSettings.notifications,
                            events: {
                              ...localSettings.notifications.events,
                              [key]: checked
                            }
                          }
                        })}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="memory-threshold">Memory Threshold (%)</Label>
                  <Input
                    id="memory-threshold"
                    type="number"
                    value={localSettings.notifications.thresholds.memoryPercent}
                    onChange={(e) => setLocalSettings({
                      ...localSettings,
                      notifications: {
                        ...localSettings.notifications,
                        thresholds: {
                          ...localSettings.notifications.thresholds,
                          memoryPercent: Number(e.target.value)
                        }
                      }
                    })}
                    min="1"
                    max="100"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cpu-threshold">CPU Threshold (%)</Label>
                  <Input
                    id="cpu-threshold"
                    type="number"
                    value={localSettings.notifications.thresholds.cpuPercent}
                    onChange={(e) => setLocalSettings({
                      ...localSettings,
                      notifications: {
                        ...localSettings.notifications,
                        thresholds: {
                          ...localSettings.notifications.thresholds,
                          cpuPercent: Number(e.target.value)
                        }
                      }
                    })}
                    min="1"
                    max="100"
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="integrations" className="space-y-6 mt-6">
            <Card className="p-4">
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-mono font-semibold text-base">Home Assistant Integration</h3>
                      <Badge variant={localSettings.homeAssistant?.enabled ? 'default' : 'secondary'}>
                        {localSettings.homeAssistant?.enabled ? 'Connected' : 'Disabled'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Expose update freeze status and other controls to Home Assistant
                    </p>
                  </div>
                  <Switch
                    checked={localSettings.homeAssistant?.enabled || false}
                    onCheckedChange={(checked) => setLocalSettings({
                      ...localSettings,
                      homeAssistant: { ...(localSettings.homeAssistant || { baseUrl: '', accessToken: '', entityPrefix: 'hlc' }), enabled: checked }
                    })}
                  />
                </div>

                {localSettings.homeAssistant?.enabled && (
                  <>
                    <Separator />
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="ha-url">Home Assistant Base URL</Label>
                        <Input
                          id="ha-url"
                          value={localSettings.homeAssistant?.baseUrl || ''}
                          onChange={(e) => setLocalSettings({
                            ...localSettings,
                            homeAssistant: { ...(localSettings.homeAssistant || { enabled: true, accessToken: '', entityPrefix: 'hlc' }), baseUrl: e.target.value }
                          })}
                          placeholder="http://homeassistant.local:8123"
                          className="font-mono text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ha-token">Long-Lived Access Token</Label>
                        <Input
                          id="ha-token"
                          type="password"
                          value={localSettings.homeAssistant?.accessToken || ''}
                          onChange={(e) => setLocalSettings({
                            ...localSettings,
                            homeAssistant: { ...(localSettings.homeAssistant || { enabled: true, baseUrl: '', entityPrefix: 'hlc' }), accessToken: e.target.value }
                          })}
                          placeholder="eyJ0..."
                          className="font-mono text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ha-prefix">Entity Prefix</Label>
                        <Input
                          id="ha-prefix"
                          value={localSettings.homeAssistant?.entityPrefix || 'hlc'}
                          onChange={(e) => setLocalSettings({
                            ...localSettings,
                            homeAssistant: { ...(localSettings.homeAssistant || { enabled: true, baseUrl: '', accessToken: '' }), entityPrefix: e.target.value }
                          })}
                          className="font-mono text-sm"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </Card>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save Settings</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
