import { useState, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ListOrdered, Plus, Trash2, AlertTriangle, Search, Palette } from 'lucide-react'
import type { Container, Stack, PortReservation } from '@/lib/types'
import { toast } from 'sonner'

const RANGE_PRESETS: { label: string; start: number; end: number; group: string; color: string }[] = [
  { label: 'Web Services', start: 8080, end: 8099, group: 'Web', color: '#3b82f6' },
  { label: 'Databases', start: 5432, end: 5499, group: 'Databases', color: '#f59e0b' },
  { label: 'Monitoring', start: 9090, end: 9099, group: 'Monitoring', color: '#10b981' },
  { label: 'Media', start: 8200, end: 8299, group: 'Media', color: '#8b5cf6' },
  { label: 'Home Automation', start: 8100, end: 8199, group: 'HA', color: '#ef4444' },
  { label: 'Dev / CI-CD', start: 3000, end: 3099, group: 'Dev', color: '#06b6d4' },
]

const GROUP_COLORS: Record<string, string> = {
  Web: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  Databases: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  Monitoring: 'bg-green-500/20 text-green-400 border-green-500/30',
  Media: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  HA: 'bg-red-500/20 text-red-400 border-red-500/30',
  Dev: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  Custom: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
}

interface PortRegistryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  containers: Container[]
  stacks: Stack[]
  reservations?: PortReservation[]
  onCreateReservation?: (r: Omit<PortReservation, 'id' | 'createdAt'>) => void
  onDeleteReservation?: (id: string) => void
}

export function PortRegistryDialog({
  open,
  onOpenChange,
  containers,
  stacks,
  reservations = [],
  onCreateReservation,
  onDeleteReservation,
}: PortRegistryDialogProps) {
  const [search, setSearch] = useState('')
  const [newName, setNewName] = useState('')
  const [newStart, setNewStart] = useState('')
  const [newEnd, setNewEnd] = useState('')
  const [newGroup, setNewGroup] = useState('Custom')
  const [newColor, setNewColor] = useState('#6b7280')

  // Build port usage map — deduplicate so TCP+UDP bindings don't create false conflicts
  const usedPorts = useMemo(() => {
    const map = new Map<number, string[]>()
    // Track (portNum, name) pairs already recorded to avoid TCP/UDP duplicates
    const seen = new Set<string>()

    containers.forEach(c => {
      if (c.ports) {
        c.ports.forEach(p => {
          const portStr = p.split(':')[0]
          const portNum = parseInt(portStr, 10)
          if (!isNaN(portNum)) {
            const key = `${portNum}:${c.name}`
            if (!seen.has(key)) {
              seen.add(key)
              if (!map.has(portNum)) map.set(portNum, [])
              map.get(portNum)!.push(c.name)
            }
          }
        })
      }
    })
    // Only include stack-level ports if the stack has no running containers already recorded
    // to avoid double-counting (stack ports are already reflected by their containers)
    const containerNames = new Set(containers.map(c => c.name))
    stacks.forEach(s => {
      if (s.ports) {
        s.ports.forEach(port => {
          const key = `${port}:Stack: ${s.name}`
          if (!seen.has(key)) {
            seen.add(key)
            if (!map.has(port)) map.set(port, [])
            map.get(port)!.push(`Stack: ${s.name}`)
          }
        })
      }
    })
    return map
  }, [containers, stacks])

  const sortedPorts = useMemo(() => {
    return Array.from(usedPorts.entries()).sort(([a], [b]) => a - b)
  }, [usedPorts])

  const conflicts = useMemo(() => {
    return sortedPorts.filter(([_, users]) => users.length > 1)
  }, [sortedPorts])

  const filteredPorts = useMemo(() => {
    if (!search) return sortedPorts
    const term = search.toLowerCase()
    return sortedPorts.filter(([port, users]) =>
      port.toString().includes(term) || users.some(u => u.toLowerCase().includes(term))
    )
  }, [sortedPorts, search])

  const stats = {
    total: usedPorts.size,
    conflicts: conflicts.length,
    reservedRanges: reservations.length,
    allocated: usedPorts.size,
    available: 65535 - usedPorts.size,
    groups: [...new Set(reservations.map(r => r.groupName))].length,
  }

  const handleAddReservation = () => {
    const start = parseInt(newStart)
    const end = parseInt(newEnd)
    if (isNaN(start) || isNaN(end) || start < 1 || end > 65535 || start > end) {
      toast.error('Invalid port range (1-65535, start ≤ end)')
      return
    }
    if (!newName.trim()) {
      toast.error('Name is required')
      return
    }
    onCreateReservation?.({
      name: newName.trim(),
      portRangeStart: start,
      portRangeEnd: end,
      groupName: newGroup,
      color: newColor,
    })
    setNewName('')
    setNewStart('')
    setNewEnd('')
    toast.success(`Range ${start}-${end} reserved`)
  }

  const applyPreset = (preset: typeof RANGE_PRESETS[number]) => {
    setNewName(preset.label)
    setNewStart(preset.start.toString())
    setNewEnd(preset.end.toString())
    setNewGroup(preset.group)
    setNewColor(preset.color)
  }

  const getPortsUsedInRange = (start: number, end: number) => {
    let count = 0
    for (let p = start; p <= end; p++) {
      if (usedPorts.has(p)) count++
    }
    return count
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListOrdered className="w-6 h-6 text-primary" />
            Port Registry
          </DialogTitle>
          <DialogDescription>
            Track and manage port allocations across your homelab
          </DialogDescription>
        </DialogHeader>

        {/* Stats Bar */}
        <div className="grid grid-cols-6 gap-2 mt-2">
          {([
            ['Total Used', stats.total],
            ['Conflicts', stats.conflicts],
            ['Ranges', stats.reservedRanges],
            ['Allocated', stats.allocated],
            ['Available', stats.available],
            ['Groups', stats.groups],
          ] as const).map(([label, value]) => (
            <Card key={label} className="p-2 text-center">
              <div className="text-lg font-mono font-bold">{value.toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground">{label}</div>
            </Card>
          ))}
        </div>

        {/* Search */}
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ports or services..."
            className="pl-9"
          />
        </div>

        <Tabs defaultValue="mappings" className="mt-2">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="mappings">Port Mappings</TabsTrigger>
            <TabsTrigger value="reservations">Range Reservations</TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="mt-4">
            <ScrollArea className="h-[400px]">
              <div className="space-y-1.5">
                {/* Visual port range bars for reservations */}
                {reservations.map(res => {
                  const rangeSize = res.portRangeEnd - res.portRangeStart + 1
                  const usedCount = getPortsUsedInRange(res.portRangeStart, res.portRangeEnd)
                  const pct = rangeSize > 0 ? (usedCount / rangeSize) * 100 : 0
                  return (
                    <div key={res.id} className="p-3 rounded-lg border border-border bg-card">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: res.color }} />
                          <span className="text-sm font-medium">{res.name}</span>
                          <Badge variant="outline" className={`text-[10px] ${GROUP_COLORS[res.groupName] || GROUP_COLORS.Custom}`}>
                            {res.groupName}
                          </Badge>
                        </div>
                        <span className="text-xs font-mono text-muted-foreground">
                          {res.portRangeStart}–{res.portRangeEnd} ({usedCount}/{rangeSize})
                        </span>
                      </div>
                      <Progress value={pct} className="h-2" />
                    </div>
                  )
                })}
                {/* Unranged active ports */}
                {sortedPorts
                  .filter(([port]) => !reservations.some(r => port >= r.portRangeStart && port <= r.portRangeEnd))
                  .map(([port, users]) => (
                    <div key={port} className="flex items-center justify-between p-2 rounded border border-border bg-card/50">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono w-16 justify-center text-xs">{port}</Badge>
                        <span className="text-xs">{users.join(', ')}</span>
                      </div>
                      {users.length > 1 && (
                        <Badge variant="destructive" className="text-[10px]">Conflict</Badge>
                      )}
                    </div>
                  ))}
                {sortedPorts.length === 0 && reservations.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-12">No port data</p>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="mappings" className="mt-4">
            {conflicts.length > 0 && (
              <Card className="border-destructive bg-destructive/5 mb-3">
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-destructive" />
                    <span className="font-semibold text-sm text-destructive">Port Conflicts ({conflicts.length})</span>
                  </div>
                  <div className="space-y-1">
                    {conflicts.map(([port, users]) => (
                      <div key={port} className="text-xs text-muted-foreground">
                        Port <Badge variant="destructive" className="text-[10px] mx-1">{port}</Badge>
                        used by: {users.join(', ')}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <ScrollArea className="h-[380px]">
              <div className="space-y-1.5">
                {filteredPorts.map(([port, users]) => (
                  <div key={port} className="flex items-center justify-between p-2 rounded border border-border bg-card">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="font-mono w-16 justify-center">{port}</Badge>
                      <span className="text-sm">{users.join(', ')}</span>
                    </div>
                    {users.length > 1 && (
                      <Badge variant="destructive" className="text-[10px]">Conflict</Badge>
                    )}
                  </div>
                ))}
                {filteredPorts.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-12">No ports match your search</p>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="reservations" className="mt-4 space-y-4">
            {/* Create form */}
            <Card className="p-4 space-y-3">
              <Label className="text-sm font-semibold">Create Range Reservation</Label>
              <div className="flex flex-wrap gap-1.5">
                {RANGE_PRESETS.map(p => (
                  <Button key={p.label} variant="outline" size="sm" className="text-xs h-7" onClick={() => applyPreset(p)}>
                    <div className="w-2.5 h-2.5 rounded-full mr-1.5" style={{ backgroundColor: p.color }} />
                    {p.label}
                  </Button>
                ))}
              </div>
              <div className="grid grid-cols-5 gap-2 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Name</Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Range name" className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Start Port</Label>
                  <Input type="number" value={newStart} onChange={(e) => setNewStart(e.target.value)} placeholder="8080" className="h-8 text-xs font-mono" min={1} max={65535} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">End Port</Label>
                  <Input type="number" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} placeholder="8099" className="h-8 text-xs font-mono" min={1} max={65535} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Group</Label>
                  <Select value={newGroup} onValueChange={setNewGroup}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(GROUP_COLORS).map(g => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" onClick={handleAddReservation} className="h-8">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Reserve
                </Button>
              </div>
            </Card>

            {/* Existing reservations */}
            <ScrollArea className="h-[280px]">
              <div className="space-y-2">
                {reservations.map(res => {
                  const rangeSize = res.portRangeEnd - res.portRangeStart + 1
                  const usedCount = getPortsUsedInRange(res.portRangeStart, res.portRangeEnd)
                  const pct = rangeSize > 0 ? (usedCount / rangeSize) * 100 : 0
                  return (
                    <Card key={res.id} className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: res.color }} />
                          <span className="text-sm font-medium">{res.name}</span>
                          <Badge variant="outline" className={`text-[10px] ${GROUP_COLORS[res.groupName] || GROUP_COLORS.Custom}`}>
                            {res.groupName}
                          </Badge>
                          <span className="text-xs font-mono text-muted-foreground">
                            {res.portRangeStart}–{res.portRangeEnd}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => onDeleteReservation?.(res.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={pct} className="h-2 flex-1" />
                        <span className="text-xs text-muted-foreground font-mono">{usedCount}/{rangeSize}</span>
                      </div>
                    </Card>
                  )
                })}
                {reservations.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No range reservations yet. Use the presets above or create a custom range.</p>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
