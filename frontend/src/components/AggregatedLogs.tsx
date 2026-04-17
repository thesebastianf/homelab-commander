import { useState, useEffect, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { LogEntry } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Search, RotateCw, Pause, Play, AlertTriangle, Info, X, Bug, CheckCircle } from 'lucide-react'

interface AggregatedLogsProps {
  logs: LogEntry[]
  onRefresh?: () => void
}

export function AggregatedLogs({ logs, onRefresh }: AggregatedLogsProps) {
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>(logs)
  const [searchQuery, setSearchQuery] = useState('')
  const [levelFilter, setLevelFilter] = useState<string>('warn')
  const [containerFilter, setContainerFilter] = useState<string>('all')
  const [isPaused, setIsPaused] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  const uniqueContainers = Array.from(new Set(logs.map(log => log.container)))

  useEffect(() => {
    let filtered = logs

    if (searchQuery) {
      filtered = filtered.filter(log =>
        log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.container.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    if (levelFilter !== 'all') {
      // Inclusive filtering: each level includes itself and all higher-severity levels.
      // Severity order (highest → lowest): error > warn > info > debug
      const levels: Record<string, string[]> = {
        error: ['error'],
        warn:  ['warn', 'error'],
        info:  ['info', 'warn', 'error'],
        debug: ['debug', 'info', 'warn', 'error'],
      }
      const allowed = levels[levelFilter] ?? [levelFilter]
      filtered = filtered.filter(log => allowed.includes(log.level))
    }

    if (containerFilter !== 'all') {
      filtered = filtered.filter(log => log.container === containerFilter)
    }

    setFilteredLogs(filtered)
  }, [logs, searchQuery, levelFilter, containerFilter])

  useEffect(() => {
    if (autoScroll && scrollRef.current && !isPaused) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [filteredLogs, autoScroll, isPaused])

  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error': return 'bg-destructive text-destructive-foreground'
      case 'warn': return 'bg-warning text-warning-foreground'
      case 'debug': return 'bg-info text-info-foreground'
      case 'info':
      default: return 'bg-muted text-muted-foreground'
    }
  }

  const getLevelIcon = (level: LogEntry['level']) => {
    switch (level) {
      case 'error': return <X className="w-3.5 h-3.5" />
      case 'warn': return <AlertTriangle className="w-3.5 h-3.5" />
      case 'debug': return <Bug className="w-3.5 h-3.5" />
      case 'info':
      default: return <Info className="w-3.5 h-3.5" />
    }
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    })
  }

  const logCounts = {
    total: filteredLogs.length,
    error: filteredLogs.filter(l => l.level === 'error').length,
    warn: filteredLogs.filter(l => l.level === 'warn').length,
    info: filteredLogs.filter(l => l.level === 'info').length,
    debug: filteredLogs.filter(l => l.level === 'debug').length,
  }

  return (
    <Card className="p-0 overflow-hidden relative">
      <div className="p-4 border-b border-border bg-card/50">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-mono font-semibold text-lg">Aggregated Logs</h3>
            <p className="text-sm text-muted-foreground">Real-time logs from all containers</p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setIsPaused(!isPaused)}
              title={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused ? <Play className="w-[18px] h-[18px]" /> : <Pause className="w-[18px] h-[18px]" />}
            </Button>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={onRefresh}
              title="Refresh"
            >
              <RotateCw className="w-[18px] h-[18px]" />
            </Button>
          </div>
        </div>

        <div className="flex gap-2 mb-4 flex-wrap">
          <Badge variant="outline" className="font-mono">
            Total: {logCounts.total}
          </Badge>
          <Badge className="bg-destructive/10 text-destructive border-destructive/20 font-mono">
            Errors: {logCounts.error}
          </Badge>
          <Badge className="bg-warning/10 text-warning border-warning/20 font-mono">
            Warnings: {logCounts.warn}
          </Badge>
          <Badge className="bg-info/10 text-info border-info/20 font-mono">
            Debug: {logCounts.debug}
          </Badge>
        </div>

        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-xs font-mono text-muted-foreground font-semibold uppercase tracking-wide">Log Level:</span>
            <Button
              variant={levelFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setLevelFilter('all')}
              className="h-8 gap-1.5 font-mono"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              All
            </Button>
            <Button
              variant={levelFilter === 'info' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setLevelFilter('info')}
              className={cn(
                "h-8 gap-1.5 font-mono",
                levelFilter === 'info' && "bg-info text-info-foreground hover:bg-info/90"
              )}
            >
              <Info className="w-3.5 h-3.5" />
              Info
            </Button>
            <Button
              variant={levelFilter === 'warn' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setLevelFilter('warn')}
              className={cn(
                "h-8 gap-1.5 font-mono",
                levelFilter === 'warn' && "bg-warning text-warning-foreground hover:bg-warning/90"
              )}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Warning
            </Button>
            <Button
              variant={levelFilter === 'error' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setLevelFilter('error')}
              className={cn(
                "h-8 gap-1.5 font-mono",
                levelFilter === 'error' && "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              )}
            >
              <X className="w-3.5 h-3.5" />
              Error
            </Button>
            <Button
              variant={levelFilter === 'debug' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setLevelFilter('debug')}
              className={cn(
                "h-8 gap-1.5 font-mono",
                levelFilter === 'debug' && "bg-info text-info-foreground hover:bg-info/90"
              )}
            >
              <Bug className="w-3.5 h-3.5" />
              Debug
            </Button>
          </div>

          <div className="flex gap-2 flex-wrap">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 font-mono text-sm"
              />
            </div>
            <Select value={containerFilter} onValueChange={setContainerFilter}>
              <SelectTrigger className="w-[180px] font-mono text-sm">
                <SelectValue placeholder="Container" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Containers</SelectItem>
                {uniqueContainers.map(container => (
                  <SelectItem key={container} value={container}>
                    {container}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <ScrollArea className="h-[400px] font-mono text-xs" ref={scrollRef}>
        <div className="p-4 space-y-1">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No logs found</p>
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className={cn(
                  "flex items-start gap-3 p-2 rounded hover:bg-accent/5 transition-colors",
                  log.level === 'error' && "bg-destructive/5",
                  log.level === 'warn' && "bg-warning/5"
                )}
              >
                <Badge 
                  className={cn(
                    "shrink-0 h-6 px-2 gap-1",
                    getLevelColor(log.level)
                  )}
                >
                  {getLevelIcon(log.level)}
                  {log.level.toUpperCase()}
                </Badge>
                <span className="text-muted-foreground shrink-0 w-20">
                  {formatTimestamp(log.timestamp)}
                </span>
                <Badge variant="outline" className="shrink-0 font-mono">
                  {log.container}
                </Badge>
                <span className="text-foreground break-all">
                  {log.message}
                </span>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {isPaused && (
        <div className="absolute top-4 right-4 bg-warning text-warning-foreground px-3 py-1 rounded-full text-xs font-mono font-semibold flex items-center gap-1 shadow-lg">
          <Pause className="w-3.5 h-3.5" />
          PAUSED
        </div>
      )}
    </Card>
  )
}
