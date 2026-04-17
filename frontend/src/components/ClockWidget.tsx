import { useState, useEffect, useRef } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Clock, Globe } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'

const TZ_KEY = 'hlc_timezone'

// Curated list of common IANA timezones grouped by region
const TIMEZONE_GROUPS: { region: string; zones: string[] }[] = [
  {
    region: 'UTC',
    zones: ['UTC'],
  },
  {
    region: 'Europe',
    zones: [
      'Europe/London',
      'Europe/Berlin',
      'Europe/Paris',
      'Europe/Amsterdam',
      'Europe/Brussels',
      'Europe/Vienna',
      'Europe/Zurich',
      'Europe/Rome',
      'Europe/Madrid',
      'Europe/Lisbon',
      'Europe/Warsaw',
      'Europe/Prague',
      'Europe/Budapest',
      'Europe/Bucharest',
      'Europe/Athens',
      'Europe/Helsinki',
      'Europe/Stockholm',
      'Europe/Oslo',
      'Europe/Copenhagen',
      'Europe/Moscow',
      'Europe/Kiev',
    ],
  },
  {
    region: 'Americas',
    zones: [
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'America/Phoenix',
      'America/Anchorage',
      'Pacific/Honolulu',
      'America/Toronto',
      'America/Vancouver',
      'America/Mexico_City',
      'America/Bogota',
      'America/Lima',
      'America/Santiago',
      'America/Sao_Paulo',
      'America/Argentina/Buenos_Aires',
      'America/Caracas',
    ],
  },
  {
    region: 'Asia / Pacific',
    zones: [
      'Asia/Dubai',
      'Asia/Karachi',
      'Asia/Kolkata',
      'Asia/Dhaka',
      'Asia/Bangkok',
      'Asia/Singapore',
      'Asia/Shanghai',
      'Asia/Tokyo',
      'Asia/Seoul',
      'Asia/Taipei',
      'Asia/Jakarta',
      'Asia/Hong_Kong',
      'Asia/Riyadh',
      'Asia/Tehran',
      'Asia/Almaty',
      'Australia/Sydney',
      'Australia/Melbourne',
      'Australia/Perth',
      'Pacific/Auckland',
      'Pacific/Fiji',
    ],
  },
  {
    region: 'Africa',
    zones: [
      'Africa/Cairo',
      'Africa/Johannesburg',
      'Africa/Nairobi',
      'Africa/Lagos',
      'Africa/Casablanca',
    ],
  },
]

const ALL_ZONES = TIMEZONE_GROUPS.flatMap((g) => g.zones)

function getOffset(tz: string): string {
  try {
    const now = new Date()
    const utcMs = now.getTime()
    const local = new Date(now.toLocaleString('en-US', { timeZone: tz }))
    const diff = Math.round((local.getTime() - utcMs) / 60000)
    const sign = diff >= 0 ? '+' : '-'
    const abs = Math.abs(diff)
    const h = String(Math.floor(abs / 60)).padStart(2, '0')
    const m = String(abs % 60).padStart(2, '0')
    return `UTC${sign}${h}:${m}`
  } catch {
    return ''
  }
}

function formatTime(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

function formatDate(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function tzLabel(tz: string): string {
  return tz.replace(/_/g, ' ').replace(/\//g, ' / ')
}

export function ClockWidget() {
  const [now, setNow] = useState(new Date())
  const [userTz, setUserTz] = useState<string>(
    () => localStorage.getItem(TZ_KEY) ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  )
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    intervalRef.current = setInterval(() => setNow(new Date()), 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  const selectTz = (tz: string) => {
    setUserTz(tz)
    localStorage.setItem(TZ_KEY, tz)
    setOpen(false)
    setSearch('')
  }

  const filteredZones = search.trim()
    ? ALL_ZONES.filter((z) =>
        z.toLowerCase().includes(search.toLowerCase()) ||
        tzLabel(z).toLowerCase().includes(search.toLowerCase())
      )
    : null // null = show grouped

  const userTime = formatTime(now, userTz)
  const userDate = formatDate(now, userTz)
  const utcTime = formatTime(now, 'UTC')
  const utcDate = formatDate(now, 'UTC')
  const userOffset = getOffset(userTz)
  const isSameAsUtc = userTz === 'UTC'

  return (
    <div className="flex items-center gap-3">
      {/* UTC clock — always visible */}
      {!isSameAsUtc && (
        <div className="hidden sm:flex flex-col items-end leading-none">
          <span className="text-[9px] font-mono text-muted-foreground/60 uppercase tracking-wider">UTC</span>
          <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
            {utcDate} {utcTime}
          </span>
        </div>
      )}

      {/* User timezone clock — clicking opens picker */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/40 bg-muted/20 hover:bg-muted/40 hover:border-primary/30 transition-colors cursor-pointer group"
            title="Click to change timezone"
          >
            <Clock className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors" />
            <div className="flex flex-col items-start leading-none">
              <span className="text-[9px] font-mono text-muted-foreground/70 uppercase tracking-wider">
                {userOffset} · {tzLabel(userTz).split(' / ').pop()}
              </span>
              <span className="text-[11px] font-mono tabular-nums">
                {userDate} {userTime}
              </span>
            </div>
          </button>
        </PopoverTrigger>

        <PopoverContent className="w-72 p-3 space-y-2" align="end">
          <div className="flex items-center gap-2 mb-1">
            <Globe className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold">Select Timezone</span>
          </div>

          <div className="text-[10px] text-muted-foreground bg-muted/30 rounded px-2 py-1.5 font-mono">
            All cron schedules (backups, auto-update) run in <strong>server time</strong> (UTC unless the container TZ is set). Your selected timezone is for display only.
          </div>

          <Input
            className="h-7 text-xs"
            placeholder="Search timezone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />

          <ScrollArea className="h-52">
            <div className="space-y-0.5 pr-2">
              {filteredZones
                ? filteredZones.map((tz) => (
                    <TzRow key={tz} tz={tz} selected={tz === userTz} onSelect={selectTz} now={now} />
                  ))
                : TIMEZONE_GROUPS.map((g) => (
                    <div key={g.region}>
                      <p className="text-[9px] font-mono text-muted-foreground/60 uppercase tracking-wider px-1 pt-2 pb-0.5">
                        {g.region}
                      </p>
                      {g.zones.map((tz) => (
                        <TzRow key={tz} tz={tz} selected={tz === userTz} onSelect={selectTz} now={now} />
                      ))}
                    </div>
                  ))}
            </div>
          </ScrollArea>

          {userTz !== 'UTC' && (
            <div className="pt-1 border-t border-border/40 flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
              <span>UTC now:</span>
              <Badge variant="outline" className="text-[9px] font-mono">{utcDate} {utcTime}</Badge>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}

function TzRow({ tz, selected, onSelect, now }: { tz: string; selected: boolean; onSelect: (tz: string) => void; now: Date }) {
  const time = formatTime(now, tz)
  const offset = getOffset(tz)
  return (
    <button
      type="button"
      onClick={() => onSelect(tz)}
      className={`w-full flex items-center justify-between px-2 py-1 text-xs rounded hover:bg-muted/50 transition-colors text-left ${
        selected ? 'bg-primary/10 text-primary' : 'text-foreground/80'
      }`}
    >
      <span className="font-mono truncate">{tzLabel(tz)}</span>
      <span className={`font-mono tabular-nums text-[10px] shrink-0 ml-2 ${selected ? 'text-primary' : 'text-muted-foreground'}`}>
        {offset} · {time}
      </span>
    </button>
  )
}
