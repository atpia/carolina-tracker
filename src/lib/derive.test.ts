import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { consumedMl, deriveStatus, dueCount } from "./derive"
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

describe("as time passes", () => {
  it("rolls today's counts over at midnight without new data", () => {
    const evening = new Date(2026, 9, 21, 23, 50).getTime()
    const events: LogEvent[] = [
      {
        id: "a",
        type: "feeding",
        kind: "left",
        start: new Date(2026, 9, 21, 23, 30).toISOString(),
        end: new Date(2026, 9, 21, 23, 45).toISOString(),
        by: "Test",
      },
      { id: "b", type: "diaper", kind: "wet", start: new Date(2026, 9, 21, 23, 40).toISOString(), by: "Test" },
    ]
    const before = deriveStatus(events, DEFAULT_SETTINGS, evening)
    expect(before.today.feeds).toBe(1)
    expect(before.today.wet).toBe(1)
    const after = deriveStatus(events, DEFAULT_SETTINGS, new Date(2026, 9, 22, 0, 10).getTime())
    expect(after.today.feeds).toBe(0)
    expect(after.today.wet).toBe(0)
  })

  it("turns a running timer into a forgotten one", () => {
    const events = [ev("feeding", "left", 1)]
    expect(deriveStatus(events, DEFAULT_SETTINGS, NOW).activeFeeds[0].stale).toBe(false)
    expect(deriveStatus(events, DEFAULT_SETTINGS, NOW + 2 * HOUR).activeFeeds[0].stale).toBe(true)
  })

  it("drops doses older than 24 hours from the daily counts", () => {
    const events = [ev("med", "ibuprofen", 20, { doseMg: 400 })]
    expect(deriveStatus(events, DEFAULT_SETTINGS, NOW).meds.ibuprofen.doses24h).toBe(1)
    expect(deriveStatus(events, DEFAULT_SETTINGS, NOW + 5 * HOUR).meds.ibuprofen.mg24h).toBe(0)
  })
})

describe("consumedMl", () => {
  it("uses left over, then percent", () => {
    expect(consumedMl(ev("feeding", "formula", 1, { amountStartMl: 60, amountEndMl: 20 }))).toBe(40)
    expect(consumedMl(ev("feeding", "formula", 1, { amountStartMl: 60, percent: 50 }))).toBe(30)
    expect(consumedMl(ev("feeding", "left", 1, { amountStartMl: 60 }))).toBeUndefined()
  })
})

describe("probiotics", () => {
  it("stays out of the pain reliever rotation", () => {
    const s = deriveStatus([ev("med", "ibuprofen", 3), ev("med", "probiotic", 1)], DEFAULT_SETTINGS)
    expect(s.lastMed?.kind).toBe("ibuprofen")
    expect(s.nextMedKind).toBe("tylenol")
    expect(s.nextMedAt).toBe(NOW - 3 * HOUR + 4 * HOUR)
  })

  it("only counts a dose taken today", () => {
    expect(deriveStatus([ev("med", "probiotic", 13)], DEFAULT_SETTINGS).daily.probiotic).toBeUndefined()
    expect(deriveStatus([ev("med", "probiotic", 2)], DEFAULT_SETTINGS).daily.probiotic?.kind).toBe("probiotic")
  })
})

describe("vitamin D", () => {
  it("is tracked per day apart from probiotics and the pain relievers", () => {
    const s = deriveStatus([ev("med", "tylenol", 5), ev("med", "vitamind", 1)], DEFAULT_SETTINGS)
    expect(s.daily.vitamind?.kind).toBe("vitamind")
    expect(s.daily.probiotic).toBeUndefined()
    expect(s.nextMedKind).toBe("ibuprofen")
  })
})

describe("temperature", () => {
  it("finds the latest reading", () => {
    const s = deriveStatus(
      [ev("temp", "rectal", 3, { tempC: 37 }), ev("temp", "armpit", 1, { tempC: 37.4 })],
      DEFAULT_SETTINGS,
    )
    expect(s.lastTemp?.tempC).toBe(37.4)
  })
})

describe("breastfeeding limit", () => {
  it("warns after the limit on one side and at twice it for both sides", () => {
    const s = deriveStatus([ev("feeding", "left", 0.1), ev("feeding", "both", 0.2)], DEFAULT_SETTINGS)
    const left = s.activeFeeds.find((a) => a.event.kind === "left")!
    const both = s.activeFeeds.find((a) => a.event.kind === "both")!
    expect(left.overAt).toBe(NOW - 0.1 * HOUR + 15 * 60_000)
    expect(left.switchAt).toBeUndefined()
    expect(both.switchAt).toBe(NOW - 0.2 * HOUR + 15 * 60_000)
    expect(both.overAt).toBe(NOW - 0.2 * HOUR + 30 * 60_000)
  })

  it("is off at 0 and for bottles", () => {
    const off = deriveStatus([ev("feeding", "left", 0.1)], { ...DEFAULT_SETTINGS, breastLimitMin: 0 })
    expect(off.activeFeeds[0].overAt).toBeUndefined()
    const bottle = deriveStatus([ev("feeding", "formula", 0.1)], DEFAULT_SETTINGS)
    expect(bottle.activeFeeds[0].overAt).toBeUndefined()
  })
})

describe("home screen badge", () => {
  it("counts an overdue feed, a due diaper check and an allowed dose", () => {
    const events = [
      ev("feeding", "left", 5, { end: ago(4.5) }),
      ev("diaper", "wet", 3),
      ev("med", "ibuprofen", 5),
      // Once-a-day items never count.
    ]
    expect(dueCount(deriveStatus(events, DEFAULT_SETTINGS), NOW)).toBe(3)
  })

  it("is empty when nothing is due, and counts a forgotten timer", () => {
    expect(dueCount(deriveStatus([ev("feeding", "left", 1, { end: ago(0.5) }), ev("diaper", "wet", 0.5)], DEFAULT_SETTINGS), NOW)).toBe(0)
    expect(dueCount(deriveStatus([ev("feeding", "left", 3.5), ev("diaper", "wet", 0.5)], DEFAULT_SETTINGS), NOW)).toBe(1)
  })
})
