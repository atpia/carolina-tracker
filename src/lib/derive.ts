import { HOUR, startOfToday } from "./time"
import { isBottle, type LogEvent, type MedKind, type Settings } from "./types"

const t = (iso: string) => new Date(iso).getTime()

/** How much of a bottle she actually drank, in ml. */
export function consumedMl(e: LogEvent): number | undefined {
  if (!isBottle(e.kind) || e.amountStartMl === undefined) return undefined
  if (e.amountEndMl !== undefined) return Math.max(0, e.amountStartMl - e.amountEndMl)
  if (e.percent !== undefined) return (e.amountStartMl * e.percent) / 100
  return undefined
}

function latest(events: LogEvent[], pred: (e: LogEvent) => boolean) {
  let best: LogEvent | undefined
  for (const e of events) {
    if (pred(e) && (!best || t(e.start) > t(best.start))) best = e
  }
  return best
}

export function deriveStatus(events: LogEvent[], settings: Settings) {
  const now = Date.now()
  const activeFeed = latest(events, (e) => e.type === "feeding" && !e.end && now - t(e.start) < 3 * HOUR)
  const lastFeed = latest(events, (e) => e.type === "feeding")
  const lastChange = latest(events, (e) => e.type === "diaper" && e.kind !== "dry")
  const lastCheck = latest(events, (e) => e.type === "diaper")
  const lastMed = latest(events, (e) => e.type === "med")
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
  const nextMedKind: MedKind = lastMed?.kind === "ibuprofen" ? "tylenol" : "ibuprofen"
  const nextMedAt = lastMed ? t(lastMed.start) + settings.medIntervalH * HOUR : undefined

  const since = startOfToday()
  const today = events.filter((e) => t(e.start) >= since)
  const feeds = today.filter((e) => e.type === "feeding")
  const diapers = today.filter((e) => e.type === "diaper")
  const bottleMl = feeds.reduce((sum, e) => sum + (consumedMl(e) ?? 0), 0)

  return {
    activeFeed,
    lastFeed,
    feedEndedAt,
    feedFrom,
    feedBy,
    lastChange,
    lastCheck,
    nextCheck,
    lastMed,
    lastIbuprofen,
    lastTylenol,
    nextMedKind,
    nextMedAt,
    today: {
      feeds: feeds.length,
      bottleMl,
      wet: diapers.filter((e) => e.kind === "wet" || e.kind === "both").length,
      stool: diapers.filter((e) => e.kind === "stool" || e.kind === "both").length,
    },
  }
}

export type Status = ReturnType<typeof deriveStatus>
