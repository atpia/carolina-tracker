/**
 * The notification that stays up while a feed is running, built the same way by the app (which shows it) and the
 * service worker (which handles its Stop button).
 *
 * Web notifications can't count up by themselves, so it doesn't try to: it carries the start time, which Android
 * shows as a live "12m" beside the app's name, and iPhones as "12m ago" since it arrived when the feed started.
 */
import { formatClock, formatClockRange, formatDuration } from "./time"
import { FEED_LABELS, type FeedKind, type LogEvent } from "./types"

export const FEED_TAG = "feed-running"
export const FEED_DONE_TAG = "feed-stopped"
export const STOP_ACTION = "stop"
/** Saved (kv.ts) by whichever put up the running notice last, the app or the service worker: its feedSig. */
export const FEED_SHOWN_KEY = "feedNoticeShown"

/** What the Sheet sends about the running feed, next to the notification (feedPayload_ in Code.gs). */
export interface FeedPush {
  state: "running" | "ended" | "removed"
  baby?: string
  event?: LogEvent
}

/** Options browsers accept beyond TypeScript's NotificationOptions. iPhones ignore actions and timestamp. */
export type RichNotificationOptions = NotificationOptions & {
  actions?: { action: string; title: string }[]
  timestamp?: number
  renotify?: boolean
}

export interface NotificationSpec {
  title: string
  options: RichNotificationOptions
}

/** What a notification on screen is showing, to tell whether it needs replacing. */
export function feedSig(e: LogEvent) {
  return `${e.id}|${e.kind}|${e.start}`
}

/** Android Chrome shows action buttons; iPhones don't. */
export function canShowActions() {
  try {
    return typeof Notification !== "undefined" && ((Notification as { maxActions?: number }).maxActions ?? 0) > 0
  } catch {
    return false
  }
}

function feedLabel(e: LogEvent) {
  return FEED_LABELS[e.kind as FeedKind] ?? e.kind
}

export function runningFeedNotice(event: LogEvent, babyName: string, canStop = canShowActions()): NotificationSpec {
  return {
    title: `Feeding · ${feedLabel(event)}`,
    options: {
      body: `${babyName} · started ${formatClock(event.start)} by ${event.by}${canStop ? "" : ". Tap to open."}`,
      tag: FEED_TAG,
      timestamp: new Date(event.start).getTime(),
      // Stays put and doesn't buzz: the person who started it is right there.
      requireInteraction: true,
      silent: true,
      renotify: false,
      icon: "./icon-192.png",
      badge: "./badge-96.png",
      actions: canStop ? [{ action: STOP_ACTION, title: "Stop feed" }] : undefined,
      data: { sig: feedSig(event), event, url: "./" },
    },
  }
}

/** Replaces the running notice after Stop is tapped. Tapping it opens the entry to add how the feed went. */
export function stoppedFeedNotice(event: LogEvent, note?: string): NotificationSpec {
  const end = event.end ?? new Date().toISOString()
  const ms = new Date(end).getTime() - new Date(event.start).getTime()
  return {
    title: `Feed stopped · ${feedLabel(event)}`,
    options: {
      body: `${formatClockRange(event.start, end)} (${formatDuration(Math.max(ms, 60_000))}). ${note ?? "Tap to add how it went."}`,
      tag: FEED_DONE_TAG,
      silent: true,
      icon: "./icon-192.png",
      badge: "./badge-96.png",
      data: { url: `./?edit=${encodeURIComponent(event.id)}` },
    },
  }
}
