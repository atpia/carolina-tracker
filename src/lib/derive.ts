import { HOUR, MIN, startOfToday } from "./time"
import {
  DAILY_KINDS,
  isBottle,
  isPainMed,
  type DailyKind,
  type LogEvent,
  type PainMedKind,
  type Settings,
} from "./types"

const t = (iso: string) => new Date(iso).getTime()

/** A feeding timer running this long was probably never stopped. */
export const STALE_TIMER_MS = 3 * HOUR

/** How much of a bottle she actually drank, in ml. */
export function consumedMl(e: LogEvent): number | undefined {
  if (!isBottle(e.kind) || e.amountStartMl === undefined) return undefined
  if (e.amountEndMl !== undefined) return Math.max(0, e.amountStartMl - e.amountEndMl)
  if (e.percent !== undefined) return (e.amountStartMl * e.percent) / 100
  return undefined
}

/**
 * When a running breastfeed passes the per-side limit. A "both sides" feed gets the limit for each side:
 * a nudge to switch at one limit, and the warning at two.
 */
export function breastLimit(e: LogEvent, settings: Settings): { switchAt?: number; overAt?: number } {
  const limit = settings.breastLimitMin * MIN
  if (!(limit > 0) || isBottle(e.kind)) return {}
  const start = t(e.start)
  return e.kind === "both" ? { switchAt: start + limit, overAt: start + 2 * limit } : { overAt: start + limit }
}

function latest(events: LogEvent[], pred: (e: LogEvent) => boolean) {
  let best: LogEvent | undefined
  for (const e of events) {
    if (pred(e) && (!best || t(e.start) > t(best.start))) best = e
  }
  return best
}

/** Everything the home screen shows, as of `now`. Pass a ticking clock so it keeps up without new data. */
export function deriveStatus(events: LogEvent[], settings: Settings, now = Date.now()) {
  // Every feed without a finish time, newest first. Two caregivers can each have a timer going.
  const activeFeeds = events
    .filter((e) => e.type === "feeding" && !e.end)
    .sort((a, b) => t(b.start) - t(a.start))
    // A timer this old was almost certainly never stopped, so the app asks about it instead of counting on.
    .map((event) => ({ event, stale: now - t(event.start) >= STALE_TIMER_MS, ...breastLimit(event, settings) }))
  const lastFeed = latest(events, (e) => e.type === "feeding")
  // The latest feed is still going (and not a forgotten timer), so there is no countdown yet.
  const feedRunning = activeFeeds.some((a) => !a.stale && a.event.id === lastFeed?.id)
  const lastSide = latest(events, (e) => e.type === "feeding" && (e.kind === "left" || e.kind === "right"))
  const lastChange = latest(events, (e) => e.type === "diaper" && e.kind !== "dry")
  const lastCheck = latest(events, (e) => e.type === "diaper")
  const lastWet = latest(events, (e) => e.type === "diaper" && (e.kind === "wet" || e.kind === "both"))
  const lastStool = latest(events, (e) => e.type === "diaper" && (e.kind === "stool" || e.kind === "both"))
  const lastMed = latest(events, (e) => e.type === "med" && isPainMed(e.kind))
  const lastIbuprofen = latest(events, (e) => e.type === "med" && e.kind === "ibuprofen")
  const lastTylenol = latest(events, (e) => e.type === "med" && e.kind === "tylenol")

  // The countdown runs from when the last feed ended, or its start while it is still going.
  const feedEndedAt = lastFeed ? t(lastFeed.end ?? lastFeed.start) : undefined
  const feedFrom = feedEndedAt !== undefined ? feedEndedAt + settings.feedMinH * HOUR : undefined
  const feedBy = feedEndedAt !== undefined ? feedEndedAt + settings.feedMaxH * HOUR : undefined
  // A change starts a longer wait; a clean check only pushes the next check out a little.
  const nextCheck = lastCheck
    ? t(lastCheck.start) + (lastCheck.kind === "dry" ? settings.diaperAfterCleanH : settings.diaperAfterChangeH) * HOUR
    : undefined
  const nextMedKind: PainMedKind = lastMed?.kind === "ibuprofen" ? "tylenol" : "ibuprofen"
  const nextMedAt = lastMed ? t(lastMed.start) + settings.medIntervalH * HOUR : undefined
  // Alternating means each medicine comes around every other dose.
  const sameMedGap = 2 * settings.medIntervalH * HOUR
  const medDay = events.filter((e) => e.type === "med" && now - t(e.start) < 24 * HOUR)
  const meds = Object.fromEntries(
    (["ibuprofen", "tylenol"] as PainMedKind[]).map((kind) => {
      const last = kind === "ibuprofen" ? lastIbuprofen : lastTylenol
      const doses = medDay.filter((e) => e.kind === kind)
      const mg = doses.reduce((sum, e) => sum + (e.doseMg ?? 0), 0)
      return [kind, { last, nextAt: last ? t(last.start) + sameMedGap : undefined, doses24h: doses.length, mg24h: mg }]
    }),
  ) as Record<PainMedKind, { last?: LogEvent; nextAt?: number; doses24h: number; mg24h: number }>

  const since = startOfToday(now)
  const today = events.filter((e) => t(e.start) >= since)
  const feeds = today.filter((e) => e.type === "feeding")
  const diapers = today.filter((e) => e.type === "diaper")
  // Once-a-day items only ask whether today's has been taken.
  const daily = Object.fromEntries(
    DAILY_KINDS.map((kind) => [kind, latest(today, (e) => e.type === "med" && e.kind === kind)]),
  ) as Record<DailyKind, LogEvent | undefined>
  const lastTemp = latest(events, (e) => e.type === "temp" && e.tempC !== undefined)
  const bottleMl = feeds.reduce((sum, e) => sum + (consumedMl(e) ?? 0), 0)

  return {
    activeFeeds,
    breastLimitMin: settings.breastLimitMin,
    feedRunning,
    lastSide,
    lastFeed,
    feedEndedAt,
    feedFrom,
    feedBy,
    lastChange,
    lastCheck,
    lastWet,
    lastStool,
    nextCheck,
    lastMed,
    lastIbuprofen,
    lastTylenol,
    nextMedKind,
    nextMedAt,
    meds,
    daily,
    lastTemp,
    targets: { feeds: settings.targetFeedsPerDay, wet: settings.targetWetPerDay },
    today: {
      feeds: feeds.length,
      bottleMl,
      wet: diapers.filter((e) => e.kind === "wet" || e.kind === "both").length,
      stool: diapers.filter((e) => e.kind === "stool" || e.kind === "both").length,
    },
  }
}

export type Status = ReturnType<typeof deriveStatus>
