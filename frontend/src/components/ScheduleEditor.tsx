import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export const SCHEDULE_PRESETS = [
  { label: 'Every Wednesday at 22:00', value: '0 22 * * 3' },
  { label: 'Every Sunday at 22:00', value: '0 22 * * 0' },
  { label: 'Every 1st of Month at 22:00', value: '0 22 1 * *' },
  { label: 'Custom…', value: '__custom__' },
] as const

const DOW = [
  { label: 'Mo', value: 1 },
  { label: 'Tu', value: 2 },
  { label: 'We', value: 3 },
  { label: 'Th', value: 4 },
  { label: 'Fr', value: 5 },
  { label: 'Sa', value: 6 },
  { label: 'Su', value: 0 },
]

/** Parse `{m} {h} * * {dayList}` → { days, hour, minute } or null */
export function parseCustomCron(cron: string): { days: number[]; hour: number; minute: number } | null {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const [min, hour, dom, month, dow] = parts
  if (dom !== '*' || month !== '*' || dow === '*') return null
  const minute = parseInt(min, 10)
  const h = parseInt(hour, 10)
  if (isNaN(minute) || isNaN(h)) return null
  const days: number[] = []
  for (const part of dow.split(',')) {
    if (part.includes('-')) {
      const [from, to] = part.split('-').map(Number)
      if (Number.isNaN(from) || Number.isNaN(to) || from < 0 || to > 7 || from > to) return null
      for (let d = from; d <= to; d++) {
        const normalized = d === 7 ? 0 : d
        if (!days.includes(normalized)) days.push(normalized)
      }
    } else {
      const d = parseInt(part, 10)
      if (Number.isNaN(d) || d < 0 || d > 7) return null
      const normalized = d === 7 ? 0 : d
      if (!days.includes(normalized)) days.push(normalized)
    }
  }
  if (days.length === 0) return null
  return { days, hour: h, minute }
}

export function buildCron(days: number[], hour: number, minute: number): string {
  // Never emit wildcard for custom weekdays; keep at least one selected day.
  const dayStr = (days.length > 0 ? days : [1]).join(',')
  return `${minute} ${hour} * * ${dayStr}`
}

interface ScheduleEditorProps {
  value: string
  onChange: (cron: string) => void
}

export function ScheduleEditor({ value, onChange }: ScheduleEditorProps) {
  const isPreset = SCHEDULE_PRESETS.some((p) => p.value !== '__custom__' && p.value === value)
  const parsedInit = !isPreset ? parseCustomCron(value) : null

  const [customDays, setCustomDays] = useState<number[]>(() => parsedInit?.days ?? [1, 2, 3, 4, 5])
  const [customHour, setCustomHour] = useState(() => parsedInit?.hour ?? 2)
  const [customMinute, setCustomMinute] = useState(() => parsedInit?.minute ?? 0)

  const isCustomMode = !isPreset

  const updateCustom = (days: number[], hour: number, minute: number) => {
    onChange(buildCron(days, hour, minute))
  }

  const handleSelectChange = (v: string) => {
    if (v === '__custom__') {
      onChange(buildCron(customDays, customHour, customMinute))
    } else {
      onChange(v)
    }
  }

  const toggleDay = (day: number) => {
    // Prevent empty day selection; this avoids generating a non-parseable custom state.
    if (customDays.includes(day) && customDays.length === 1) {
      return
    }
    const next = customDays.includes(day)
      ? customDays.filter((d) => d !== day)
      : [...customDays, day]
    setCustomDays(next)
    updateCustom(next, customHour, customMinute)
  }

  const selectValue = isPreset ? value : '__custom__'

  return (
    <div className="space-y-2">
      <Select value={selectValue} onValueChange={handleSelectChange}>
        <SelectTrigger className="h-8 text-xs font-mono">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SCHEDULE_PRESETS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isCustomMode && (
        <div className="space-y-2 border-l-2 border-primary/30 pl-3 pt-1">
          {/* Day toggles */}
          <div className="flex gap-1 flex-wrap">
            {DOW.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => toggleDay(d.value)}
                className={`px-2 py-1 text-[10px] font-mono rounded border transition-colors ${
                  customDays.includes(d.value)
                    ? 'bg-primary/20 border-primary/50 text-primary'
                    : 'border-border/40 text-muted-foreground hover:border-primary/30'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          {/* Time picker */}
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground">Time:</Label>
            <Input
              type="number"
              min={0}
              max={23}
              className="h-7 w-14 text-xs font-mono text-center"
              value={customHour}
              onChange={(e) => {
                const h = Math.min(23, Math.max(0, parseInt(e.target.value) || 0))
                setCustomHour(h)
                updateCustom(customDays, h, customMinute)
              }}
            />
            <span className="text-muted-foreground text-sm">:</span>
            <Input
              type="number"
              min={0}
              max={59}
              className="h-7 w-14 text-xs font-mono text-center"
              value={String(customMinute).padStart(2, '0')}
              onChange={(e) => {
                const m = Math.min(59, Math.max(0, parseInt(e.target.value) || 0))
                setCustomMinute(m)
                updateCustom(customDays, customHour, m)
              }}
            />
          </div>

          <p className="text-[10px] font-mono text-muted-foreground">
            Cron: <code className="text-primary/80">{buildCron(customDays, customHour, customMinute)}</code>
          </p>
        </div>
      )}
    </div>
  )
}
