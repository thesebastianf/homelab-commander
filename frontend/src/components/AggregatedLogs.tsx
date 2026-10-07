import { useState, useEffect, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { LogEntry } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Search, RotateCw, Pause, Play, AlertTriangle, Info, X, Bug, CheckCircle } from 'lucide-react'

interface AggregatedLogsProps {
  logs: LogEntry[]
  onRefresh?: () => void
  isRefreshing?: boolean
}

export function AggregatedLogs({ logs: liveLogs, onRefresh, isRefreshing }: AggregatedLogsProps) {
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>(liveLogs)
  const [searchQuery, setSearchQuery] = useState('')
  const [levelFilter, setLevelFilter] = useState<string>('warn')
  const [containerFilter, setContainerFilter] = useState<string>('all')
  const [isPaused, setIsPaused] = useState(false)
  // While paused, keep showing the snapshot taken at pause time instead of the live feed
  const [pausedLogs, setPausedLogs] = useState<LogEntry[] | null>(null)
  const logs = isPaused && pausedLogs ? pausedLogs : liveLogs
  const scrollRef = useRef<HTMLDivElement>(null)
  // Only follow new lines while the user is already at the bottom, so scrolling up to read isn't interrupted
  const stickToBottomRef = useRef(true)

  const togglePause = () => {
    if (isPaused) {
      setPausedLogs(null)
      setIsPaused(false)
    } else {
      setPausedLogs(liveLogs)
      setIsPaused(true)
    }
  }

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
    if (stickToBottomRef.current && scrollRef.current && !isPaused) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [filteredLogs, isPaused])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
  }

  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error': return 'bg-destructive/15 text-destructive border-destructive/25'
      case 'warn': return 'bg-warning/15 text-warning border-warning/25'
      case 'debug': return 'bg-info/15 text-info border-info/25'
      case 'info':
      default: return 'bg-muted text-muted-foreground border-border'
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
    <TooltipProvider delayDuration={350}>
    <Card className="card-surface p-0 overflow-hidden relative rounded-lg">
      <div className="p-4 border-b border-border">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="min-w-0">
            <h3 className="section-heading font-display text-base font-semibold uppercase tracking-[0.05em]">Aggregated logs</h3>
            <p className="text-sm text-muted-foreground">Recent output from all running containers</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isPaused && (
              <span className="mr-1 bg-warning text-warning-foreground px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold flex items-center gap-1">
                <Pause className="w-3 h-3" />
                PAUSED
              </span>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={togglePause}
                  aria-label={isPaused ? 'Resume' : 'Pause'}
                  className={cn(isPaused && 'text-warning hover:text-warning')}
                >
                  {isPaused ? <Play className="w-[18px] h-[18px]" /> : <Pause className="w-[18px] h-[18px]" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">{isPaused ? 'Resume live log streaming' : 'Pause live log streaming'}</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={onRefresh}
                  disabled={!onRefresh || isPaused}
                  aria-label="Refresh"
                >
                  <RotateCw className={cn('w-[18px] h-[18px]', isRefreshing && 'animate-spin')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">{isPaused ? 'Resume to refresh' : 'Re-fetch logs from all running containers'}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <p className="mb-3 text-xs text-muted-foreground tabular-nums">
          {logCounts.total} {logCounts.total === 1 ? 'entry' : 'entries'}
          <span className="mx-1.5">·</span>
          <span className={cn(logCounts.error > 0 && 'text-destructive')}>{logCounts.error} {logCounts.error === 1 ? 'error' : 'errors'}</span>
          <span className="mx-1.5">·</span>
          <span className={cn(logCounts.warn > 0 && 'text-warning')}>{logCounts.warn} {logCounts.warn === 1 ? 'warning' : 'warnings'}</span>
          <span className="mx-1.5">·</span>
          {logCounts.info} info
          <span className="mx-1.5">·</span>
          {logCounts.debug} debug
        </p>

        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-xs text-muted-foreground font-medium mr-1">Level</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={levelFilter === 'all' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setLevelFilter('all')}
                  data-active={levelFilter === 'all'}
                  className={cn("h-8 gap-1.5 text-muted-foreground", "data-[active=true]:text-foreground")}
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  All
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Show all log levels</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={levelFilter === 'info' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setLevelFilter('info')}
                  data-active={levelFilter === 'info'}
                  className={cn("h-8 gap-1.5 text-muted-foreground", "data-[active=true]:text-foreground")}
                >
                  <Info className="w-3.5 h-3.5" />
                  Info
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Show info, warning, and error logs</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={levelFilter === 'warn' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setLevelFilter('warn')}
                  data-active={levelFilter === 'warn'}
                  className={cn("h-8 gap-1.5 text-muted-foreground", "data-[active=true]:text-foreground")}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Warning
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Show warning and error logs only</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={levelFilter === 'error' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setLevelFilter('error')}
                  data-active={levelFilter === 'error'}
                  className={cn("h-8 gap-1.5 text-muted-foreground", "data-[active=true]:text-foreground")}
                >
                  <X className="w-3.5 h-3.5" />
                  Error
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Show only error logs</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={levelFilter === 'debug' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setLevelFilter('debug')}
                  data-active={levelFilter === 'debug'}
                  className={cn("h-8 gap-1.5 text-muted-foreground", "data-[active=true]:text-foreground")}
                >
                  <Bug className="w-3.5 h-3.5" />
                  Debug
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Show debug, info, warning, and error logs</p></TooltipContent>
            </Tooltip>
          </div>

          <div className="flex gap-2 flex-wrap">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 text-sm"
              />
            </div>
            <Select value={containerFilter} onValueChange={setContainerFilter}>
              <SelectTrigger className="w-full sm:w-[200px] text-sm">
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

      <div className="min-h-[160px] max-h-[420px] overflow-y-auto font-mono text-xs" ref={scrollRef} onScroll={handleScroll}>
        <div className="p-3 sm:p-4 space-y-1">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>{logs.length === 0 ? 'No log output yet' : 'No logs match the current filters'}</p>
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className={cn(
                  "flex flex-wrap sm:flex-nowrap items-start gap-x-3 gap-y-1.5 p-2 rounded-md hover:bg-accent/5 transition-colors",
                  log.level === 'error' && "bg-destructive/5",
                  log.level === 'warn' && "bg-warning/5"
                )}
              >
                <Badge 
                  className={cn(
                    "shrink-0 h-6 w-[4.75rem] justify-center px-2 gap-1",
                    getLevelColor(log.level)
                  )}
                >
                  {getLevelIcon(log.level)}
                  {log.level.toUpperCase()}
                </Badge>
                <span className="text-muted-foreground shrink-0 leading-6 tabular-nums">
                  {formatTimestamp(log.timestamp)}
                </span>
                <Badge variant="outline" className="shrink-0 font-mono max-w-[14rem] truncate" title={log.container}>
                  {log.container}
                </Badge>
                <span className="text-foreground break-words min-w-0 basis-full sm:basis-auto sm:flex-1 leading-6">
                  {log.message}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </Card>
    </TooltipProvider>
  )
}
