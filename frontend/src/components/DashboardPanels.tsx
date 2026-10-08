import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { AlertTriangle, ChevronRight } from 'lucide-react'

const SEGMENTS = 24

interface ResourceGaugeProps {
  label: string
  percent: number
  icon: React.ReactNode
  detail?: string
  warnAt: number
  actionLabel?: string
  onAction?: () => void
}

/** Instrument-style readout: big number plus a segmented meter that turns amber past the threshold. */
export function ResourceGauge({ label, percent, icon, detail, warnAt, actionLabel, onAction }: ResourceGaugeProps) {
  const value = Math.max(0, Math.min(100, percent))
  const warning = value > warnAt
  const lit = Math.round((value / 100) * SEGMENTS)
  const warnSegment = Math.round((warnAt / 100) * SEGMENTS)

  return (
    <Card className={cn('card-surface rounded-lg p-4', warning && 'border-warning/45')}>
      <div className="flex items-center justify-between gap-2">
        <p className="section-label">{label}</p>
        <span className={cn('[&_svg]:w-4 [&_svg]:h-4', warning ? 'text-warning' : 'text-muted-foreground/70')}>{icon}</span>
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <p className={cn('font-display text-4xl font-semibold leading-none tabular-nums', warning && 'text-warning')}>
          {value.toFixed(1)}
          <span className="ml-0.5 text-xl text-muted-foreground">%</span>
        </p>
        {detail && <p className="text-xs text-muted-foreground truncate">{detail}</p>}
      </div>

      <div className="mt-3 flex gap-[3px]" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-2.5 flex-1 rounded-[2px] transition-colors duration-500',
              i < lit
                ? i >= warnSegment ? 'bg-warning' : warning ? 'bg-warning/70' : 'bg-accent'
                : i === warnSegment ? 'bg-muted-foreground/35' : 'bg-muted'
            )}
          />
        ))}
      </div>

      <div className="mt-2 flex h-4 items-center justify-between gap-2 text-[11px]">
        {warning ? (
          <span className="flex items-center gap-1 text-warning truncate">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            Above {warnAt}%
          </span>
        ) : (
          <span className="text-muted-foreground/70 truncate">Alert at {warnAt}%</span>
        )}
        {warning && actionLabel && onAction && (
          <button
            onClick={onAction}
            className="shrink-0 font-medium text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </Card>
  )
}

interface InventoryItem {
  label: string
  value: number | string
  icon: React.ReactNode
  hint?: string
  warning?: string
  onClick?: () => void
}

interface FleetPanelProps {
  running: number
  stopped: number
  total: number
  stoppedWarning?: string
  onPrune?: () => void
  onOpenContainers?: () => void
  inventory: InventoryItem[]
}

/** Containers at a glance (running vs. stopped bar) next to the rest of the inventory. */
export function FleetPanel({ running, stopped, total, stoppedWarning, onPrune, onOpenContainers, inventory }: FleetPanelProps) {
  const runningPct = total > 0 ? (running / total) * 100 : 0

  return (
    <Card className="card-surface rounded-lg p-0 overflow-hidden">
      <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="p-4 border-b lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-2">
            <p className="section-label">Containers</p>
            {onOpenContainers && (
              <button
                onClick={onOpenContainers}
                className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                View all <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <p className="font-display text-4xl font-semibold leading-none tabular-nums">{total}</p>
            <p className="text-xs text-muted-foreground">
              <span className="text-foreground font-medium tabular-nums">{running}</span> running
              <span className="mx-1.5 text-muted-foreground/50">·</span>
              <span className="text-foreground font-medium tabular-nums">{stopped}</span> stopped
            </p>
          </div>
          <div className="mt-3 flex h-2.5 overflow-hidden rounded-[2px] bg-muted">
            <span className="bg-success transition-[width] duration-500" style={{ width: `${runningPct}%` }} />
            {stopped > 0 && <span className="ml-[3px] flex-1 bg-muted-foreground/35" />}
          </div>
          <div className="mt-2 flex h-4 items-center justify-between gap-2 text-[11px]">
            {stoppedWarning ? (
              <span className="flex items-center gap-1 text-warning truncate">
                <AlertTriangle className="w-3 h-3 shrink-0" /> {stoppedWarning}
              </span>
            ) : (
              <span className="text-muted-foreground/70">{total > 0 ? `${Math.round(runningPct)}% up` : 'Nothing deployed yet'}</span>
            )}
            {stoppedWarning && onPrune && (
              <button onClick={onPrune} className="shrink-0 font-medium text-muted-foreground hover:text-foreground hover:underline underline-offset-2">
                Prune
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4">
          {inventory.map((item, i) => {
            const Comp = item.onClick ? 'button' : 'div'
            return (
              <Comp
                key={item.label}
                onClick={item.onClick}
                className={cn(
                  'group flex flex-col items-start gap-1 p-4 text-left',
                  i % 2 === 1 && 'border-l',
                  i >= 2 && 'border-t sm:border-t-0',
                  i === 2 && 'sm:border-l',
                  item.onClick && 'hover:bg-muted/50 transition-colors'
                )}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="section-label">{item.label}</span>
                  <span className={cn('[&_svg]:w-4 [&_svg]:h-4', item.warning ? 'text-warning' : 'text-muted-foreground/60 group-hover:text-foreground transition-colors')}>
                    {item.icon}
                  </span>
                </span>
                <span className={cn('font-display text-3xl font-semibold leading-none tabular-nums', item.warning && 'text-warning')}>
                  {item.value}
                </span>
                {item.warning
                  ? <span className="text-[11px] text-warning">{item.warning}</span>
                  : item.hint && <span className="text-[11px] text-muted-foreground">{item.hint}</span>}
              </Comp>
            )
          })}
        </div>
      </div>
    </Card>
  )
}
