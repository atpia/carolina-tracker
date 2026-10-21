import { describe, expect, it } from "vitest"

import { entryName } from "./describe"
import { formatClock } from "@/lib/time"
import type { LogEvent } from "@/lib/types"

const start = new Date(2026, 9, 21, 2, 15).toISOString()
const at = formatClock(start)
const ev = (type: LogEvent["type"], kind: string): LogEvent => ({ id: "x", type, kind, start, by: "Test" })

describe("entryName", () => {
  it("names each kind of entry in a sentence", () => {
    expect(entryName(ev("diaper", "wet"))).toBe(`the ${at} wet diaper`)
    expect(entryName(ev("diaper", "both"))).toBe(`the ${at} wet + stool diaper`)
    expect(entryName(ev("diaper", "dry"))).toBe(`the ${at} diaper check`)
    expect(entryName(ev("feeding", "left"))).toBe(`the ${at} left breast feed`)
    expect(entryName(ev("med", "tylenol"))).toBe(`the ${at} Tylenol dose`)
    expect(entryName(ev("med", "ibuprofen"))).toBe(`the ${at} ibuprofen dose`)
  })
})
