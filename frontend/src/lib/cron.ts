const DAY_NAMES: Record<number, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
}

function parseNumber(value: string): number | null {
  if (!/^\d+$/.test(value)) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function toDayNumber(value: string): number | null {
  const n = parseNumber(value)
  if (n === null) return null
  if (n === 7) return 0
  if (n < 0 || n > 6) return null
  return n
}

function parseDayList(dow: string): number[] | null {
  const days: number[] = []
  for (const part of dow.split(',')) {
    const trimmed = part.trim()
    if (!trimmed) return null

    if (trimmed.includes('-')) {
      const [fromRaw, toRaw] = trimmed.split('-')
      const from = toDayNumber(fromRaw)
      const to = toDayNumber(toRaw)
      if (from === null || to === null) return null
      if (from > to) return null
      for (let d = from; d <= to; d++) {
        if (!days.includes(d)) days.push(d)
      }
      continue
    }

    const day = toDayNumber(trimmed)
    if (day === null) return null
    if (!days.includes(day)) days.push(day)
  }

  return days.sort((a, b) => a - b)
}

export function normalizeCronExpression(cronExpr: string): string {
  return cronExpr.trim().replace(/\s+/g, ' ')
}

export function toHumanCronLabel(cronExpr: string): string {
  const normalized = normalizeCronExpression(cronExpr)
  const parts = normalized.split(' ')
  if (parts.length !== 5) return 'Invalid cron expression'

  const [minRaw, hourRaw, dom, month, dow] = parts
  const minute = parseNumber(minRaw)
  const hour = parseNumber(hourRaw)
  if (minute === null || hour === null || minute > 59 || hour > 23) {
    return 'Invalid cron expression'
  }

  const hh = String(hour).padStart(2, '0')
  const mm = String(minute).padStart(2, '0')

  if (dom === '*' && month === '*' && dow !== '*') {
    const days = parseDayList(dow)
    if (!days || days.length === 0) return 'Invalid cron expression'
    const dayNames = days.map((d) => DAY_NAMES[d])
    return `${dayNames.join(', ')} at ${hh}:${mm}`
  }

  if (dom === '*' && month === '*' && dow === '*') {
    return `Every day at ${hh}:${mm}`
  }

  if (month === '*' && dow === '*') {
    const dayOfMonth = parseNumber(dom)
    if (dayOfMonth === null || dayOfMonth < 1 || dayOfMonth > 31) return 'Invalid cron expression'
    return `Day ${dayOfMonth} of each month at ${hh}:${mm}`
  }

  return `Custom cron: ${normalized}`
}
