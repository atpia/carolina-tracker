import { describe, expect, it } from "vitest"

import { formatClock, formatClockRange } from "./time"

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
