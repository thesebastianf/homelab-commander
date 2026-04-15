import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

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
}

export function MetricCard({ label, value, icon, trend, className, pulse }: MetricCardProps) {
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
