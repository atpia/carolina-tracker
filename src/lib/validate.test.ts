import { describe, expect, it } from "vitest"

import { HOUR } from "./time"
import type { LogEvent } from "./types"
import { entryErrors } from "./validate"

const NOW = new Date("2026-10-21T12:00:00Z").getTime()
const at = (h: number) => new Date(NOW - h * HOUR).toISOString()
const feed = (extra: Partial<LogEvent>): LogEvent => ({
  id: "x",
  type: "feeding",
  kind: "left",
  start: at(1),
  by: "T",
  ...extra,
})

describe("entryErrors", () => {
  it("accepts a normal feed", () => {
    expect(entryErrors(feed({ end: at(0.5) }), "left", NOW)).toEqual([])
  })

  it("blocks a finish before the start, and future times", () => {
    expect(entryErrors(feed({ end: at(2) }), "left", NOW)).toContain("The finish time is before the start time.")
    expect(entryErrors(feed({ start: at(-1) }), "left", NOW)).toContain("Times can't be in the future.")
  })

  it("checks bottle amounts", () => {
    const bottle = (extra: Partial<LogEvent>) => feed({ kind: "formula", end: at(0.5), ...extra })
    expect(entryErrors(bottle({ amountStartMl: 60, amountEndMl: 80 }), "left", NOW)).toEqual([
      "More is left over than was offered.",
    ])
    expect(entryErrors(bottle({ amountEndMl: 10 }), "left", NOW)).toEqual(["Add how much was offered."])
    // In percent mode a stale left over value is ignored.
    expect(entryErrors(bottle({ amountStartMl: 60, amountEndMl: 80, percent: 50 }), "percent", NOW)).toEqual([])
    expect(entryErrors(bottle({ amountStartMl: -5 }), "amount", NOW)).toEqual(["Amounts can't be negative."])
  })
})
