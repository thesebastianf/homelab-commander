import { useQuery } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Loader2, Bell } from 'lucide-react'
import * as api from '@/lib/api'
import type { NotificationLogEntry } from '@/lib/types'

interface NotificationLogDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function levelVariant(level?: string): 'default' | 'destructive' | 'outline' | 'secondary' {
  if (level === 'error') return 'destructive'
  if (level === 'warning') return 'outline'
  return 'secondary'
}

function formatEventType(eventType: string): string {
  return eventType
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim()
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function NotificationLogDialog({ open, onOpenChange }: NotificationLogDialogProps) {
  const logQuery = useQuery<NotificationLogEntry[]>({
    queryKey: ['notificationLog'],
    queryFn: () => api.fetchNotificationLog(200),
    enabled: open,
    staleTime: 30_000,
  })

  const entries = logQuery.data ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] sm:max-w-3xl max-h-[82vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            Notification History
          </DialogTitle>
          <DialogDescription>
            Recent notifications sent to your configured channels
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1 mt-2">
          {logQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading...</span>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <Bell className="w-8 h-8 opacity-30" />
              <p className="text-sm">No notifications sent yet.</p>
              <p className="text-xs opacity-60">Notifications appear here once they are dispatched to a provider.</p>
            </div>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-border bg-card p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant={levelVariant(entry.details?.level)} className="text-[10px] shrink-0">
                      {entry.details?.level ?? 'info'}
                    </Badge>
                    <span className="font-medium text-sm truncate">{entry.details?.title ?? formatEventType(entry.eventType)}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[10px] font-mono">{entry.channel}</Badge>
                    {entry.details?.serviceType && (
                      <Badge variant="secondary" className="text-[10px] capitalize">{entry.details.serviceType}</Badge>
                    )}
                  </div>
                </div>
                {entry.details?.message && (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-3">{entry.details.message}</p>
                )}
                <p className="text-[10px] text-muted-foreground/60 font-mono">{formatDate(entry.createdAt)}</p>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
