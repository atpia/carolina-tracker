import { describe, expect, it } from "vitest"

import { amountText, parseAmount } from "./units"

describe("amount inputs", () => {
  it("parses decimals in oz and ml", () => {
    expect(parseAmount("1.5", "oz")).toBe(44.4)
    expect(parseAmount("0.5", "oz")).toBe(14.8)
    expect(parseAmount("2.5", "ml")).toBe(2.5)
    expect(parseAmount("1,5", "oz")).toBe(44.4)
    expect(parseAmount("400", "mg")).toBe(400)
  })

  it("reads a half-typed decimal as the whole number", () => {
    expect(parseAmount("1.", "oz")).toBe(parseAmount("1", "oz"))
    // Showing the stored value would drop the dot, which is why the box keeps the typed text while focused.
    expect(amountText(parseAmount("1.", "oz"), "oz")).toBe("1")
  })

  it("round-trips stored values", () => {
    expect(amountText(parseAmount("1.5", "oz"), "oz")).toBe("1.5")
    expect(amountText(parseAmount("0.5", "oz"), "oz")).toBe("0.5")
    expect(amountText(60, "ml")).toBe("60")
    expect(amountText(undefined, "oz")).toBe("")
  })

  it("treats blank or junk as no amount", () => {
    expect(parseAmount("", "ml")).toBeUndefined()
    expect(parseAmount(".", "oz")).toBeUndefined()
    expect(parseAmount("abc", "ml")).toBeUndefined()
  })
})
