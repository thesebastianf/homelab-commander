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
        "card-surface relative px-3.5 py-3 rounded-lg",
        warning && "border-warning/40",
        className
      )}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground font-medium truncate">{label}</p>
          <span className={cn("shrink-0 [&_svg]:w-4 [&_svg]:h-4", warning ? "text-warning" : "text-muted-foreground/70", pulse && "text-success")}>
            {icon}
          </span>
        </div>
        <p className={cn("mt-1 text-xl font-semibold tabular-nums tracking-tight leading-tight", warning && "text-warning")}>
          {value}
        </p>
        {warning && (warningText || actionLabel) && (
          <div className="mt-1.5 flex items-center justify-between gap-2">
            {warningText && (
              <p className="flex items-center gap-1 text-[11px] text-warning truncate">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                {warningText}
              </p>
            )}
            {actionLabel && onAction && (
              <button
                onClick={onAction}
                className="shrink-0 text-[11px] font-medium text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors"
              >
                {actionLabel}
              </button>
            )}
          </div>
        )}
        {trend && (
          <span className={cn("text-xs", trend.isPositive ? 'text-success' : 'text-destructive')}>
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
