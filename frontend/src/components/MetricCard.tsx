import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { AlertTriangle } from 'lucide-react'

interface MetricCardProps {
  label: string
  value: string | number
  icon: React.ReactNode
  trend?: {
    value: number
    isPositive: boolean
  }
  className?: string
  pulse?: boolean
  compact?: boolean
  warning?: boolean
  warningText?: string
  actionLabel?: string
  onAction?: () => void
}

export function MetricCard({ label, value, icon, trend, className, pulse, compact, warning, warningText, actionLabel, onAction }: MetricCardProps) {
  if (compact) {
    return (
      <Card className={cn(
        "card-surface lift relative p-3 overflow-hidden rounded-xl group",
        warning && "border-warning/50 bg-warning/[0.05]",
        className
      )}>
        {/* gradient top bar */}
        <span className={cn(
          "absolute inset-x-0 top-0 h-[2px] opacity-60 group-hover:opacity-100 transition-opacity",
          warning ? "bg-warning" : "brand-grad"
        )} />
        <div className="flex items-center gap-2.5">
          <div className={cn(
            "p-1.5 rounded-lg shrink-0 transition-transform group-hover:scale-105",
            warning ? "bg-warning/15 text-warning" : "brand-grad text-primary-foreground shadow-md shadow-accent/15",
            pulse && "animate-pulse-glow"
          )}>
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-[0.12em] truncate">{label}</p>
            <p className={cn("text-lg font-bold font-mono tabular-nums leading-tight", warning && "text-warning")}>
              {value}
            </p>
          </div>
          {warning && (
            <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />
          )}
        </div>
        {warning && (warningText || actionLabel) && (
          <div className="mt-2 flex items-center justify-between gap-1">
            {warningText && (
              <p className="text-[10px] text-warning/80 font-mono truncate flex-1">{warningText}</p>
            )}
            {actionLabel && onAction && (
              <button
                onClick={onAction}
                className="shrink-0 text-[10px] font-medium text-warning border border-warning/40 hover:border-warning hover:bg-warning/10 rounded-md px-2 py-0.5 transition-colors"
              >
                {actionLabel}
              </button>
            )}
          </div>
        )}
        {trend && (
          <span className={cn("text-xs font-mono", trend.isPositive ? 'text-success' : 'text-destructive')}>
            {trend.isPositive ? '↑' : '↓'}{Math.abs(trend.value)}%
          </span>
        )}
      </Card>
    )
  }

  return (
    <Card className={cn("card-surface lift p-5 sm:p-6 relative overflow-hidden group rounded-xl", className)}>
      {/* gradient top bar */}
      <span className="absolute inset-x-0 top-0 h-[2px] brand-grad opacity-70 group-hover:opacity-100 transition-opacity" />
      {/* decorative corner glow */}
      <div className="pointer-events-none absolute -top-16 -right-16 w-48 h-48 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500"
           style={{ background: 'radial-gradient(circle, color-mix(in oklch, var(--accent) 18%, transparent) 0%, transparent 70%)' }} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="space-y-1.5 min-w-0">
          <p className="text-[10px] text-muted-foreground font-medium tracking-[0.14em] uppercase">{label}</p>
          <p className="text-2xl sm:text-3xl font-bold font-mono tabular-nums truncate">{value}</p>
          {trend && (
            <div className="flex items-center gap-1 text-xs">
              <span className={trend.isPositive ? 'text-success' : 'text-destructive'}>
                {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
              </span>
              <span className="text-muted-foreground">vs last hour</span>
            </div>
          )}
        </div>
        <div className={cn(
          "p-2.5 rounded-xl brand-grad text-primary-foreground shadow-lg shadow-accent/20 transition-transform duration-200 group-hover:scale-105 shrink-0",
          pulse && "animate-pulse-glow"
        )}>
          {icon}
        </div>
      </div>
    </Card>
  )
}
