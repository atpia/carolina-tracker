export const MIN = 60_000
export const HOUR = 60 * MIN

export function formatDuration(ms: number) {
  const neg = ms < 0
  const total = Math.round(Math.abs(ms) / MIN)
  const h = Math.floor(total / 60)
  const m = total % 60
  const s = h > 0 ? `${h}h ${m}m` : `${m}m`
  return neg ? `-${s}` : s
}

export function formatTimer(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, "0")
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export function formatClock(iso: string | number | Date) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

/** "1:00 to 1:25 AM": the AM/PM shows once when both times share it. */
export function formatClockRange(start: string | number | Date, end: string | number | Date) {
  const a = formatClock(start)
  const b = formatClock(end)
  const suffix = a.match(/\s*[^\d\s:.]+\.?$/)?.[0]
  return suffix && b.endsWith(suffix) ? `${a.slice(0, -suffix.length)} to ${b}` : `${a} to ${b}`
}

export function formatDay(iso: string | number | Date) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return "Today"
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday"
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })
}

/** "in 1h 20m" / "1h 20m ago" */
export function relative(target: number, now: number) {
  const diff = target - now
  if (Math.abs(diff) < MIN) return "now"
  return diff > 0 ? `in ${formatDuration(diff)}` : `${formatDuration(-diff)} ago`
}

/** ISO -> "HH:mm" in local time, the value of an <input type="time">. */
export function toClockInput(iso?: string) {
  if (!iso) return ""
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Moves a time to another calendar day, keeping its clock time. With no time yet, it uses the clock time now. */
export function withDay(iso: string, day: Date) {
  const d = new Date(iso || Date.now())
  d.setFullYear(day.getFullYear(), day.getMonth(), day.getDate())
  if (!iso) d.setSeconds(0, 0)
  return d.toISOString()
}

/** Sets the clock time ("HH:mm") of a time, keeping its day. With no time yet, it uses today. */
export function withClock(iso: string, clock: string) {
  const [h, m] = clock.split(":").map(Number)
  const d = new Date(iso || Date.now())
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

export function startOfToday(now = Date.now()) {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
