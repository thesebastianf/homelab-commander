import { useState, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Layers, Play, Square, RotateCw, FileCode, File, Clock, FolderOpen, Search, Filter, X, Save, Upload, Rocket } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Stack } from '@/lib/types'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface StacksListProps {
  stacks: Stack[]
  selectedStack: Stack | null
  onSelectStack: (stack: Stack) => void
  onStart: (id: string) => void
  onStop: (id: string) => void
  onRestart: (id: string) => void
  onEdit: (stack: Stack) => void
}

export function StacksList({ 
  stacks, 
  selectedStack, 
  onSelectStack,
  onStart,
  onStop,
  onRestart,
  onEdit
}: StacksListProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<Set<Stack['status']>>(new Set())
  const [editedCompose, setEditedCompose] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  const composeTextareaRef = useRef<HTMLTextAreaElement>(null)

  const getAllUsedPorts = () => {
    const portMap = new Map<number, { stackId: string; stackName: string; status: Stack['status'] }[]>()
    
    stacks.forEach(stack => {
      if (!stack.ports) return
      stack.ports.forEach(port => {
        if (!portMap.has(port)) {
          portMap.set(port, [])
        }
        portMap.get(port)!.push({
          stackId: stack.id,
          stackName: stack.name,
          status: stack.status
        })
      })
    })
    
    return portMap
  }

  const getPortConflicts = (stackId: string, ports: number[] | undefined) => {
    if (!ports) return []
    const allPorts = getAllUsedPorts()
    const conflicts: number[] = []
    ports.forEach(port => {
      const stacksUsingPort = allPorts.get(port) || []
      const otherStacks = stacksUsingPort.filter(s => s.stackId !== stackId)
      if (otherStacks.length > 0) {
        conflicts.push(port)
      }
    })
    return conflicts
  }

  const getStatusColor = (status: Stack['status']) => {
    switch (status) {
      case 'running': return 'bg-success text-success-foreground'
      case 'stopped': return 'bg-muted text-muted-foreground'
      case 'failed': return 'bg-destructive text-destructive-foreground'
      case 'deploying': return 'bg-info text-info-foreground'
      default: return 'bg-muted text-muted-foreground'
    }
  }

  const handleStatusFilterToggle = (status: Stack['status']) => {
    const newFilter = new Set(statusFilter)
    if (newFilter.has(status)) {
      newFilter.delete(status)
    } else {
      newFilter.add(status)
    }
    setStatusFilter(newFilter)
  }

  const filteredStacks = stacks.filter(stack => {
    const matchesSearch = searchQuery === '' || 
      stack.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      stack.compose.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter.size === 0 || statusFilter.has(stack.status)
    return matchesSearch && matchesStatus
  }).sort((a, b) => {
    const aIsActive = a.status === 'running' || a.status === 'deploying'
    const bIsActive = b.status === 'running' || b.status === 'deploying'
    if (aIsActive && !bIsActive) return -1
    if (!aIsActive && bIsActive) return 1
    return a.name.localeCompare(b.name)
  })

  const activeFilterCount = statusFilter.size
  const isRunning = selectedStack?.status === 'running'

  return (
    <div className="grid grid-cols-12 gap-6 h-full">
      <div className="col-span-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold font-mono text-muted-foreground">STACKS</h3>
          <Badge variant="outline" className="font-mono">
            {filteredStacks.length}/{stacks.length}
          </Badge>
        </div>
        
        <div className="space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search stacks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9 font-mono"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                onClick={() => setSearchQuery('')}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full gap-2 font-mono">
                <Filter className="w-4 h-4" />
                Filter by Status
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-auto">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuCheckboxItem
                checked={statusFilter.has('running')}
                onCheckedChange={() => handleStatusFilterToggle('running')}
              >
                <div className="w-2 h-2 rounded-full bg-success mr-2" />
                Running
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={statusFilter.has('stopped')}
                onCheckedChange={() => handleStatusFilterToggle('stopped')}
              >
                <div className="w-2 h-2 rounded-full bg-muted mr-2" />
                Stopped
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={statusFilter.has('deploying')}
                onCheckedChange={() => handleStatusFilterToggle('deploying')}
              >
                <div className="w-2 h-2 rounded-full bg-info mr-2" />
                Deploying
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={statusFilter.has('failed')}
                onCheckedChange={() => handleStatusFilterToggle('failed')}
              >
                <div className="w-2 h-2 rounded-full bg-destructive mr-2" />
                Failed
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <ScrollArea className="h-[calc(100vh-380px)]">
          <div className="space-y-2 pr-4">
            {filteredStacks.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Layers className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No stacks found</p>
              </div>
            ) : (
              filteredStacks.map((stack) => {
                const portConflicts = getPortConflicts(stack.id, stack.ports)
                const allPorts = getAllUsedPorts()
                
                return (
                  <Card
                    key={stack.id}
                    className={cn(
                      "p-4 cursor-pointer hover:bg-accent/50 transition-colors border-l-4",
                      selectedStack?.id === stack.id && "bg-accent/30 shadow-md"
                    )}
                    style={{
                      borderLeftColor: stack.status === 'running' ? 'var(--success)' : stack.status === 'failed' ? 'var(--destructive)' : 'var(--border)'
                    }}
                    onClick={() => onSelectStack(stack)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Layers className="w-5 h-5 text-primary" />
                        <h4 className="font-mono font-semibold">{stack.name}</h4>
                      </div>
                      <Badge className={cn(getStatusColor(stack.status), "text-xs")}>
                        {stack.status}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{stack.services} services</span>
                        <span>•</span>
                        <span>v{stack.version}</span>
                      </div>
                      {stack.ports && stack.ports.length > 0 && (
                        <TooltipProvider>
                          <div className="flex flex-wrap gap-1">
                            {stack.ports.map((port) => {
                              const isConflict = portConflicts.includes(port)
                              const stacksUsingPort = allPorts.get(port) || []
                              const otherStacks = stacksUsingPort.filter(s => s.stackId !== stack.id)
                              
                              return (
                                <Tooltip key={port}>
                                  <TooltipTrigger asChild>
                                    <Badge 
                                      variant={isConflict ? "destructive" : "outline"} 
                                      className={cn(
                                        "text-[10px] font-mono px-1.5 py-0",
                                        isConflict && "animate-pulse"
                                      )}
                                    >
                                      :{port}
                                    </Badge>
                                  </TooltipTrigger>
                                  {isConflict && (
                                    <TooltipContent side="top" className="max-w-xs">
                                      <div className="text-xs">
                                        <p className="font-semibold mb-1">Port conflict detected!</p>
                                        <p className="text-muted-foreground">Also used by:</p>
                                        <ul className="mt-1 space-y-0.5">
                                          {otherStacks.map((s, idx) => (
                                            <li key={idx} className="text-warning">
                                              • {s.stackName} ({s.status})
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    </TooltipContent>
                                  )}
                                </Tooltip>
                              )
                            })}
                          </div>
                        </TooltipProvider>
                      )}
                    </div>
                  </Card>
                )
              })
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="col-span-8">
        {selectedStack ? (
          <Card className="p-6 h-[calc(100vh-280px)] flex flex-col">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold font-mono mb-1">{selectedStack.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {selectedStack.services} services • Version {selectedStack.version}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!isRunning && selectedStack.status !== 'deploying' && (
                  <Button onClick={() => onStart(selectedStack.id)} size="sm">
                    <Play className="w-4 h-4 mr-2" />
                    Start
                  </Button>
                )}
                {isRunning && (
                  <>
                    <Button onClick={() => onStop(selectedStack.id)} variant="outline" size="sm">
                      <Square className="w-4 h-4 mr-2" />
                      Stop
                    </Button>
                    <Button onClick={() => onRestart(selectedStack.id)} variant="outline" size="sm">
                      <RotateCw className="w-4 h-4 mr-2" />
                      Restart
                    </Button>
                  </>
                )}
                <Button onClick={() => onEdit(selectedStack)} size="sm">
                  Edit Stack
                </Button>
              </div>
            </div>

            <Separator className="mb-6" />

            <Tabs defaultValue="compose" className="flex-1 flex flex-col overflow-hidden">
              <TabsList>
                <TabsTrigger value="compose" className="gap-2">
                  <FileCode className="w-4 h-4" />
                  docker-compose.yml
                </TabsTrigger>
                <TabsTrigger value="env" className="gap-2">
                  <File className="w-4 h-4" />
                  .env
                </TabsTrigger>
                <TabsTrigger value="info" className="gap-2">
                  <FolderOpen className="w-4 h-4" />
                  Info
                </TabsTrigger>
              </TabsList>

              <TabsContent value="compose" className="flex-1 overflow-hidden mt-4">
                <div className="h-full flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Button 
                        variant={isEditing ? "outline" : "default"} 
                        size="sm"
                        onClick={() => {
                          if (!isEditing) {
                            setEditedCompose(selectedStack.compose)
                            setIsEditing(true)
                          } else {
                            setIsEditing(false)
                          }
                        }}
                      >
                        {isEditing ? 'Cancel' : 'Edit'}
                      </Button>
                      {isEditing && (
                        <Button 
                          size="sm"
                          onClick={() => {
                            toast.success('Compose saved')
                            setIsEditing(false)
                          }}
                        >
                          <Save className="w-4 h-4 mr-2" />
                          Save
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          toast.info('Updating stack...')
                          onRestart(selectedStack.id)
                        }}
                        disabled={selectedStack.status !== 'running'}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Update
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          toast.info('Deploying stack...')
                          setTimeout(() => {
                            onStart(selectedStack.id)
                          }, 500)
                        }}
                        disabled={selectedStack.status === 'running' || selectedStack.status === 'deploying'}
                      >
                        <Rocket className="w-4 h-4 mr-2" />
                        Deploy
                      </Button>
                      {!isRunning && selectedStack.status !== 'deploying' && (
                        <Button 
                          size="sm"
                          onClick={() => onStart(selectedStack.id)}
                        >
                          <Play className="w-4 h-4 mr-2" />
                          Start
                        </Button>
                      )}
                    </div>
                  </div>
                  <ScrollArea className="flex-1">
                    <Textarea
                      ref={composeTextareaRef}
                      value={isEditing ? editedCompose : selectedStack.compose}
                      onChange={(e) => isEditing && setEditedCompose(e.target.value)}
                      readOnly={!isEditing}
                      className={cn(
                        "min-h-[500px] font-mono text-sm resize-none",
                        !isEditing && "border-0 focus-visible:ring-0 cursor-default"
                      )}
                    />
                  </ScrollArea>
                </div>
              </TabsContent>

              <TabsContent value="env" className="flex-1 overflow-hidden mt-4">
                <ScrollArea className="h-full">
                  {selectedStack.envFile ? (
                    <Textarea
                      value={selectedStack.envFile}
                      readOnly
                      className="min-h-[500px] font-mono text-sm resize-none border-0 focus-visible:ring-0"
                    />
                  ) : (
                    <div className="text-center py-16 text-muted-foreground">
                      <File className="w-16 h-16 mx-auto mb-4 opacity-50" />
                      <p>No environment file configured</p>
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="info" className="flex-1 overflow-hidden mt-4">
                <ScrollArea className="h-full">
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-sm font-semibold mb-3">Paths</h4>
                      <div className="space-y-3">
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-xs text-muted-foreground mb-1">Stack Path</p>
                          <code className="text-sm font-mono">
                            {selectedStack.stackPath || 'Not configured'}
                          </code>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-xs text-muted-foreground mb-1">Volume Path</p>
                          <code className="text-sm font-mono">
                            {selectedStack.volumePath || 'Not configured'}
                          </code>
                        </div>
                      </div>
                    </div>

                    {selectedStack.ports && selectedStack.ports.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-3">Exposed Ports</h4>
                        <div className="flex flex-wrap gap-2">
                          {selectedStack.ports.map((port) => (
                            <Badge key={port} variant="outline" className="font-mono">
                              {port}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <h4 className="text-sm font-semibold mb-3">Version History</h4>
                      {selectedStack.versions && selectedStack.versions.length > 0 ? (
                        <div className="space-y-2">
                          {selectedStack.versions.slice(-5).reverse().map((version) => (
                            <div
                              key={version.version}
                              className="p-3 rounded-lg border border-border bg-card"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                                  <Badge variant={version.version === selectedStack.version ? 'default' : 'outline'}>
                                    v{version.version}
                                  </Badge>
                                  <span className="text-sm">{version.description}</span>
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(version.createdAt || version.timestamp || '').toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No version history</p>
                      )}
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </Card>
        ) : (
          <Card className="p-12 h-[calc(100vh-280px)] flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <Layers className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-mono">Select a stack to view details</p>
              <p className="text-sm mt-2">Click on a stack from the list to see its configuration</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
