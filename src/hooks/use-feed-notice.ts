import { useEffect, useSyncExternalStore } from "react"

import { FEED_SHOWN_KEY, FEED_TAG, feedSig, runningFeedNotice } from "@/lib/feed-notice"
import { feedNoticePref, onFeedNoticePref } from "@/lib/feed-pref"
import { kvGet, kvSet } from "@/lib/kv"
import { workerRegistration } from "@/lib/sw-client"
import type { LogEvent } from "@/lib/types"

export { setFeedNoticePref } from "@/lib/feed-pref"

export function useFeedNoticePref() {
  return useSyncExternalStore(onFeedNoticePref, feedNoticePref, feedNoticePref)
}

/**
 * Keeps a notification up while a feed is running, from this phone or another one, and takes it down when the feed
 * ends. Needs notifications allowed for the app. `ready` waits for fresh data, so an old offline copy doesn't put up
 * a notice for a feed that has already ended. With notifications from the Sheet on, the service worker also puts
 * it up while the app is closed (see feedPayload_ in Code.gs); both remember what they showed in one place.
 */
export function useFeedNotice(
  activeFeeds: { event: LogEvent; stale: boolean }[],
  babyName: string,
  { allowed, ready }: { allowed: boolean; ready: boolean },
) {
  const enabled = useFeedNoticePref() && allowed
  // The newest timer that's really running, not one left on for hours by mistake.
  const feed = activeFeeds.find((a) => !a.stale)?.event

  useEffect(() => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return
    let live = true
    ;(async () => {
      const reg = await workerRegistration()
      if (!reg || !live) return
      const shown = await reg.getNotifications({ tag: FEED_TAG })
      if (!enabled) return shown.forEach((n) => n.close())
      if (!ready) return
      if (!feed) return shown.forEach((n) => n.close())
      const sig = feedSig(feed)
      if (shown.some((n) => (n.data as { sig?: string } | null)?.sig === sig)) return
      // Swiped away: leave it gone until a different feed starts.
      if ((await kvGet<string>(FEED_SHOWN_KEY).catch(() => undefined)) === sig || !live) return
      const notice = runningFeedNotice(feed, babyName)
      await reg.showNotification(notice.title, notice.options)
      // Without it, a notice that was swiped away may come back when the app is next opened.
      await kvSet(FEED_SHOWN_KEY, sig).catch(() => {})
    })().catch(() => {})
    return () => {
      live = false
    }
  }, [enabled, ready, feed, babyName])
}
