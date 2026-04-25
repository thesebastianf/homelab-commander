import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Play,
  Square,
  RotateCw,
  Plus,
  Download,
  History,
  XCircle,
  Search,
  RefreshCw,
  AlertTriangle,
  Loader2,
  Zap,
  Archive,
  AlertCircle,
  Snowflake,
  CloudDownload,
} from 'lucide-react'
import type { Stack } from '@/lib/types'
import { useSettings } from '@/hooks/useSettings'

interface MobileStacksViewProps {
  stacks: Stack[]
  selectedStackId: string | null
  onSelectStack: (stack: Stack) => void
  onDeployStack: (id: string) => void
  onStopStack: (id: string) => void
  onRestartStack: (id: string) => void
  onRecreateStack: (id: string) => void
  onDeactivateStack: (id: string) => void
  onCreateNew: () => void
  onToggleMobileMode?: () => void
  isOperating?: boolean
}

function getStatusBadgeVariant(status: Stack['status']) {
  switch (status) {
    case 'running': return 'default'
    case 'failed': return 'destructive'
    case 'deploying': return 'secondary'
    default: return 'outline'
  }
}

export function MobileStacksView({
  stacks,
  selectedStackId,
  onSelectStack,
  onDeployStack,
  onStopStack,
  onRestartStack,
  onRecreateStack,
  onDeactivateStack,
  onCreateNew,
  onToggleMobileMode,
  isOperating = false,
}: MobileStacksViewProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const { data: settings } = useSettings()

  const filteredStacks = stacks.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const stacksWithUpdates = stacks.filter(s => s.updateAvailable).length
  const updateFreezeActive = !!settings?.globalUpdateFreeze
  const autoUpdateActive = !!settings?.autoUpdate && !updateFreezeActive

  return (
    <TooltipProvider>
      <div className="h-[calc(100vh-70px)] min-h-0 flex flex-col gap-3 bg-background p-4">
        {/* Status strip — replaces duplicate THC header */}
        {(updateFreezeActive || autoUpdateActive || stacksWithUpdates > 0) && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {updateFreezeActive && (
              <Badge variant="destructive" className="gap-1 animate-pulse text-xs">
                <Snowflake className="w-3 h-3" />
                UPDATE FREEZE
              </Badge>
            )}
            {autoUpdateActive && (
              <Badge variant="secondary" className="gap-1 text-xs">
                <Zap className="w-3 h-3" />
                Auto-Update ON
              </Badge>
            )}
            {stacksWithUpdates > 0 && (
              <Badge variant="outline" className="border-warning text-warning gap-1 text-xs">
                <CloudDownload className="w-3 h-3" />
                {stacksWithUpdates} update{stacksWithUpdates !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        )}

        {/* Search */}
        <div className="relative shrink-0">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search stacks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 font-mono text-sm h-9"
          />
        </div>

        {/* New Stack Button */}
        <Button onClick={onCreateNew} className="w-full gap-2 shrink-0" size="sm">
          <Plus className="w-4 h-4" />
          New Stack
        </Button>

        {/* Stack Cards */}
        <ScrollArea className="flex-1 min-h-0 rounded-lg border">
          <div className="p-3 space-y-3">
            {filteredStacks.length === 0 ? (
              <Card className="p-6 text-center text-xs text-muted-foreground">
                <p>{searchQuery ? 'No matching stacks' : 'No stacks found'}</p>
              </Card>
            ) : (
              filteredStacks.map((stack) => {
                const running = stack.status === 'running' || stack.status === 'deploying'

                return (
                  <Card key={stack.id} className="p-4 space-y-3 border-l-4" style={{
                    borderLeftColor: running
                      ? 'var(--success)'
                      : stack.status === 'failed'
                      ? 'var(--destructive)'
                      : 'var(--border)',
                  }}>
                    {/* Stack Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-mono text-base font-bold truncate">{stack.name}</h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          {stack.services} {stack.services === 1 ? 'service' : 'services'}
                        </p>
                      </div>
                      <Badge
                        variant={getStatusBadgeVariant(stack.status)}
                        className="capitalize shrink-0 whitespace-nowrap"
                      >
                        {stack.status}
                      </Badge>
                    </div>

                    {/* Stack Metadata */}
                    <div className="flex flex-wrap gap-2 text-[11px]">
                      {stack.updateAvailable && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className="border-amber-500 text-amber-500 gap-1">
                              <RefreshCw className="w-2.5 h-2.5" />
                              Update available
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>New version available in registry</TooltipContent>
                        </Tooltip>
                      )}

                      {stack.hasHostNetworking && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className="border-orange-500 text-orange-400 gap-1">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              Host net
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>Uses host networking mode</TooltipContent>
                        </Tooltip>
                      )}

                      {stack.autoUpdate && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className="border-primary text-primary gap-1">
                              <Zap className="w-2.5 h-2.5" />
                              Auto upd
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>Auto Update enabled</TooltipContent>
                        </Tooltip>
                      )}

                      {(() => {
                        const bkpCfg = stack.backupConfig;
                        const bkpCount = stack.backupCount || 0;
                        if (!bkpCfg?.enabled && bkpCount === 0) return null;
                        
                        let colorClass = "border-border text-muted-foreground";
                        let icon = <Archive className="w-2.5 h-2.5" />;
                        let tooltipText = `Completed backups: ${bkpCount} (Automatic backups disabled)`;
                        
                        if (bkpCfg?.enabled) {
                          if (!bkpCfg.schedule) {
                            colorClass = "border-amber-500 text-amber-500";
                            icon = <Zap className="w-2.5 h-2.5" />;
                            tooltipText = "Backup enabled but NO schedule defined! Backups: " + bkpCount;
                          } else {
                            const lastDate = bkpCfg.lastBackupAt ? new Date(bkpCfg.lastBackupAt) : null;
                            const isStale = !lastDate || (Date.now() - lastDate.getTime() > 30 * 24 * 60 * 60 * 1000);
                            
                            if (isStale) {
                              colorClass = "border-yellow-400 text-yellow-400";
                              tooltipText = "Backup enabled, but last backup is older than 30 days or missing. Backups: " + bkpCount;
                            } else {
                              colorClass = "border-blue-500 text-blue-400";
                              tooltipText = "Backup active and fresh. Schedule: " + bkpCfg.schedule + ". Backups: " + bkpCount;
                            }
                          }
                        }
                        
                        return (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className={`${colorClass} gap-1`}>
                                {icon}
                                Bkp:{bkpCount}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>{tooltipText}</TooltipContent>
                          </Tooltip>
                        );
                      })()}

                      {(stack.ports || []).length > 0 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className="text-[10px] gap-1 font-mono">
                              {stack.ports!.length} ports
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent className="font-mono text-xs">
                            {stack.ports!.join(', ')}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>

                    {/* Action Buttons Grid */}
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      {running ? (
                        <>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onRestartStack(stack.id)}
                                disabled={isOperating}
                                className="gap-1 text-xs h-9 w-full"
                              >
                                <RotateCw className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Restart</span>
                                <span className="sm:hidden">Rst</span>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">docker compose restart</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onStopStack(stack.id)}
                                disabled={isOperating}
                                className="gap-1 text-xs h-9 w-full"
                              >
                                <Square className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Stop</span>
                                <span className="sm:hidden">Stp</span>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">docker compose stop</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onDeactivateStack(stack.id)}
                                disabled={isOperating}
                                className="gap-1 text-xs h-9 w-full"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Down</span>
                                <span className="sm:hidden">Dwn</span>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">docker compose down</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onRecreateStack(stack.id)}
                                disabled={isOperating}
                                className="gap-1 text-xs h-9 w-full"
                              >
                                <History className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Recreate</span>
                                <span className="sm:hidden">Rec</span>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">docker compose up -d --force-recreate</TooltipContent>
                          </Tooltip>
                        </>
                      ) : (
                        <>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                onClick={() => onDeployStack(stack.id)}
                                disabled={isOperating}
                                className="gap-1 text-xs h-9 w-full"
                              >
                                <Play className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Start</span>
                                <span className="sm:hidden">Str</span>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">docker compose up -d</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onRecreateStack(stack.id)}
                                disabled={isOperating}
                                className="gap-1 text-xs h-9 w-full"
                              >
                                <History className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Recreate</span>
                                <span className="sm:hidden">Rec</span>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">docker compose up -d --force-recreate</TooltipContent>
                          </Tooltip>
                        </>
                      )}

                      {/* Note: Update Images action available in desktop view */}
                    </div>
                  </Card>
                )
              })
            )}
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  )
}
