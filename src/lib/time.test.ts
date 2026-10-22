import { describe, expect, it } from "vitest"

import { formatClock, formatClockRange, toClockInput, withClock, withDay } from "./time"

// Written for a 12-hour English clock, which is what CI and the family's phones use.
describe("formatClockRange", () => {
  it("shows a shared AM or PM once", () => {
    const end = new Date(2026, 9, 21, 1, 25)
    expect(formatClockRange(new Date(2026, 9, 21, 1, 0), end)).toBe(`1:00 to ${formatClock(end)}`)
  })

  it("keeps both across noon", () => {
    const start = new Date(2026, 9, 21, 11, 50)
    const end = new Date(2026, 9, 21, 12, 10)
    expect(formatClockRange(start, end)).toBe(`${formatClock(start)} to ${formatClock(end)}`)
  })
})

describe("date and time picker helpers", () => {
  const iso = new Date(2026, 9, 21, 1, 5, 30).toISOString()

  it("reads the local clock time", () => {
    expect(toClockInput(iso)).toBe("01:05")
    expect(toClockInput("")).toBe("")
  })

  it("moves to another day and keeps the clock time", () => {
    const moved = new Date(withDay(iso, new Date(2026, 9, 19)))
    expect([moved.getDate(), moved.getHours(), moved.getMinutes()]).toEqual([19, 1, 5])
  })

  it("changes the clock time and keeps the day", () => {
    const moved = new Date(withClock(iso, "23:40"))
    expect([moved.getDate(), moved.getHours(), moved.getMinutes(), moved.getSeconds()]).toEqual([21, 23, 40, 0])
  })

  it("starts from now when there is no time yet", () => {
    const today = new Date()
    expect(new Date(withClock("", "08:15")).toDateString()).toBe(today.toDateString())
    expect(new Date(withDay("", new Date(2026, 0, 2))).getDate()).toBe(2)
  })
})
