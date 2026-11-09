import { describe, expect, it } from "vitest"

import { parseLaunch, quickLink, withoutLaunch } from "./launch"

describe("parseLaunch", () => {
  it("reads the shortcut and notification parameters", () => {
    expect(parseLaunch("?log=diaper")).toEqual({ log: "diaper" })
    expect(parseLaunch("?tab=calendar")).toEqual({ tab: "calendar" })
    expect(parseLaunch("?edit=abc-123")).toEqual({ edit: "abc-123" })
    expect(parseLaunch("?do=diaper-wet")).toEqual({ do: "diaper-wet" })
  })

  it("ignores values it doesn't know", () => {
    expect(parseLaunch("?log=nap&tab=secret&do=diaper-purple")).toEqual({})
    expect(parseLaunch("")).toEqual({})
  })
})

describe("withoutLaunch", () => {
  it("drops the launch parameters and keeps the rest", () => {
    expect(withoutLaunch("https://x.github.io/app/?do=feed&keep=1#top")).toBe("/app/?keep=1#top")
    expect(withoutLaunch("https://x.github.io/app/?log=med")).toBe("/app/")
  })
})

describe("quickLink", () => {
  it("puts everything the Sheet needs in the link", () => {
    const link = new URL(quickLink("https://script.google.com/macros/s/ID/exec", "abcd-efgh-jkmn", "diaper-wet"))
    expect(link.origin + link.pathname).toBe("https://script.google.com/macros/s/ID/exec")
    expect(Object.fromEntries(link.searchParams)).toEqual({
      action: "quick",
      format: "text",
      code: "abcd-efgh-jkmn",
      do: "diaper-wet",
    })
  })

  it("ends with the part a shortcut fills in, such as the amount", () => {
    const link = quickLink("https://script.google.com/macros/s/ID/exec", "c", "feed-formula", { unit: "oz", amount: "" })
    expect(link.endsWith("&do=feed-formula&unit=oz&amount=")).toBe(true)
  })
})
