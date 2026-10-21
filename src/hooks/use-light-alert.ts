import { useEffect, useRef } from "react"

import { useNow } from "@/hooks/use-now"
import { isRetryable } from "@/lib/api"
import { MIN } from "@/lib/time"
import type { LogEvent } from "@/lib/types"

const SENT_KEY = "ct.lightAlerts"
/** Opening the app long after the limit passed shouldn't flash the light. Matches LIGHT_LATE_MS in Code.gs. */
const LATE_MS = 15 * MIN

function readSent(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SENT_KEY) ?? "[]") as string[])
  } catch {
    return new Set()
  }
}

function writeSent(sent: Set<string>) {
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify([...sent].slice(-50)))
  } catch {
    // Without storage a reload may ask again, and the Sheet only flashes once per feed anyway.
  }
}

/**
 * Asks the Sheet to flash the Home Assistant light the moment a running breastfeed passes the limit, once per
 * feed on this phone. The Sheet also flashes it from its 5-minute check, and only once per feed across phones.
 */
export function useLightAlert(
  activeFeeds: { event: LogEvent; stale: boolean; overAt?: number }[],
  enabled: boolean,
  send: (id: string) => Promise<boolean>,
) {
  const now = useNow(10_000)
  const sent = useRef<Set<string> | null>(null)

  useEffect(() => {
    if (!enabled) return
    sent.current ??= readSent()
    const asked = sent.current
    for (const { event, stale, overAt } of activeFeeds) {
      if (stale || overAt === undefined || now < overAt || now - overAt > LATE_MS || asked.has(event.id)) continue
      asked.add(event.id)
      writeSent(asked)
      send(event.id).catch((e) => {
        // Offline or the Sheet was busy: try again on the next tick.
        if (!isRetryable(e)) return
        asked.delete(event.id)
        writeSent(asked)
      })
    }
  }, [activeFeeds, enabled, send, now])
}
