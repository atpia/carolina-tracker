import { describe, expect, it } from "vitest"

import { planQuick } from "./quick"
import type { LogEvent } from "./types"

const feed = (id: string, kind: string, extra: Partial<LogEvent> = {}): LogEvent => ({
  id,
  type: "feeding",
  kind,
  start: "2026-11-09T10:00:00.000Z",
  by: "Mom",
  ...extra,
})

const status = (running?: LogEvent, lastSide?: LogEvent, stale = false) => ({
  activeFeeds: running ? [{ event: running, stale }] : [],
  lastSide,
})

describe("planQuick", () => {
  it("logs diapers by kind", () => {
    expect(planQuick("diaper-wet", status())).toEqual({ kind: "diaper", diaper: "wet" })
    expect(planQuick("diaper-dry", status())).toEqual({ kind: "diaper", diaper: "dry" })
  })

  it("toggles a feed: stops the running one, or starts the side after the last", () => {
    const running = feed("r", "left")
    expect(planQuick("feed", status(running))).toEqual({ kind: "feed", stop: running })
    expect(planQuick("feed", status(undefined, feed("x", "left", { end: "2026-11-09T10:20:00.000Z" })))).toEqual({
      kind: "feed",
      start: "right",
    })
    expect(planQuick("feed", status())).toEqual({ kind: "feed", start: "left" })
  })

  it("starts a side, but only when no other feed is running", () => {
    const left = feed("r", "left")
    expect(planQuick("feed-left", status(left))).toEqual({ kind: "busy", running: left })
    expect(planQuick("feed-right", status(left))).toEqual({ kind: "busy", running: left })
    expect(planQuick("feed-right", status())).toEqual({ kind: "feed", start: "right" })
    // A timer left on for hours doesn't count.
    expect(planQuick("feed-both", status(left, undefined, true))).toEqual({ kind: "feed", start: "both" })
  })

  it("leaves a forgotten timer alone", () => {
    const old = feed("old", "left")
    expect(planQuick("feed-stop", status(old, undefined, true))).toEqual({ kind: "feed", stop: undefined })
    expect(planQuick("feed", status(old, undefined, true))).toEqual({ kind: "feed", start: "left" })
  })
})
