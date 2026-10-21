import { describe, expect, it } from "vitest"

import { formatTemp, fromDisplayTemp, isFever, toDisplayTemp } from "./temperature"

describe("temperature units", () => {
  it("round-trips Fahrenheit readings to one decimal", () => {
    for (const f of [97.5, 98.6, 99.9, 100.4, 101.3]) expect(toDisplayTemp(fromDisplayTemp(f, "F"), "F")).toBe(f)
    for (const f of [98.66, 99.01, 100.37]) expect(toDisplayTemp(fromDisplayTemp(f, "F"), "F", 2)).toBe(f)
  })

  it("formats in either unit", () => {
    expect(formatTemp(37, "F")).toBe("98.6 °F")
    expect(formatTemp(37, "C")).toBe("37.0 °C")
  })

  it("flags 100.4 °F and up as a fever", () => {
    expect(isFever(fromDisplayTemp(100.4, "F"))).toBe(true)
    expect(isFever(fromDisplayTemp(100.3, "F"))).toBe(false)
    expect(isFever(38)).toBe(true)
  })
})
