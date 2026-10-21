import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { consumedMl, deriveStatus } from "./derive"
import { HOUR } from "./time"
import { DEFAULT_SETTINGS, type LogEvent } from "./types"

const NOW = new Date("2026-10-21T12:00:00Z").getTime()
const ago = (h: number) => new Date(NOW - h * HOUR).toISOString()
let n = 0
const ev = (type: LogEvent["type"], kind: string, startH: number, extra: Partial<LogEvent> = {}): LogEvent => ({
  id: `e${n++}`,
  type,
  kind,
  start: ago(startH),
  by: "Test",
  ...extra,
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => vi.useRealTimers())

describe("feeding window", () => {
  it("counts from when the last feed ended", () => {
    const s = deriveStatus([ev("feeding", "left", 1, { end: ago(0.5) })], DEFAULT_SETTINGS)
    expect(s.feedFrom).toBe(NOW - 0.5 * HOUR + 2 * HOUR)
    expect(s.feedBy).toBe(NOW - 0.5 * HOUR + 4 * HOUR)
    expect(s.feedRunning).toBe(false)
  })

  it("has no countdown while a feed is running", () => {
    const s = deriveStatus([ev("feeding", "right", 0.2)], DEFAULT_SETTINGS)
    expect(s.feedRunning).toBe(true)
    expect(s.activeFeeds).toHaveLength(1)
    expect(s.activeFeeds[0].stale).toBe(false)
  })

  it("flags a timer running for 3 hours or more as forgotten", () => {
    const s = deriveStatus([ev("feeding", "left", 4)], DEFAULT_SETTINGS)
    expect(s.activeFeeds[0].stale).toBe(true)
    expect(s.feedRunning).toBe(false)
  })

  it("shows every running timer", () => {
    const s = deriveStatus([ev("feeding", "left", 0.3), ev("feeding", "right", 0.1)], DEFAULT_SETTINGS)
    expect(s.activeFeeds.map((a) => a.event.kind)).toEqual(["right", "left"])
  })

  it("remembers the last single side across both-sides and bottle feeds", () => {
    const s = deriveStatus(
      [
        ev("feeding", "left", 6, { end: ago(5.8) }),
        ev("feeding", "both", 3, { end: ago(2.7) }),
        ev("feeding", "formula", 1, { end: ago(0.9) }),
      ],
      DEFAULT_SETTINGS,
    )
    expect(s.lastSide?.kind).toBe("left")
  })
})

describe("diaper checks", () => {
  it("waits 2 hours after a change and 1 hour after a clean check", () => {
    expect(deriveStatus([ev("diaper", "wet", 1)], DEFAULT_SETTINGS).nextCheck).toBe(NOW + HOUR)
    const s = deriveStatus([ev("diaper", "stool", 3), ev("diaper", "dry", 0.5)], DEFAULT_SETTINGS)
    expect(s.nextCheck).toBe(NOW + 0.5 * HOUR)
    expect(s.lastStool?.kind).toBe("stool")
    expect(s.lastChange?.kind).toBe("stool")
  })
})

describe("medication", () => {
  it("alternates and spaces the same medicine two intervals apart", () => {
    const s = deriveStatus(
      [ev("med", "ibuprofen", 5, { doseMg: 400 }), ev("med", "tylenol", 1, { doseMg: 500 })],
      DEFAULT_SETTINGS,
    )
    expect(s.nextMedKind).toBe("ibuprofen")
    expect(s.nextMedAt).toBe(NOW + 3 * HOUR)
    expect(s.meds.ibuprofen.nextAt).toBe(NOW + 3 * HOUR)
    expect(s.meds.tylenol.nextAt).toBe(NOW + 7 * HOUR)
    expect(s.meds.tylenol.doses24h).toBe(1)
    expect(s.meds.ibuprofen.mg24h).toBe(400)
  })
})

describe("consumedMl", () => {
  it("uses left over, then percent", () => {
    expect(consumedMl(ev("feeding", "formula", 1, { amountStartMl: 60, amountEndMl: 20 }))).toBe(40)
    expect(consumedMl(ev("feeding", "formula", 1, { amountStartMl: 60, percent: 50 }))).toBe(30)
    expect(consumedMl(ev("feeding", "left", 1, { amountStartMl: 60 }))).toBeUndefined()
  })
})
