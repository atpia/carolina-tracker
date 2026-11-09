import type { Status } from "./derive"
import type { QuickAction } from "./launch"
import type { DiaperKind, FeedKind, LogEvent } from "./types"

export type QuickPlan =
  | { kind: "diaper"; diaper: DiaperKind }
  /** Stop the running feed, or start one. Neither means no feed was running. */
  | { kind: "feed"; stop?: LogEvent; start?: FeedKind }
  /** Asked to start a feed while another is running: only one runs at a time. */
  | { kind: "busy"; running: LogEvent }

/** The feed that's really running, not a timer left on for hours by mistake. */
export function runningFeed(status: Pick<Status, "activeFeeds">) {
  return status.activeFeeds.find((a) => !a.stale)?.event
}

/**
 * What a one-tap action does, given what's going on now. Matches quickPlan_ in the Sheet script, so Siri, a widget
 * and the app's icon shortcuts behave the same:
 * - "feed" stops the running feed, or starts one on the side after the last single-side feed.
 * - "feed-left" (or right, both) starts that side. With a feed already going it says so instead.
 * - "feed-stop" stops the running feed.
 */
export function planQuick(action: QuickAction, status: Pick<Status, "activeFeeds" | "lastSide">): QuickPlan {
  if (action.startsWith("diaper-")) return { kind: "diaper", diaper: action.slice("diaper-".length) as DiaperKind }
  // A forgotten timer (hours old) isn't "running" here; the app asks for its real finish time instead.
  const running = runningFeed(status)
  if (action === "feed-stop") return { kind: "feed", stop: running }
  if (action === "feed") {
    if (running) return { kind: "feed", stop: running }
    return { kind: "feed", start: status.lastSide?.kind === "left" ? "right" : "left" }
  }
  if (running) return { kind: "busy", running }
  return { kind: "feed", start: action.slice("feed-".length) as FeedKind }
}
