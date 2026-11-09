import { describe, expect, it } from "vitest"

import { feedToAsk, missingDetails, type AskedFeeds } from "./feed-details"
import type { LogEvent } from "./types"

const now = Date.parse("2026-11-09T15:00:00Z")
const ago = (min: number) => new Date(now - min * 60_000).toISOString()
const feed = (id: string, kind: string, extra: Partial<LogEvent> = {}): LogEvent => ({
  id,
  type: "feeding",
  kind,
  start: ago(40),
  end: ago(20),
  by: "Mom",
  ...extra,
})
const asked = (ids: string[] = [], since = now - 24 * 3_600_000): AskedFeeds => ({ since, ids: new Set(ids) })

describe("missingDetails", () => {
  it("wants a score for the breast and an amount, then a percent, for a bottle", () => {
    expect(missingDetails(feed("a", "left"))).toBe("rating")
    expect(missingDetails(feed("a", "left", { confidence: 4 }))).toBeNull()
    expect(missingDetails(feed("b", "formula"))).toBe("amount")
    expect(missingDetails(feed("b", "formula", { amountStartMl: 90 }))).toBe("percent")
    expect(missingDetails(feed("b", "expressed", { amountStartMl: 90, amountEndMl: 0 }))).toBeNull()
    expect(missingDetails(feed("b", "expressed", { amountStartMl: 90, percent: 50 }))).toBeNull()
    expect(missingDetails(feed("r", "left", { end: undefined }))).toBeNull()
  })
})

describe("feedToAsk", () => {
  it("picks the latest feed this person stopped without details", () => {
    const older = feed("o", "left", { end: ago(90) })
    const newer = feed("n", "formula", { end: ago(10), amountStartMl: 120 })
    expect(feedToAsk([older, newer], "Mom", asked(), now)).toEqual({ event: newer, need: "percent" })
  })

  it("leaves out feeds stopped by someone else, already asked about, or long ago", () => {
    expect(feedToAsk([feed("d", "left", { updatedBy: "Dad" })], "Mom", asked(), now)).toBeUndefined()
    expect(feedToAsk([feed("a", "left")], "Mom", asked(["a"]), now)).toBeUndefined()
    expect(feedToAsk([feed("x", "left", { start: ago(800), end: ago(780) })], "Mom", asked(), now)).toBeUndefined()
  })

  it("doesn't bring up feeds from before this phone started asking", () => {
    expect(feedToAsk([feed("a", "left")], "Mom", asked([], now - 5 * 60_000), now)).toBeUndefined()
  })

  it("asks the person who stopped it, even if someone else started it", () => {
    const e = feed("s", "right", { by: "Dad", updatedBy: "Mom" })
    expect(feedToAsk([e], "Mom", asked(), now)?.event).toBe(e)
  })
})
