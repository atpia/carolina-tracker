import { describe, expect, it } from "vitest"

import { FEED_DONE_TAG, FEED_TAG, feedSig, runningFeedNotice, stoppedFeedNotice } from "./feed-notice"
import type { LogEvent } from "./types"

const event: LogEvent = { id: "f1", type: "feeding", kind: "left", start: "2026-11-09T10:00:00.000Z", by: "Mom" }

describe("runningFeedNotice", () => {
  it("is a silent, sticky notice timed from the start, with Stop where phones show buttons", () => {
    const { title, options } = runningFeedNotice(event, "Carolina", true)
    expect(title).toBe("Feeding · Left breast")
    expect(options).toMatchObject({
      tag: FEED_TAG,
      silent: true,
      requireInteraction: true,
      timestamp: Date.parse(event.start),
      actions: [{ action: "stop", title: "Stop feed" }],
      data: { sig: feedSig(event), event },
    })
    expect(options.body).toMatch(/^Carolina · started .+ by Mom$/)
  })

  it("asks for a tap instead where there are no buttons (iPhone)", () => {
    const { options } = runningFeedNotice(event, "Carolina", false)
    expect(options.actions).toBeUndefined()
    expect(options.body).toMatch(/Tap to open\.$/)
  })
})

describe("stoppedFeedNotice", () => {
  it("says how long it ran and opens the entry", () => {
    const { title, options } = stoppedFeedNotice({ ...event, end: "2026-11-09T10:18:00.000Z" })
    expect(title).toBe("Feed stopped · Left breast")
    expect(options.body).toContain("(18m)")
    expect(options.tag).toBe(FEED_DONE_TAG)
    expect(options.data).toEqual({ url: "./?edit=f1" })
  })
})
