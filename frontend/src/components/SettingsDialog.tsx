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
import { Settings, FolderOpen, Bell, Link, Snowflake, CloudDownload, Github, AlertTriangle, FlaskConical, Loader2, CheckCircle, XCircle, Clipboard, Plus, Trash2 } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import * as api from '@/lib/api'
import type { AppSettings } from '@/lib/types'
import { normalizeCronExpression, toHumanCronLabel } from '@/lib/cron'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: AppSettings
  onSave: (settings: AppSettings) => Promise<void>
}

export function SettingsDialog({ open, onOpenChange, settings, onSave }: SettingsDialogProps) {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings)
  const [aiTesting, setAiTesting] = useState(false)
  const [aiTestResult, setAiTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [excludeDraft, setExcludeDraft] = useState('')

  const autoUpdatePresets = [
    { value: '0 7 * * 6', label: 'Saturday 07:00' },
    { value: '0 3 * * 0', label: 'Sunday 03:00' },
    { value: '0 3 * * 1', label: 'Monday 03:00' },
    { value: '0 2 * * *', label: 'Daily 02:00' },
    { value: '0 4 * * 1,2,3,4,5', label: 'Weekdays 04:00' },
    { value: '0 3 1 * *', label: '1st of each month 03:00' },
    { value: '0 */6 * * *', label: 'Every 6 hours' },
  ]

  useEffect(() => {
    if (open) {
      const normalizedCron = normalizeCronExpression(settings.autoUpdateSchedule?.cron || '0 7 * * 6')
      setLocalSettings({
        ...settings,
        autoUpdateSchedule: {
          ...(settings.autoUpdateSchedule || { enabled: false }),
          cron: normalizedCron,
          label: toHumanCronLabel(normalizedCron),
        },
      })
      setAiTestResult(null)
      setExcludeDraft('')
      // Restore actual saved theme when dialog reopens (in case previous session was cancelled)
      document.documentElement.setAttribute('data-theme', settings.theme || 'dark')
    }
  }, [open]) // intentionally not [settings] — avoids reset from background refetches

  const makeHelperId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
    return `helper-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  const handleCancel = () => {
    // Revert preview to the saved theme
    document.documentElement.setAttribute('data-theme', settings.theme || 'dark')
    onOpenChange(false)
  }

  const handleSave = async () => {
    try {
      await onSave(localSettings)
      onOpenChange(false)
    } catch {
      // Error toast is handled by the caller; keep dialog open so the user can retry.
    }
  }

  const handleTestAi = async () => {
    setAiTesting(true)
    setAiTestResult(null)
    try {
      const result = await api.testAiConnection()
      setAiTestResult({ success: result.success, message: result.success ? `Connected - model replied: "${result.message}"` : result.message })
      if (result.success) toast.success('AI connection test passed!')
      else toast.error(`AI test failed: ${result.message}`)
    } catch (e: any) {
      setAiTestResult({ success: false, message: e.message })
      toast.error(`AI test failed: ${e.message}`)
    } finally {
      setAiTesting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleCancel(); else onOpenChange(true) }}>
      <DialogContent className="w-[94vw] max-w-5xl max-h-[90vh] overflow-y-auto">
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
          <TabsList className="grid w-full grid-cols-7 h-9">
            <TabsTrigger value="general" className="text-xs px-1">
              General
            </TabsTrigger>
            <TabsTrigger value="notifications" className="text-xs px-1">
              Alerts
            </TabsTrigger>
            <TabsTrigger value="integrations" className="text-xs px-1">
              Integrations
            </TabsTrigger>
            <TabsTrigger value="ai" className="text-xs px-1">
              AI
            </TabsTrigger>
            <TabsTrigger value="helpers" className="text-xs px-1">
              Helpers
            </TabsTrigger>
            <TabsTrigger value="monitoring" className="text-xs px-1">
              Monitoring
            </TabsTrigger>
            <TabsTrigger value="files" className="text-xs px-1">
              Files
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6 mt-6">
            <div className="space-y-4">
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <Label className="text-base">Theme</Label>
                    <p className="text-sm text-muted-foreground mt-0.5">Choose the visual theme for the dashboard.</p>
                  </div>
                  <Select
                    value={localSettings.theme || 'dark'}
                    onValueChange={(value) => {
                      const theme = value as AppSettings['theme']
                      setLocalSettings({ ...localSettings, theme })
                      // Apply immediately for live preview — save persists it to server
                      document.documentElement.setAttribute('data-theme', value)
                    }}
                  >
                    <SelectTrigger className="w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="graphite">Graphite</SelectItem>
                      <SelectItem value="ocean">Ocean</SelectItem>
                      <SelectItem value="forest">Forest</SelectItem>
                      <SelectItem value="sunset">Sunset</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </Card>

              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <Label className="text-base">Docker Runtime</Label>
                    <p className="text-sm text-muted-foreground mt-0.5">Internal CLI via host socket (Dockge-style — no host binary mounts needed).</p>
                  </div>
                  <Badge variant={localSettings.dockerCompose?.socketReachable === false ? 'destructive' : 'default'} className="font-mono">
                    {localSettings.dockerCompose?.socketReachable === false ? 'Socket Unreachable' : 'Native Host'}
                  </Badge>
                </div>
                {localSettings.dockerCompose?.socketReachable === false && (
                  <Alert variant="destructive" className="py-2">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>Docker socket missing! /var/run/docker.sock is not reachable.</AlertDescription>
                  </Alert>
                )}
                <div className="grid gap-2 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Docker CLI Version</span>
                    <span className="font-mono text-xs">{localSettings.dockerCompose?.cliVersion || 'loading...'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Stacks Path</span>
                    <span className="font-mono text-xs">{localSettings.dockerCompose?.stacksPath || '/data/stacks'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Registry Config (GHCR)</span>
                    <Badge variant={localSettings.dockerCompose?.registryConfigPresent ? 'default' : 'outline'} className="text-xs">
                      {localSettings.dockerCompose?.registryConfigPresent ? '✓ Detected' : '✗ Not mounted'}
                    </Badge>
                  </div>
                </div>
              </Card>

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
                        Disable ALL container updates for maximum stability. Overrules everything.
                      </p>
                    </div>
                    <Switch
                      id="global-freeze"
                      checked={localSettings.globalUpdateFreeze}
                      onCheckedChange={(checked) => setLocalSettings({ ...localSettings, globalUpdateFreeze: checked })}
                    />
                  </div>
                </Card>

                {/* Auto-update schedule */}
                <Card className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base">Scheduled Auto-Update Window</Label>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Run automatic updates for all stacks with auto-update enabled on a defined schedule.
                        Respects Global Update Freeze.
                      </p>
                    </div>
                    <Switch
                      checked={localSettings.autoUpdateSchedule?.enabled || false}
                      disabled={localSettings.globalUpdateFreeze}
                      onCheckedChange={checked => setLocalSettings(prev => ({
                        ...prev,
                        autoUpdateSchedule: { ...(prev.autoUpdateSchedule || { cron: '0 7 * * 6', label: 'Saturdays at 07:00' }), enabled: checked },
                      }))}
                    />
                  </div>
                  {localSettings.autoUpdateSchedule?.enabled && !localSettings.globalUpdateFreeze && (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-sm">Preset Schedule</Label>
                        {(() => {
                          const currentCron = normalizeCronExpression(localSettings.autoUpdateSchedule?.cron || '0 7 * * 6')
                          const presetValues = new Set(autoUpdatePresets.map((p) => p.value))
                          const selectedPreset = presetValues.has(currentCron) ? currentCron : '__custom__'
                          return (
                        <Select
                          value={selectedPreset}
                          onValueChange={v => {
                            if (v === '__custom__') return
                            const normalized = normalizeCronExpression(v)
                            setLocalSettings(prev => ({
                              ...prev,
                              autoUpdateSchedule: { ...(prev.autoUpdateSchedule || { enabled: true }), cron: normalized, label: toHumanCronLabel(normalized) },
                            }))
                          }}
                        >
                          <SelectTrigger className="w-64">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {autoUpdatePresets.map((preset) => (
                              <SelectItem key={preset.value} value={preset.value}>{preset.label}</SelectItem>
                            ))}
                            <SelectItem value="__custom__">Custom</SelectItem>
                          </SelectContent>
                        </Select>
                          )
                        })()}
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm">Custom Cron Expression</Label>
                        <Input
                          value={localSettings.autoUpdateSchedule?.cron || '0 7 * * 6'}
                          onChange={e => setLocalSettings(prev => ({
                            ...prev,
                            autoUpdateSchedule: {
                              ...(prev.autoUpdateSchedule || { enabled: true, label: '' }),
                              cron: e.target.value,
                              label: toHumanCronLabel(normalizeCronExpression(e.target.value)),
                            },
                          }))}
                          className="font-mono text-sm"
                          placeholder="0 7 * * 6"
                        />
                        <p className="text-xs text-muted-foreground">
                          Standard cron: minute hour day-of-month month day-of-week
                        </p>
                        <p className="text-xs text-primary font-mono">
                          {toHumanCronLabel(normalizeCronExpression(localSettings.autoUpdateSchedule?.cron || '0 7 * * 6'))}
                        </p>
                      </div>
                    </div>
                  )}
                </Card>

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
                    backupCompleted: 'Backup Completed',
                    backupFailed: 'Backup Failed',
                    smartStartupDeviceOnline: 'Smart Startup: Device Online',
                    smartStartupStackStarted: 'Smart Startup: Stack Started',
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

            {/* Git Integration */}
            <Card className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Github className="w-4 h-4" />
                  <h3 className="font-mono font-semibold text-base">Git Integration</h3>
                  <Badge variant={localSettings.gitIntegration?.enabled ? 'default' : 'secondary'}>
                    {localSettings.gitIntegration?.enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
                <Switch
                  checked={localSettings.gitIntegration?.enabled || false}
                  onCheckedChange={checked =>
                    setLocalSettings(prev => ({
                      ...prev,
                      gitIntegration: { ...(prev.gitIntegration || { repoUrl: '', accessToken: '', syncOn: 'manual' }), enabled: checked },
                    }))
                  }
                />
              </div>
              <p className="text-sm text-muted-foreground">Sync your stack compose files and .env files to a GitHub repository for backup and version history.</p>
              {localSettings.gitIntegration?.enabled && (
                <div className="space-y-4">
                  <Alert variant="destructive" className="py-2">
                    <AlertTriangle className="w-4 h-4" />
                    <AlertDescription className="text-xs">
                      <strong>Security warning:</strong> All files including <code>.env</code> files containing passwords and secrets will be synced to the repository in plaintext. Use a private repository and never commit secrets to a public repo.
                    </AlertDescription>
                  </Alert>
                  <div className="space-y-1.5">
                    <Label htmlFor="git-repo-url">GitHub Repository URL</Label>
                    <Input
                      id="git-repo-url"
                      value={localSettings.gitIntegration?.repoUrl || ''}
                      onChange={e => setLocalSettings(prev => ({ ...prev, gitIntegration: { ...(prev.gitIntegration || { enabled: true, accessToken: '', syncOn: 'manual' }), repoUrl: e.target.value } }))}
                      placeholder="https://github.com/yourname/homelab-stacks"
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="git-access-token">Personal Access Token</Label>
                    <Input
                      id="git-access-token"
                      type="password"
                      value={localSettings.gitIntegration?.accessToken || ''}
                      onChange={e => setLocalSettings(prev => ({ ...prev, gitIntegration: { ...(prev.gitIntegration || { enabled: true, repoUrl: '', syncOn: 'manual' }), accessToken: e.target.value } }))}
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">GitHub PAT with <code>repo</code> scope. Stored in the database.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Auto-sync Trigger</Label>
                    <Select
                      value={localSettings.gitIntegration?.syncOn || 'manual'}
                      onValueChange={v => setLocalSettings(prev => ({ ...prev, gitIntegration: { ...(prev.gitIntegration || { enabled: true, repoUrl: '', accessToken: '' }), syncOn: v as 'save' | 'deploy' | 'manual' } }))}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="save">On Save</SelectItem>
                        <SelectItem value="deploy">On Deploy</SelectItem>
                        <SelectItem value="manual">Manual only</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">When to automatically commit and push changes.</p>
                  </div>
                </div>
              )}
            </Card>

            <Card className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Link className="w-4 h-4" />
                  <h3 className="font-mono font-semibold text-base">gethomepage.dev Service Widget</h3>
                  <Badge variant={localSettings.homepageWidget?.enabled ? 'default' : 'secondary'}>
                    {localSettings.homepageWidget?.enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
                <Switch
                  checked={localSettings.homepageWidget?.enabled || false}
                  onCheckedChange={checked => setLocalSettings(prev => ({
                    ...prev,
                    homepageWidget: {
                      enabled: checked,
                      baseUrl: prev.homepageWidget?.baseUrl || '',
                      apiKey: prev.homepageWidget?.apiKey || '',
                      serviceName: prev.homepageWidget?.serviceName || 'Homelab Commander',
                      show: {
                        containers: prev.homepageWidget?.show?.containers ?? true,
                        stacks: prev.homepageWidget?.show?.stacks ?? true,
                        images: prev.homepageWidget?.show?.images ?? true,
                        volumes: prev.homepageWidget?.show?.volumes ?? true,
                        networks: prev.homepageWidget?.show?.networks ?? true,
                        cpu: prev.homepageWidget?.show?.cpu ?? true,
                        memory: prev.homepageWidget?.show?.memory ?? true,
                        disk: prev.homepageWidget?.show?.disk ?? true,
                        updates: prev.homepageWidget?.show?.updates ?? true,
                      },
                    },
                  }))}
                />
              </div>
              <p className="text-sm text-muted-foreground">Configure a service widget endpoint for gethomepage.dev so Homelab Commander can be shown as a custom service card.</p>
              {localSettings.homepageWidget?.enabled && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Homepage Base URL</Label>
                    <Input
                      value={localSettings.homepageWidget?.baseUrl || ''}
                      onChange={e => setLocalSettings(prev => ({
                        ...prev,
                        homepageWidget: {
                          ...(prev.homepageWidget || { enabled: true, apiKey: '', serviceName: 'Homelab Commander', show: { containers: true, stacks: true, images: true, volumes: true, networks: true, cpu: true, memory: true, disk: true, updates: true } }),
                          baseUrl: e.target.value,
                        },
                      }))}
                      placeholder="http://homepage:3000"
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>API Key</Label>
                    <Input
                      type="password"
                      value={localSettings.homepageWidget?.apiKey || ''}
                      onChange={e => setLocalSettings(prev => ({
                        ...prev,
                        homepageWidget: {
                          ...(prev.homepageWidget || { enabled: true, baseUrl: '', serviceName: 'Homelab Commander', show: { containers: true, stacks: true, images: true, volumes: true, networks: true, cpu: true, memory: true, disk: true, updates: true } }),
                          apiKey: e.target.value,
                        },
                      }))}
                      placeholder="homepage-api-key"
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Service Name</Label>
                    <Input
                      value={localSettings.homepageWidget?.serviceName || 'Homelab Commander'}
                      onChange={e => setLocalSettings(prev => ({
                        ...prev,
                        homepageWidget: {
                          ...(prev.homepageWidget || { enabled: true, baseUrl: '', apiKey: '', show: { containers: true, stacks: true, images: true, volumes: true, networks: true, cpu: true, memory: true, disk: true, updates: true } }),
                          serviceName: e.target.value,
                        },
                      }))}
                      className="font-mono text-sm"
                    />
                  </div>
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="ai" className="space-y-6 mt-6">
            <Card className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">AI Assistant</Label>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Use an LLM to generate or review compose files inside the stack editor.
                  </p>
                </div>
                <Switch
                  checked={localSettings.ai?.enabled || false}
                  onCheckedChange={(checked) => setLocalSettings(prev => ({
                    ...prev,
                    ai: {
                      ...(prev.ai || {
                        provider: 'ollama',
                        baseUrl: 'http://host.docker.internal:11434',
                        apiKey: '',
                        model: 'llama3.1',
                        treatAsLocal: true,
                        allowEnvToLocal: false,
                      }),
                      enabled: checked,
                    },
                  }))}
                />
              </div>

              <Alert className="py-2">
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription className="text-xs">
                  Raw <code>.env</code> content is never sent to remote AI providers. For non-local providers the backend sends only redacted compose content and env key names.
                </AlertDescription>
              </Alert>

              {localSettings.ai?.enabled && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Provider</Label>
                      <Select
                        value={localSettings.ai?.provider || 'ollama'}
                        onValueChange={(value) => setLocalSettings(prev => ({
                          ...prev,
                          ai: {
                            ...(prev.ai || {
                              enabled: true,
                              baseUrl: '',
                              apiKey: '',
                              model: '',
                              treatAsLocal: false,
                              allowEnvToLocal: false,
                            }),
                            provider: value as NonNullable<AppSettings['ai']>['provider'],
                            baseUrl:
                              value === 'ollama'
                                ? 'http://host.docker.internal:11434'
                                : value === 'openai'
                                ? 'https://api.openai.com/v1'
                                : value === 'google'
                                ? 'https://generativelanguage.googleapis.com/v1beta'
                                : value === 'anthropic'
                                ? 'https://api.anthropic.com/v1'
                                : prev.ai?.baseUrl || '',
                            treatAsLocal: value === 'ollama' ? true : prev.ai?.treatAsLocal ?? false,
                          },
                        }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ollama">Local Ollama</SelectItem>
                          <SelectItem value="openai">OpenAI</SelectItem>
                          <SelectItem value="google">Google</SelectItem>
                          <SelectItem value="anthropic">Anthropic</SelectItem>
                          <SelectItem value="custom">Custom (OpenAI-compatible)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="ai-model">Model</Label>
                      <Input
                        id="ai-model"
                        value={localSettings.ai?.model || ''}
                        onChange={(e) => setLocalSettings(prev => ({
                          ...prev,
                          ai: { ...(prev.ai || { enabled: true, provider: 'ollama', baseUrl: '', apiKey: '', treatAsLocal: true, allowEnvToLocal: false }), model: e.target.value },
                        }))}
                        placeholder="llama3.1 / gpt-4.1 / claude-sonnet-4-0"
                        className="font-mono text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="ai-base-url">Base URL</Label>
                    <Input
                      id="ai-base-url"
                      value={localSettings.ai?.baseUrl || ''}
                      onChange={(e) => setLocalSettings(prev => ({
                        ...prev,
                        ai: { ...(prev.ai || { enabled: true, provider: 'custom', apiKey: '', model: '', treatAsLocal: false, allowEnvToLocal: false }), baseUrl: e.target.value },
                      }))}
                      placeholder="http://host.docker.internal:11434"
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">For `custom`, this should be an OpenAI-compatible API base. For Ollama, use the reachable local endpoint from the backend container.</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="ai-api-key">API Key</Label>
                    <Input
                      id="ai-api-key"
                      type="password"
                      value={localSettings.ai?.apiKey || ''}
                      onChange={(e) => setLocalSettings(prev => ({
                        ...prev,
                        ai: { ...(prev.ai || { enabled: true, provider: 'openai', baseUrl: '', model: '', treatAsLocal: false, allowEnvToLocal: false }), apiKey: e.target.value },
                      }))}
                      placeholder="Optional for Ollama, required for hosted providers"
                      className="font-mono text-sm"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <TooltipProvider delayDuration={350}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleTestAi}
                          disabled={aiTesting}
                          className="gap-2"
                        >
                          {aiTesting ? (
                            <><Loader2 className="w-4 h-4 animate-spin" />Testing Connection...</>
                          ) : (
                            <><FlaskConical className="w-4 h-4" />Test Connection</>
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">Sends a minimal prompt and verifies endpoint, model, and credentials</p>
                      </TooltipContent>
                    </Tooltip>
                    </TooltipProvider>
                    <p className="text-xs text-muted-foreground">Sends a minimal test prompt to verify provider connectivity and credentials.</p>
                  </div>

                  {aiTestResult && (
                    <Alert className={aiTestResult.success ? 'border-success/40' : 'border-destructive/40'}>
                      {aiTestResult.success ? <CheckCircle className="w-4 h-4 text-success" /> : <XCircle className="w-4 h-4 text-destructive" />}
                      <AlertDescription className="text-xs font-mono break-all">
                        {aiTestResult.message}
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="rounded-lg border border-border/60 p-3 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <Label className="text-sm">Treat endpoint as local/private</Label>
                        <p className="text-xs text-muted-foreground">Hosted providers should stay off. Use this only for a trusted endpoint inside your own network.</p>
                      </div>
                      <Switch
                        checked={localSettings.ai?.treatAsLocal || false}
                        disabled={localSettings.ai?.provider === 'ollama'}
                        onCheckedChange={(checked) => setLocalSettings(prev => ({
                          ...prev,
                          ai: { ...(prev.ai || { enabled: true, provider: 'custom', baseUrl: '', apiKey: '', model: '', allowEnvToLocal: false }), treatAsLocal: checked },
                        }))}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <Label className="text-sm">Allow raw .env content to local AI</Label>
                        <p className="text-xs text-muted-foreground">Disabled keeps AI requests to compose plus env key names only.</p>
                      </div>
                      <Switch
                        checked={localSettings.ai?.allowEnvToLocal || false}
                        disabled={!(localSettings.ai?.treatAsLocal || localSettings.ai?.provider === 'ollama')}
                        onCheckedChange={(checked) => setLocalSettings(prev => ({
                          ...prev,
                          ai: { ...(prev.ai || { enabled: true, provider: 'ollama', baseUrl: '', apiKey: '', model: '', treatAsLocal: true }), allowEnvToLocal: checked },
                        }))}
                      />
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="helpers" className="space-y-4 mt-6">
            <div className="space-y-2">
              <h3 className="font-mono font-semibold text-sm flex items-center gap-2">
                <Clipboard className="w-[18px] h-[18px]" />
                Copy-Paste Helpers
              </h3>
              <p className="text-xs text-muted-foreground">
                Global snippets accessible from the Stack Editor's Helpers panel — path prefixes, service names, volume mounts, or any text you paste frequently.
              </p>
            </div>

            <div className="space-y-2">
              {(localSettings.copyPasteHelpers || []).map((helper, i) => (
                <div key={helper.id} className="flex gap-2 items-center">
                  <Input
                    className="w-36 font-mono text-xs"
                    placeholder="Label"
                    value={helper.label}
                    onChange={(e) => {
                      const helpers = [...(localSettings.copyPasteHelpers || [])]
                      helpers[i] = { ...helpers[i], label: e.target.value }
                      setLocalSettings(prev => ({ ...prev, copyPasteHelpers: helpers }))
                    }}
                  />
                  <Input
                    className="flex-1 font-mono text-xs"
                    placeholder="Value (path, snippet, etc.)"
                    value={helper.value}
                    onChange={(e) => {
                      const helpers = [...(localSettings.copyPasteHelpers || [])]
                      helpers[i] = { ...helpers[i], value: e.target.value }
                      setLocalSettings(prev => ({ ...prev, copyPasteHelpers: helpers }))
                    }}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      const helpers = (localSettings.copyPasteHelpers || []).filter((_, idx) => idx !== i)
                      setLocalSettings(prev => ({ ...prev, copyPasteHelpers: helpers }))
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                const nextIndex = (localSettings.copyPasteHelpers || []).length + 1
                const helpers = [...(localSettings.copyPasteHelpers || []), { id: makeHelperId(), label: `helper-${nextIndex}`, value: '' }]
                setLocalSettings(prev => ({ ...prev, copyPasteHelpers: helpers }))
              }}
            >
              <Plus className="w-4 h-4" /> Add Helper
            </Button>
          </TabsContent>

          <TabsContent value="monitoring" className="space-y-4 mt-6">
            <div className="space-y-2">
              <h3 className="font-mono font-semibold text-sm flex items-center gap-2">
                <AlertTriangle className="w-[18px] h-[18px]" />
                Warning Thresholds
              </h3>
              <p className="text-xs text-muted-foreground">Dashboard metric tiles will show an inline warning and action button when these limits are exceeded.</p>
            </div>

            <Card className="p-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">CPU Usage Warning</Label>
                  <p className="text-[11px] text-muted-foreground">Show warning when CPU exceeds this %</p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number" min={1} max={100}
                      value={localSettings.warningThresholds?.cpuWarn ?? 85}
                      onChange={e => setLocalSettings(prev => ({
                        ...prev,
                        warningThresholds: { ...(prev.warningThresholds ?? { networkWarn: 25, zombieWarn: 5, diskWarn: 90, cpuWarn: 85, memoryWarn: 85 }), cpuWarn: parseInt(e.target.value) || 85 },
                      }))}
                      className="w-24 font-mono text-sm"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Memory Usage Warning</Label>
                  <p className="text-[11px] text-muted-foreground">Show warning when memory exceeds this %</p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number" min={1} max={100}
                      value={localSettings.warningThresholds?.memoryWarn ?? 85}
                      onChange={e => setLocalSettings(prev => ({
                        ...prev,
                        warningThresholds: { ...(prev.warningThresholds ?? { networkWarn: 25, zombieWarn: 5, diskWarn: 90, cpuWarn: 85, memoryWarn: 85 }), memoryWarn: parseInt(e.target.value) || 85 },
                      }))}
                      className="w-24 font-mono text-sm"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Disk Usage Warning</Label>
                  <p className="text-[11px] text-muted-foreground">Show warning when disk usage exceeds this %</p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number" min={1} max={100}
                      value={localSettings.warningThresholds?.diskWarn ?? 90}
                      onChange={e => setLocalSettings(prev => ({
                        ...prev,
                        warningThresholds: { ...(prev.warningThresholds ?? { networkWarn: 25, zombieWarn: 5, diskWarn: 90, cpuWarn: 85, memoryWarn: 85 }), diskWarn: parseInt(e.target.value) || 90 },
                      }))}
                      className="w-24 font-mono text-sm"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Network Pool Warning</Label>
                  <p className="text-[11px] text-muted-foreground">Show warning when network count exceeds</p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number" min={1} max={500}
                      value={localSettings.warningThresholds?.networkWarn ?? 25}
                      onChange={e => setLocalSettings(prev => ({
                        ...prev,
                        warningThresholds: { ...(prev.warningThresholds ?? { networkWarn: 25, zombieWarn: 5, diskWarn: 90, cpuWarn: 85, memoryWarn: 85 }), networkWarn: parseInt(e.target.value) || 25 },
                      }))}
                      className="w-24 font-mono text-sm"
                    />
                    <span className="text-xs text-muted-foreground">networks</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Stopped Container Warning</Label>
                  <p className="text-[11px] text-muted-foreground">Show warning when stopped containers exceed</p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number" min={1} max={500}
                      value={localSettings.warningThresholds?.zombieWarn ?? 5}
                      onChange={e => setLocalSettings(prev => ({
                        ...prev,
                        warningThresholds: { ...(prev.warningThresholds ?? { networkWarn: 25, zombieWarn: 5, diskWarn: 90, cpuWarn: 85, memoryWarn: 85 }), zombieWarn: parseInt(e.target.value) || 5 },
                      }))}
                      className="w-24 font-mono text-sm"
                    />
                    <span className="text-xs text-muted-foreground">stopped</span>
                  </div>
                </div>

              </div>
            </Card>
          </TabsContent>

          <TabsContent value="files" className="space-y-4 mt-6">
            <Card className="p-4 space-y-3">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Stack File Exclude Patterns</Label>
                <p className="text-[11px] text-muted-foreground">Excluded patterns are hidden from Stack Editor Files list. Use glob-like entries such as *.png or *.zip.</p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={excludeDraft}
                  onChange={e => setExcludeDraft(e.target.value)}
                  placeholder="*.png"
                  className="h-8 font-mono text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => {
                    const v = excludeDraft.trim()
                    if (!v) return
                    const current = localSettings.stackFileExcludes || []
                    if (current.includes(v)) { setExcludeDraft(''); return }
                    setLocalSettings(prev => ({ ...prev, stackFileExcludes: [...(prev.stackFileExcludes || []), v] }))
                    setExcludeDraft('')
                  }}
                >
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(localSettings.stackFileExcludes || [
                  '*.jpg', '*.jpeg', '*.png', '*.gif', '*.webp', '*.bmp', '*.ico', '*.svg', '*.avif', '*.tiff',
                  '*.mp4', '*.mkv', '*.mov', '*.avi', '*.mp3', '*.wav', '*.flac', '*.zip', '*.tar', '*.gz', '*.7z', '*.pdf',
                  '*.svc',
                ]).map((pattern) => (
                  <Badge key={pattern} variant="outline" className="font-mono text-[10px] gap-1">
                    {pattern}
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setLocalSettings(prev => ({ ...prev, stackFileExcludes: (prev.stackFileExcludes || []).filter(p => p !== pattern) }))}
                    >
                      <XCircle className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </Card>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>Cancel</Button>
          <Button onClick={handleSave}>Save Settings</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
