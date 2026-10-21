import { consumedMl } from "./derive"
import { HOUR } from "./time"
import { isBottle, type LogEvent } from "./types"

const DAY = 24 * HOUR

export interface Range {
  from: number
  to: number
  /** The range runs up to now, so stretches since the last entry are still growing. */
  live?: boolean
}

export interface Bucket {
  key: number
  label: string
  breast: number
  formula: number
  expressed: number
  bottleMl: number
  wet: number
  stool: number
}

const t = (iso: string) => new Date(iso).getTime()

function startOfDay(ms: number) {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function startOfHour(ms: number) {
  const d = new Date(ms)
  d.setMinutes(0, 0, 0)
  return d.getTime()
}

/** Hourly buckets for a day or less, daily buckets otherwise. */
export function bucketSize(range: Range) {
  return range.to - range.from <= 36 * HOUR ? "hour" : "day"
}

function makeBuckets(range: Range): Bucket[] {
  const hourly = bucketSize(range) === "hour"
  const buckets: Bucket[] = []
  let cursor = hourly ? startOfHour(range.from) : startOfDay(range.from)
  while (cursor < range.to) {
    const d = new Date(cursor)
    buckets.push({
      key: cursor,
      label: hourly
        ? d.toLocaleTimeString([], { hour: "numeric" })
        : d.toLocaleDateString([], { month: "short", day: "numeric" }),
      breast: 0,
      formula: 0,
      expressed: 0,
      bottleMl: 0,
      wet: 0,
      stool: 0,
    })
    if (hourly) cursor += HOUR
    else {
      d.setDate(d.getDate() + 1)
      cursor = d.getTime()
    }
  }
  return buckets
}

function findBucket(buckets: Bucket[], ms: number) {
  for (let i = buckets.length - 1; i >= 0; i--) if (ms >= buckets[i].key) return buckets[i]
  return undefined
}

/**
 * Longest stretch between consecutive times, plus when it started. With `until`, the stretch
 * from the last time up to then counts too, and `ongoing` says that one was the longest.
 */
function longestGap(times: number[], until?: number) {
  let best = 0
  let at: number | undefined
  let ongoing = false
  const all = until !== undefined && times.length ? [...times, until] : times
  for (let i = 1; i < all.length; i++) {
    const gap = all[i] - all[i - 1]
    if (gap > best) {
      best = gap
      at = all[i - 1]
      ongoing = until !== undefined && i === all.length - 1
    }
  }
  return { ms: best, at, ongoing }
}

/** Times of matching diapers in the range, starting with the last one before it so a gap can span the edge. */
function diaperTimes(events: LogEvent[], range: Range, kinds: string[]) {
  const times = events
    .filter((e) => e.type === "diaper" && kinds.includes(e.kind) && t(e.start) < range.to)
    .map((e) => t(e.start))
    .sort((a, b) => a - b)
  const first = times.findIndex((v) => v >= range.from)
  if (first === -1) return times.slice(-1)
  return times.slice(Math.max(0, first - 1))
}

export function analyze(events: LogEvent[], range: Range) {
  const inRange = events
    .filter((e) => t(e.start) >= range.from && t(e.start) < range.to)
    .sort((a, b) => t(a.start) - t(b.start))
  const feeds = inRange.filter((e) => e.type === "feeding")
  const diapers = inRange.filter((e) => e.type === "diaper")
  const temps = inRange.filter((e) => e.type === "temp" && e.tempC !== undefined)
  const tempValues = temps.map((e) => e.tempC!)
  const days = (range.to - range.from) / DAY

  const buckets = makeBuckets(range)
  for (const e of feeds) {
    const b = findBucket(buckets, t(e.start))
    if (!b) continue
    if (e.kind === "formula") b.formula++
    else if (e.kind === "expressed") b.expressed++
    else b.breast++
    b.bottleMl += consumedMl(e) ?? 0
  }
  for (const e of diapers) {
    const b = findBucket(buckets, t(e.start))
    if (!b) continue
    if (e.kind === "wet" || e.kind === "both") b.wet++
    if (e.kind === "stool" || e.kind === "both") b.stool++
  }
  for (const b of buckets) b.bottleMl = Math.round(b.bottleMl)

  const feedTimes = feeds.map((e) => t(e.start))
  const intervals = feedTimes.slice(1).map((v, i) => v - feedTimes[i])
  const breast = feeds.filter((e) => !isBottle(e.kind))
  const bottles = feeds.filter((e) => isBottle(e.kind))
  const durations = breast
    .filter((e) => e.end)
    .map((e) => t(e.end!) - t(e.start))
    .filter((d) => d > 0)
  const ratings = breast.map((e) => e.confidence).filter((c): c is number => !!c)
  const bottleMl = bottles.reduce((sum, e) => sum + (consumedMl(e) ?? 0), 0)

  const wet = diapers.filter((e) => e.kind === "wet" || e.kind === "both")
  const stool = diapers.filter((e) => e.kind === "stool" || e.kind === "both")
  // A range that ends now also counts the stretch since the last diaper, which is still growing.
  const until = range.live ? range.to : undefined
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined)

  return {
    days,
    buckets,
    feeds,
    diapers,
    temps,
    temp: {
      count: temps.length,
      highest: temps.length ? temps.reduce((a, b) => (b.tempC! > a.tempC! ? b : a)) : undefined,
      lowest: temps.length ? temps.reduce((a, b) => (b.tempC! < a.tempC! ? b : a)) : undefined,
      avgC: avg(tempValues),
    },
    feeding: {
      count: feeds.length,
      perDay: feeds.length / days,
      avgInterval: avg(intervals),
      longestGap: longestGap(feedTimes),
      breastCount: breast.length,
      bottleCount: bottles.length,
      avgBreastMs: avg(durations),
      avgConfidence: avg(ratings),
      bottleMl,
      bottleMlPerDay: bottleMl / days,
      avgBottleMl: avg(bottles.map((e) => consumedMl(e)).filter((v): v is number => v !== undefined)),
    },
    diaper: {
      wet: wet.length,
      wetPerDay: wet.length / days,
      stool: stool.length,
      stoolPerDay: stool.length / days,
      longestWithoutStool: longestGap(diaperTimes(events, range, ["stool", "both"]), until),
      longestWithoutWet: longestGap(diaperTimes(events, range, ["wet", "both"]), until),
    },
  }
}

export type Analysis = ReturnType<typeof analyze>
