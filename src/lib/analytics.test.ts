import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { analyze } from "./analytics"
import { HOUR } from "./time"
import type { LogEvent } from "./types"

const NOW = new Date("2026-10-21T12:00:00Z").getTime()
const ago = (h: number) => new Date(NOW - h * HOUR).toISOString()
let n = 0
const diaper = (kind: string, h: number): LogEvent => ({ id: `d${n++}`, type: "diaper", kind, start: ago(h), by: "T" })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => vi.useRealTimers())

describe("longest without stool", () => {
  const events = [diaper("stool", 40), diaper("stool", 30), diaper("wet", 2)]

  it("counts the stretch up to now when the range is live", () => {
    const a = analyze(events, { from: NOW - 24 * HOUR, to: NOW, live: true })
    expect(a.diaper.longestWithoutStool.ms).toBe(30 * HOUR)
    expect(a.diaper.longestWithoutStool.ongoing).toBe(true)
    expect(a.diaper.longestWithoutStool.at).toBe(NOW - 30 * HOUR)
  })

  it("only measures between entries in a past range", () => {
    const a = analyze(events, { from: NOW - 48 * HOUR, to: NOW - 20 * HOUR })
    expect(a.diaper.longestWithoutStool.ms).toBe(10 * HOUR)
    expect(a.diaper.longestWithoutStool.ongoing).toBe(false)
  })

  it("spans a gap that started before the range", () => {
    const a = analyze([diaper("stool", 30), diaper("stool", 10)], { from: NOW - 24 * HOUR, to: NOW, live: true })
    expect(a.diaper.longestWithoutStool.ms).toBe(20 * HOUR)
    expect(a.diaper.longestWithoutStool.ongoing).toBe(false)
  })
})

describe("counts", () => {
  it("counts a wet + stool diaper in both", () => {
    const a = analyze([diaper("both", 1), diaper("wet", 2), diaper("dry", 3)], { from: NOW - 24 * HOUR, to: NOW })
    expect(a.diaper.wet).toBe(2)
    expect(a.diaper.stool).toBe(1)
  })
})
