import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CloudDownload, Loader2, RefreshCw, Download, Layers, Box } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import * as api from '@/lib/api'
import type { Container, Stack } from '@/lib/types'

interface UpdatesPopoverProps {
  stacks: Stack[]
  containers: Container[]
  /** The badge that opens the panel */
  children: ReactNode
  align?: 'start' | 'center' | 'end'
}

/**
 * Header "N updates" badge → panel listing what can be updated.
 * Managed stacks can be updated one by one (same as the stack's Update button)
 * or all at once (same as "Update all Stacks (incl. Backup) Now").
 */
export function UpdatesPopover({ stacks, containers, children, align = 'end' }: UpdatesPopoverProps) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [updating, setUpdating] = useState<Set<string>>(new Set())
  const [updatingAll, setUpdatingAll] = useState(false)
  const pollers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())

  useEffect(() => () => { pollers.current.forEach(clearInterval) }, [])

  const { stackRows, otherContainers } = useMemo(() => {
    const outdated = containers.filter(c => c.updateAvailable)
    const byProject = new Map<string, Container[]>()
    for (const c of outdated) {
      const key = c.project?.toLowerCase() ?? ''
      byProject.set(key, [...(byProject.get(key) ?? []), c])
    }
    const rows = stacks
      .filter(s => !s.external && (s.updateAvailable || byProject.has(s.name.toLowerCase())))
      .map(s => ({ stack: s, containers: byProject.get(s.name.toLowerCase()) ?? [] }))
      .sort((a, b) => a.stack.name.localeCompare(b.stack.name))
    const managed = new Set(rows.map(r => r.stack.name.toLowerCase()))
    const other = outdated
      .filter(c => !managed.has(c.project?.toLowerCase() ?? ''))
      .sort((a, b) => a.name.localeCompare(b.name))
    return { stackRows: rows, otherContainers: other }
  }, [stacks, containers])

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['stacks'] })
    qc.invalidateQueries({ queryKey: ['containers'] })
  }

  const setStackUpdating = (id: string, on: boolean) =>
    setUpdating(prev => {
      const next = new Set(prev)
      if (on) next.add(id); else next.delete(id)
      return next
    })

  const updateOne = async (stack: Stack) => {
    setStackUpdating(stack.id, true)
    try {
      await api.updateStackImages(stack.id)
      toast.info(`Updating ${stack.name}…`)
      refresh()
      const timer = setInterval(async () => {
        try {
          const op = await api.fetchStackOperation(stack.id)
          if (op.running && !op.done) return
          clearInterval(timer)
          pollers.current.delete(stack.id)
          setStackUpdating(stack.id, false)
          if (op.error) toast.error(`Update of ${stack.name} failed: ${op.error}`)
          else toast.success(`${stack.name} updated`)
          refresh()
        } catch {
          // transient fetch error, keep polling
        }
      }, 2000)
      pollers.current.set(stack.id, timer)
    } catch (e: any) {
      setStackUpdating(stack.id, false)
      toast.error(e?.message || `Failed to update ${stack.name}`)
    }
  }

  const updateAll = async () => {
    setUpdatingAll(true)
    try {
      const result = await api.updateAllStacksNow()
      const updated = result.updated.length
      const skipped = result.skipped.length
      const failed = result.failed.length
      if (failed > 0) {
        toast.error(`Bulk update finished: ${updated} updated, ${skipped} skipped, ${failed} failed`)
      } else {
        toast.success(`Bulk update finished: ${updated} updated${skipped > 0 ? `, ${skipped} skipped` : ''}`)
      }
      qc.invalidateQueries({ queryKey: ['backupJobs'] })
    } catch (e: any) {
      toast.error(e?.message || 'Bulk update failed')
    } finally {
      setUpdatingAll(false)
      refresh()
    }
  }

  const total = stackRows.length + otherContainers.length

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
          aria-label="Show available updates"
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} sideOffset={8} collisionPadding={12} className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <CloudDownload className="w-4 h-4 text-warning shrink-0" />
            <span className="text-sm font-semibold">Available updates</span>
          </div>
          <Button
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={updateAll}
            disabled={updatingAll || stackRows.length === 0}
          >
            {updatingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Update all
          </Button>
        </div>

        {total === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">Everything is up to date.</p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <div className="p-1.5 space-y-0.5">
              {stackRows.map(({ stack, containers: outdated }) => {
                const busy = updatingAll || updating.has(stack.id) || stack.status === 'deploying'
                return (
                  <div
                    key={stack.id}
                    className="flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-muted/60"
                  >
                    <Layers className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-sm font-medium truncate">{stack.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate font-mono">
                        {describeOutdated(stack, outdated)}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn('h-7 gap-1.5 text-xs shrink-0', !busy && 'border-warning/50 text-warning hover:text-warning')}
                      onClick={() => updateOne(stack)}
                      disabled={busy}
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                      {busy ? 'Updating' : 'Update'}
                    </Button>
                  </div>
                )
              })}

              {otherContainers.length > 0 && (
                <>
                  <div className="px-2 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Not managed by THC
                  </div>
                  {otherContainers.map(c => (
                    <div key={c.id} className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
                      <Box className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-sm truncate">{c.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate font-mono">{c.image}</div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        {stackRows.length > 0 && (
          <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
            Update all runs a backup first for stacks that have backups enabled.
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** Image for single-container stacks, container names otherwise */
function describeOutdated(stack: Stack, outdated: Container[]): string {
  if (outdated.length === 0) return 'newer image available'
  if (outdated.length === 1 && outdated[0].name === stack.name) return outdated[0].image
  return outdated.map(c => c.name).join(', ')
}
