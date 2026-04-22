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
        "p-3 relative overflow-hidden hover:shadow-md transition-all duration-200",
        warning && "border-warning/50 bg-warning/[0.04]",
        className
      )}>
        <div className="flex items-center gap-2.5">
          <div className={cn(
            "p-1.5 rounded-lg bg-primary/10 text-primary shrink-0",
            warning && "bg-warning/15 text-warning",
            pulse && "animate-pulse-glow"
          )}>
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider truncate">{label}</p>
            <p className={cn("text-base font-bold font-mono tabular-nums leading-tight", warning && "text-warning")}>
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
              <p className="text-[10px] text-warning/70 font-mono truncate flex-1">{warningText}</p>
            )}
            {actionLabel && onAction && (
              <button
                onClick={onAction}
                className="shrink-0 text-[10px] font-mono text-warning border border-warning/40 hover:border-warning hover:bg-warning/10 rounded px-1.5 py-0.5 transition-colors"
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
    <Card className={cn("p-6 relative overflow-hidden group hover:shadow-lg transition-all duration-200", className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground font-medium tracking-wide uppercase">{label}</p>
          <p className="text-3xl font-bold font-mono tabular-nums">{value}</p>
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
          "p-3 rounded-lg bg-primary/10 text-primary transition-all duration-200 group-hover:scale-110",
          pulse && "animate-pulse-glow"
        )}>
          {icon}
        </div>
      </div>
      <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
    </Card>
  )
}
