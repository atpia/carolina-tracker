import { describe, expect, it } from "vitest"

import { analyze } from "./analytics"
import { summaryText } from "./summary"
import { HOUR } from "./time"
import type { LogEvent } from "./types"

const NOW = new Date("2026-10-21T12:00:00Z").getTime()
const ago = (h: number) => new Date(NOW - h * HOUR).toISOString()

describe("summaryText", () => {
  it("leaves out missing stats without stray blank lines", () => {
    // One feed and no diapers: no average, no longest gap, no diaper streaks.
    const events: LogEvent[] = [{ id: "f", type: "feeding", kind: "left", start: ago(2), end: ago(1.8), by: "T" }]
    const range = { from: NOW - 24 * HOUR, to: NOW }
    const text = summaryText("Carolina", range, analyze(events, range), "ml")
    const lines = text.split("\n")
    expect(text.endsWith("\n")).toBe(false)
    expect(text).not.toContain("\n\n\n")
    expect(text).not.toContain("Average time between feeds")
    expect(lines[1]).toBe("")
    expect(lines[2]).toMatch(/^Feedings: 1 /)
    expect(lines[3]).toMatch(/^ {2}Breast: 1/)
    expect(lines[lines.length - 1]).toMatch(/^Stools: 0/)
  })
})
