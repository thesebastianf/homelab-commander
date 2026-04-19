import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { FileCode, File, Clock, GitBranch, Diff, Copy, RefreshCw, FolderOpen, FileText, Save, Loader2, GitCommit, CheckCircle2, AlertTriangle, HardDriveDownload } from 'lucide-react'
import type { Stack } from '@/lib/types'
import { toast } from 'sonner'
import * as api from '@/lib/api'

/** Flatten the nested file tree returned by the backend into a list with depth */
function flattenFileTree(nodes: any[], depth = 0): any[] {
  const result: any[] = []
  for (const node of nodes) {
    result.push({ ...node, depth })
    if (node.type === 'directory' && Array.isArray(node.children)) {
      result.push(...flattenFileTree(node.children, depth + 1))
    }
  }
  return result
}

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
  const [activeTab, setActiveTab] = useState('compose')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState('')
  const [fileDirty, setFileDirty] = useState(false)
  const [pushMessage, setPushMessage] = useState('')
  const [externalChangeDismissed, setExternalChangeDismissed] = useState(false)

  const qc = useQueryClient()

  // Fetch fresh stack data (with disk change detection) when dialog opens
  const { data: freshStack } = useQuery({
    queryKey: ['stack-detail', stack?.id],
    queryFn: () => api.fetchStack(stack!.id),
    enabled: open && !!stack,
    staleTime: 0,
  })

  const hasExternalChanges = !externalChangeDismissed && !!freshStack?.hasExternalChanges
  const diskComposeContent = freshStack?.diskComposeContent
  const diskEnvContent = freshStack?.diskEnvContent

  const { data: stackFiles = [] } = useQuery({
    queryKey: ['stackFiles', stack?.id],
    queryFn: () => api.fetchStackFiles(stack!.id),
    enabled: open && activeTab === 'files' && !!stack,
  })
  const flatFiles = flattenFileTree(stackFiles as any[])

  const { data: rawFileContent } = useQuery({
    queryKey: ['stackFileContent', stack?.id, selectedFile],
    queryFn: () => api.fetchStackFileContent(stack!.id, selectedFile!),
    enabled: open && !!stack && !!selectedFile,
  })

  useEffect(() => {
    if (rawFileContent !== undefined) {
      setFileContent(rawFileContent)
      setFileDirty(false)
    }
  }, [rawFileContent])

  const { data: gitStatus } = useQuery({
    queryKey: ['gitStatus', stack?.id],
    queryFn: () => api.fetchGitStatus(stack!.id),
    enabled: open && activeTab === 'git' && !!stack,
    refetchInterval: 30000,
  })

  const syncFromDisk = useMutation({
    mutationFn: () => api.syncStackFromDisk(stack!.id),
    onSuccess: (data) => {
      toast.success('Synced from disk — DB updated to match host files')
      setCompose(data.compose)
      setEnvFile(data.env)
      setExternalChangeDismissed(true)
      qc.invalidateQueries({ queryKey: ['stacks'] })
      qc.invalidateQueries({ queryKey: ['stack-detail', stack?.id] })
    },
    onError: (e: any) => toast.error(`Sync failed: ${e.message}`),
  })

  const saveFile = useMutation({
    mutationFn: () => api.saveStackFileContent(stack!.id, selectedFile!, fileContent),
    onSuccess: () => {
      toast.success('File saved')
      setFileDirty(false)
      qc.invalidateQueries({ queryKey: ['stacks'] })
    },
    onError: (e: any) => toast.error(`Save failed: ${e.message}`),
  })

  const syncGit = useMutation({
    mutationFn: () => api.syncStackGit(stack!.id),
    onSuccess: () => {
      toast.success('Git sync complete')
      qc.invalidateQueries({ queryKey: ['stacks'] })
      qc.invalidateQueries({ queryKey: ['gitStatus', stack?.id] })
    },
    onError: (e: any) => toast.error(`Sync failed: ${e.message}`),
  })

  const pushGit = useMutation({
    mutationFn: () => api.pushStackGit(stack!.id, pushMessage || undefined),
    onSuccess: () => {
      toast.success('Changes pushed to remote')
      setPushMessage('')
      qc.invalidateQueries({ queryKey: ['gitStatus', stack?.id] })
    },
    onError: (e: any) => toast.error(`Push failed: ${e.message}`),
  })

  const restoreVersion = useMutation({
    mutationFn: (version: number) => api.restoreStackVersion(stack!.id, version),
    onSuccess: () => {
      toast.success('Stack restored')
      qc.invalidateQueries({ queryKey: ['stacks'] })
      onOpenChange(false)
    },
    onError: (e: any) => toast.error(`Restore failed: ${e.message}`),
  })

  useEffect(() => {
    if (stack) {
      setCompose(stack.compose || stack.composeContent || '')
      setEnvFile(stack.envFile || stack.envContent || '')
      setStackPath(stack.stackPath || '')
      setVolumePath(stack.volumePath || '')
      setExternalChangeDismissed(false)
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
    <TooltipProvider delayDuration={350}>
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

        <Tabs defaultValue="compose" className="mt-4" onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="compose" className="gap-2">
              <FileCode className="w-4 h-4" />
              Compose
            </TabsTrigger>
            <TabsTrigger value="env" className="gap-2">
              <File className="w-4 h-4" />
              .env
            </TabsTrigger>
            <TabsTrigger value="files" className="gap-2">
              <FolderOpen className="w-4 h-4" />
              Files
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
            {hasExternalChanges && (
              <div className="flex items-start gap-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-2.5">
                <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-yellow-300">External changes detected</p>
                  <p className="text-xs text-yellow-400/80 mt-0.5">The compose file on disk differs from the DB version. Someone edited it directly on the host.</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1.5 border-yellow-500/40 text-yellow-300 hover:bg-yellow-500/20"
                        onClick={() => {
                          if (diskComposeContent) setCompose(diskComposeContent)
                          if (diskEnvContent !== null && diskEnvContent !== undefined) setEnvFile(diskEnvContent)
                          setExternalChangeDismissed(true)
                          toast.info('Loaded disk version into editor — save to persist')
                        }}
                      >
                        <HardDriveDownload className="w-3 h-3" />
                        Load disk
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent><p className="text-xs">Load the on-disk version into the editor (does not save yet)</p></TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        className="h-7 text-xs gap-1.5"
                        disabled={syncFromDisk.isPending}
                        onClick={() => syncFromDisk.mutate()}
                      >
                        {syncFromDisk.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        Sync to DB
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent><p className="text-xs">Save the disk version to the database and create a version snapshot</p></TooltipContent>
                  </Tooltip>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setExternalChangeDismissed(true)}>Dismiss</Button>
                </div>
              </div>
            )}
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

          <TabsContent value="files" className="mt-4">
            <div className="flex gap-3 h-[420px]">
              {/* File Tree */}
              <div className="w-56 shrink-0 rounded-lg border border-border/60 overflow-hidden flex flex-col">
                <div className="px-3 py-2 bg-muted/30 border-b border-border/60">
                  <p className="text-xs font-mono text-muted-foreground">Stack Directory</p>
                </div>
                <ScrollArea className="flex-1">
                  <div className="py-1">
                    {flatFiles.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4 px-2">No files found</p>
                    )}
                    {flatFiles.map((f: any) => (
                      <button
                        key={f.path}
                        onClick={() => f.type !== 'directory' && setSelectedFile(f.path)}
                        className={`w-full flex items-center gap-1.5 text-left py-1.5 text-xs font-mono hover:bg-muted/40 transition-colors ${
                          selectedFile === f.path ? 'bg-primary/10 text-primary' : 'text-foreground/80'
                        } ${f.type === 'directory' ? 'cursor-default opacity-70' : 'cursor-pointer'}`}
                        style={{ paddingLeft: `${f.depth * 12 + 12}px` }}>
                        {f.type === 'directory'
                          ? <FolderOpen className="w-3 h-3 shrink-0 text-muted-foreground" />
                          : <FileText className="w-3 h-3 shrink-0" />}
                        <span className="truncate">{f.name}</span>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
              {/* Editor */}
              <div className="flex-1 flex flex-col gap-2 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-muted-foreground truncate">{selectedFile ?? 'Select a file to edit'}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        disabled={!fileDirty || saveFile.isPending || !selectedFile}
                        onClick={() => saveFile.mutate()}
                        className="h-7 text-xs gap-1.5 shrink-0">
                        {saveFile.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        Save
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">Write current file changes to disk inside the stack directory</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Textarea
                  value={fileContent}
                  onChange={(e) => { setFileContent(e.target.value); setFileDirty(true) }}
                  className="flex-1 font-mono text-xs resize-none"
                  placeholder={selectedFile ? 'Loading...' : 'Select a file from the tree'}
                  disabled={!selectedFile}
                />
              </div>
            </div>
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
                  {gitStatus && (
                    <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2 flex items-center gap-4 text-xs">
                      <div className="flex items-center gap-1.5">
                        <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="font-mono">{gitStatus.branch ?? 'unknown'}</span>
                      </div>
                      {gitStatus.lastCommit && (
                        <div className="flex items-center gap-1.5">
                          <GitCommit className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="font-mono text-muted-foreground">{gitStatus.lastCommit.slice(0, 7)}</span>
                          <span className="text-muted-foreground truncate max-w-48">{gitStatus.lastCommitMessage}</span>
                        </div>
                      )}
                      <Badge className={`ml-auto text-[10px] shrink-0 ${gitStatus.status === 'clean' ? 'bg-success/10 text-success border-success/30' : 'bg-warning/10 text-warning border-warning/30'}`}>
                        {gitStatus.status === 'clean' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                        {gitStatus.status ?? 'unknown'}
                      </Badge>
                    </div>
                  )}
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="sm" disabled={syncGit.isPending} onClick={() => syncGit.mutate()}>
                            {syncGit.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                            Sync Now
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">Run git pull flow for this stack repository and refresh status</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="flex gap-2 items-center">
                      <Input
                        value={pushMessage}
                        onChange={(e) => setPushMessage(e.target.value)}
                        placeholder="Commit message (optional)"
                        className="font-mono text-sm h-8"
                      />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="sm" disabled={pushGit.isPending} onClick={() => pushGit.mutate()}>
                            {pushGit.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <GitBranch className="w-4 h-4 mr-2" />}
                            Push Changes
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">Commit local changes (if any) and push branch to remote</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
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
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setCompareVersion(version.version)}
                            >
                              Compare
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Load this version into the compare tab against current compose</p>
                          </TooltipContent>
                        </Tooltip>
                        {version.version !== stack.version && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="sm" variant="outline" disabled={restoreVersion.isPending} onClick={() => restoreVersion.mutate(version.version)}>
                                Restore
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">Rollback stack files to version v{version.version}</p>
                            </TooltipContent>
                          </Tooltip>
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
    </TooltipProvider>
  )
}
