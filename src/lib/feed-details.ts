/**
 * Feeds stopped without saying how they went: by Siri or a widget (the Sheet's quick action), the notification's
 * Stop button, or the app's own one-tap shortcut. The app asks about them the next time it's opened. Stopping a feed
 * in the app opens its form, so those count as asked already.
 */
import { isBottle, type LogEvent } from "./types"

/** What a finished feed is missing: a 1 to 5 score for the breast; for a bottle, a percent drunk or an amount. */
export type DetailsNeed = "rating" | "percent" | "amount"

const ASK_WITHIN_MS = 12 * 3_600_000

export function missingDetails(e: LogEvent): DetailsNeed | null {
  if (e.type !== "feeding" || !e.end) return null
  if (isBottle(e.kind)) {
    if (!e.amountStartMl) return "amount"
    return e.percent === undefined && e.amountEndMl === undefined ? "percent" : null
  }
  return e.confidence === undefined ? "rating" : null
}

export interface AskedFeeds {
  /** When this phone started asking. Feeds that ended before then aren't brought up. */
  since: number
  ids: ReadonlySet<string>
}

/** The feed to ask about now: the latest one this person stopped in the last 12 hours that's missing details. */
export function feedToAsk(events: LogEvent[], user: string, asked: AskedFeeds, now: number) {
  let best: { event: LogEvent; need: DetailsNeed } | undefined
  for (const e of events) {
    if (e.type !== "feeding" || !e.end || asked.ids.has(e.id)) continue
    const end = new Date(e.end).getTime()
    if (end < asked.since || now - end > ASK_WITHIN_MS) continue
    if ((e.updatedBy ?? e.by) !== user) continue
    const need = missingDetails(e)
    if (need && (!best || end > new Date(best.event.end!).getTime())) best = { event: e, need }
  }
  return best
}

// --- Which feeds this phone has asked about (or opened the form for) ----------------------------------------------

const KEY = "ct.askedFeeds"
const KEEP = 50

function read(): AskedFeeds {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as { since?: number; ids?: string[] } | null
    if (saved?.since) return { since: saved.since, ids: new Set(saved.ids ?? []) }
  } catch {
    // Start afresh.
  }
  const fresh = { since: Date.now(), ids: new Set<string>() }
  write(fresh)
  return fresh
}

function write(state: AskedFeeds) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ since: state.since, ids: [...state.ids].slice(-KEEP) }))
  } catch {
    // Without it a feed may be asked about again.
  }
}

let state: AskedFeeds | undefined
const listeners = new Set<() => void>()

export function askedFeeds() {
  state ??= read()
  return state
}

export function markAsked(id: string) {
  const current = askedFeeds()
  if (current.ids.has(id)) return
  state = { since: current.since, ids: new Set([...current.ids, id]) }
  write(state)
  listeners.forEach((l) => l())
}

export function onAskedFeeds(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
