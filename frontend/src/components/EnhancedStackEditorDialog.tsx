import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FileCode, File, Clock, GitBranch, Diff, Copy, RefreshCw } from 'lucide-react'
import type { Stack } from '@/lib/types'
import { toast } from 'sonner'

interface EnhancedStackEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  stack: Stack | null
  stacksBasePath: string
  volumesBasePath: string
  onSave: (stack: Stack) => void
  allStacks: Stack[]
  allContainers: { id: string; name: string; ports?: string[] }[]
}

export function EnhancedStackEditorDialog({ 
  open, 
  onOpenChange, 
  stack, 
  onSave 
}: EnhancedStackEditorDialogProps) {
  const [compose, setCompose] = useState('')
  const [envFile, setEnvFile] = useState('')
  const [stackPath, setStackPath] = useState('')
  const [volumePath, setVolumePath] = useState('')
  const [gitEnabled, setGitEnabled] = useState(false)
  const [gitRepoUrl, setGitRepoUrl] = useState('')
  const [gitBranch, setGitBranch] = useState('main')
  const [gitComposePath, setGitComposePath] = useState('docker-compose.yml')
  const [gitAutoSync, setGitAutoSync] = useState(false)
  const [compareVersion, setCompareVersion] = useState<number | null>(null)

  useEffect(() => {
    if (stack) {
      setCompose(stack.compose || stack.composeContent || '')
      setEnvFile(stack.envFile || stack.envContent || '')
      setStackPath(stack.stackPath || '')
      setVolumePath(stack.volumePath || '')
      const git = (stack as any).gitRepoConfig
      if (git) {
        setGitEnabled(git.enabled || false)
        setGitRepoUrl(git.repoUrl || '')
        setGitBranch(git.branch || 'main')
        setGitComposePath(git.composePath || 'docker-compose.yml')
        setGitAutoSync(git.autoSync || false)
      } else {
        setGitEnabled(false)
        setGitRepoUrl('')
        setGitBranch('main')
        setGitComposePath('docker-compose.yml')
        setGitAutoSync(false)
      }
      setCompareVersion(null)
    }
  }, [stack])

  if (!stack) return null

  const handleSave = () => {
    const updatedStack: Stack = {
      ...stack,
      compose,
      composeContent: compose,
      envFile: envFile || undefined,
      envContent: envFile || undefined,
      stackPath,
      volumePath,
      version: stack.version + 1,
      versions: [
        ...(stack.versions || []),
        {
          id: `v-${Date.now()}`,
          version: stack.version + 1,
          composeContent: compose,
          envContent: envFile,
          description: 'Updated via editor',
          createdAt: new Date().toISOString()
        }
      ]
    }
    // Attach git config
    ;(updatedStack as any).gitRepoConfig = gitEnabled ? {
      enabled: true,
      repoUrl: gitRepoUrl,
      branch: gitBranch,
      composePath: gitComposePath,
      autoSync: gitAutoSync,
    } : null
    onSave(updatedStack)
    toast.success('Stack saved')
    onOpenChange(false)
  }

  const selectedCompareVersion = compareVersion
    ? (stack.versions || []).find(v => v.version === compareVersion)
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Edit Stack: <span className="font-mono text-primary">{stack.name}</span>
          </DialogTitle>
          <DialogDescription>
            Edit the compose file, environment variables, and configuration for this stack
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="compose" className="mt-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="compose" className="gap-2">
              <FileCode className="w-4 h-4" />
              Compose
            </TabsTrigger>
            <TabsTrigger value="env" className="gap-2">
              <File className="w-4 h-4" />
              .env
            </TabsTrigger>
            <TabsTrigger value="git" className="gap-2">
              <GitBranch className="w-4 h-4" />
              Git Sync
            </TabsTrigger>
            <TabsTrigger value="versions" className="gap-2">
              <Clock className="w-4 h-4" />
              Versions
            </TabsTrigger>
            <TabsTrigger value="compare" className="gap-2">
              <Diff className="w-4 h-4" />
              Compare
            </TabsTrigger>
          </TabsList>

          <TabsContent value="compose" className="mt-4 space-y-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="font-mono text-xs gap-1">
                {stackPath}
                <Copy className="w-3 h-3 cursor-pointer" onClick={() => {
                  navigator.clipboard.writeText(stackPath)
                  toast.success('Path copied')
                }} />
              </Badge>
            </div>
            <Textarea
              value={compose}
              onChange={(e) => setCompose(e.target.value)}
              className="min-h-[400px] font-mono text-sm"
            />
          </TabsContent>

          <TabsContent value="env" className="mt-4">
            <Textarea
              value={envFile}
              onChange={(e) => setEnvFile(e.target.value)}
              className="min-h-[300px] font-mono text-sm"
              placeholder="KEY=value"
            />
          </TabsContent>

          <TabsContent value="git" className="mt-4 space-y-4">
            <Card className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <Label className="text-base">Enable Git Sync</Label>
                  <p className="text-sm text-muted-foreground">Sync this stack with a Git repository</p>
                </div>
                <Switch checked={gitEnabled} onCheckedChange={setGitEnabled} />
              </div>

              {gitEnabled && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Repository URL</Label>
                    <Input
                      value={gitRepoUrl}
                      onChange={(e) => setGitRepoUrl(e.target.value)}
                      placeholder="https://github.com/user/repo.git"
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Branch</Label>
                      <Input
                        value={gitBranch}
                        onChange={(e) => setGitBranch(e.target.value)}
                        placeholder="main"
                        className="font-mono text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Compose File Path</Label>
                      <Input
                        value={gitComposePath}
                        onChange={(e) => setGitComposePath(e.target.value)}
                        placeholder="docker-compose.yml"
                        className="font-mono text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div>
                      <Label>Auto-Sync</Label>
                      <p className="text-xs text-muted-foreground">Automatically pull changes on schedule</p>
                    </div>
                    <Switch checked={gitAutoSync} onCheckedChange={setGitAutoSync} />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => toast.info('Syncing...')}>
                      <RefreshCw className="w-4 h-4 mr-2" /> Sync Now
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => toast.info('Pushing...')}>
                      <GitBranch className="w-4 h-4 mr-2" /> Push Changes
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="versions" className="mt-4">
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {(stack.versions || []).slice().reverse().map((version) => (
                  <div
                    key={version.version}
                    className="p-3 rounded-lg border border-border bg-card"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                        <Badge variant={version.version === stack.version ? 'default' : 'outline'}>
                          v{version.version}
                        </Badge>
                        <span className="text-sm">{version.description}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setCompareVersion(version.version)}
                        >
                          Compare
                        </Button>
                        {version.version !== stack.version && (
                          <Button size="sm" variant="outline" onClick={() => {
                            toast.info(`Restoring to v${version.version}`)
                          }}>
                            Restore
                          </Button>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(version.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {(!stack.versions || stack.versions.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-8">No version history</p>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="compare" className="mt-4 space-y-3">
            <div className="flex items-center gap-4 mb-2">
              <Label>Compare version:</Label>
              <Select
                value={compareVersion?.toString() || ''}
                onValueChange={(v) => setCompareVersion(parseInt(v))}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select version" />
                </SelectTrigger>
                <SelectContent>
                  {(stack.versions || []).filter(v => v.version !== stack.version).map(v => (
                    <SelectItem key={v.version} value={v.version.toString()}>
                      v{v.version} — {v.description || 'No description'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">vs Current (v{stack.version})</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {selectedCompareVersion ? `v${selectedCompareVersion.version}` : 'Select a version'}
                </Label>
                <Textarea
                  value={selectedCompareVersion?.composeContent || selectedCompareVersion?.compose || ''}
                  readOnly
                  className="min-h-[350px] font-mono text-xs opacity-80"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Current (v{stack.version})</Label>
                <Textarea
                  value={compose}
                  readOnly
                  className="min-h-[350px] font-mono text-xs"
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
