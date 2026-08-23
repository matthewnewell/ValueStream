// The backend stores/accepts seconds only. Unit conversion is a pure frontend display
// concern — no `unit` field ever crosses the API boundary. This is the single source of
// truth for the seconds <-> display-unit boundary; every numeric time field should route
// through DurationInput / formatDuration rather than reimplementing conversion locally.

export type DurationUnit = 'sec' | 'min' | 'hr' | 'day' | 'week'

export const UNIT_SECONDS: Record<DurationUnit, number> = {
  sec: 1,
  min: 60,
  hr: 3600,
  day: 86400,
  week: 604800,
}

export const UNIT_LABELS: Record<DurationUnit, string> = {
  sec: 'sec',
  min: 'min',
  hr: 'hr',
  day: 'day',
  week: 'wk',
}

export function toSeconds(value: number, unit: DurationUnit): number {
  return value * UNIT_SECONDS[unit]
}

export function fromSeconds(seconds: number, unit: DurationUnit): number {
  return seconds / UNIT_SECONDS[unit]
}

/** Picks the largest unit that keeps the value >= 1, for readable auto-formatting. */
export function bestUnit(seconds: number): DurationUnit {
  if (seconds >= UNIT_SECONDS.week) return 'week'
  if (seconds >= UNIT_SECONDS.day) return 'day'
  if (seconds >= UNIT_SECONDS.hr) return 'hr'
  if (seconds >= UNIT_SECONDS.min) return 'min'
  return 'sec'
}

/** Human-readable auto-scaled duration, e.g. "3.5 days", "45 min", "0 sec". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '—'
  if (seconds === 0) return '0 sec'
  const unit = bestUnit(seconds)
  const value = fromSeconds(seconds, unit)
  const rounded = Math.round(value * 100) / 100
  return `${rounded} ${UNIT_LABELS[unit]}${rounded !== 1 ? (unit === 'hr' ? 's' : unit === 'day' ? 's' : unit === 'week' ? 's' : unit === 'min' ? '' : 's') : ''}`
}

/** Compact form for tight UI (chips, badges), e.g. "3.5d", "45m". */
export function formatDurationCompact(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '—'
  if (seconds === 0) return '0s'
  const unit = bestUnit(seconds)
  const value = Math.round(fromSeconds(seconds, unit) * 10) / 10
  const suffix = { sec: 's', min: 'm', hr: 'h', day: 'd', week: 'w' }[unit]
  return `${value}${suffix}`
}
