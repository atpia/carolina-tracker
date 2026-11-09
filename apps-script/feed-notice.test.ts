import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { beforeEach, describe, expect, it } from "vitest"

// The running feed sent to every phone, with the Sheet and the push services stubbed out. See push.test.ts for
// how the script loads and quick.test.ts for the same kind of stand-ins.
type Event = { id: string; type: string; kind: string; start: string; end?: string; by?: string; updatedBy?: string; notes?: string }
type Sub = { endpoint: string; feed?: boolean }
type Script = Record<string, (...args: never[]) => unknown> & Record<string, unknown>
type Sent = { to: string[]; message: { notification: Record<string, unknown>; feed: Record<string, unknown>; mutable?: boolean }; topic?: string }

const source = readFileSync(new URL("./Code.gs", import.meta.url), "utf8")
const MIN = 60_000

let gs: Script
let props: Record<string, string>
let events: Event[]
let subs: Sub[]
let sent: Sent[]
let reads: number

beforeEach(() => {
  props = {}
  events = []
  subs = [{ endpoint: "https://push/mom" }, { endpoint: "https://push/dad" }, { endpoint: "https://push/grandma" }]
  sent = []
  reads = 0
  gs = runInNewContext(source + "\nthis", {
    Utilities: {
      formatDate: (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }),
    },
    Session: { getScriptTimeZone: () => "UTC" },
    Logger: { log: (e: unknown) => { throw e } },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) => props[k] ?? null,
        setProperty: (k: string, v: string) => (props[k] = v),
        deleteProperty: (k: string) => delete props[k],
      }),
    },
  }) as Script
  Object.assign(gs, {
    withLock_: (fn: () => unknown) => fn(),
    announce_: () => {},
    listEvents_: () => {
      reads++
      return events
    },
    pushSubs_: () => subs,
    settingsWithDefaults_: () => ({ babyName: "Carolina", appUrl: "https://example.com/tracker/" }),
    pushTo_: (to: Sub[], payload: string, topic?: string) => {
      sent.push({ to: to.map((s) => s.endpoint), message: JSON.parse(payload), topic })
      return true
    },
  })
})

const ago = (mins: number) => new Date(Date.now() - mins * MIN).toISOString()
const changed = (from: string | null, user: string, event: Event | null) =>
  (gs.feedChanged_ as (f: string | null, u: string, e: Event | null) => void)(from, user, event)

describe("the running feed on every phone", () => {
  it("tells the other phones when a feed starts, and leaves out the one that started it", () => {
    const feed = { id: "f1", type: "feeding", kind: "left", start: ago(1), by: "Mom", notes: "x".repeat(5000) }
    events = [feed]
    changed("https://push/mom", "Mom", feed)

    expect(sent).toHaveLength(1)
    expect(sent[0].to).toEqual(["https://push/dad", "https://push/grandma"])
    expect(sent[0].topic).toBe("feed")
    expect(sent[0].message.mutable).toBe(true)
    expect(sent[0].message.notification).toMatchObject({ title: "Feeding · Left breast", tag: "feed-running", silent: true })
    expect(sent[0].message.notification.body).toMatch(/^Carolina · started \d+:\d\d [AP]M by Mom$/)
    // Just enough for the notice: long notes would push the message past what a push can carry.
    expect(sent[0].message.feed).toEqual({
      state: "running",
      baby: "Carolina",
      event: { id: "f1", type: "feeding", kind: "left", start: feed.start, by: "Mom" },
    })
  })

  it("says nothing more until the feed changes, then says how it ended", () => {
    const feed: Event = { id: "f1", type: "feeding", kind: "left", start: ago(20), by: "Mom" }
    events = [feed]
    changed(null, "Mom", feed)
    changed(null, "Mom", { ...feed, notes: "Good latch" })
    expect(sent).toHaveLength(1)

    events = [{ ...feed, kind: "right" }]
    changed(null, "Mom", events[0])
    expect(sent).toHaveLength(2)
    expect(sent[1].message.notification.title).toBe("Feeding · Right breast")

    events = [{ ...feed, kind: "right", end: ago(0), updatedBy: "Dad" }]
    changed("https://push/dad", "Dad", events[0])
    expect(sent).toHaveLength(3)
    expect(sent[2].to).toEqual(["https://push/mom", "https://push/grandma"])
    expect(sent[2].message.feed.state).toBe("ended")
    expect(sent[2].message.notification).toMatchObject({ title: "Feed stopped · Right breast", tag: "feed-running" })
    expect(sent[2].message.notification.body).toMatch(/ \(20 min\), stopped by Dad\.$/)

    // Stopped again from an old notification: already told.
    changed(null, "Mom", events[0])
    expect(sent).toHaveLength(3)
    expect(props.feedNotice).toBeUndefined()
  })

  it("doesn't read the Sheet for a finished feed when no feed is showing", () => {
    changed(null, "Mom", { id: "old", type: "feeding", kind: "formula", start: ago(300), end: ago(290) })
    expect(reads).toBe(0)
    expect(sent).toHaveLength(0)
  })

  it("skips phones that turned the running feed off", () => {
    subs[2].feed = false
    events = [{ id: "f1", type: "feeding", kind: "both", start: ago(0), by: "Dad" }]
    changed(null, "Dad", events[0])
    expect(sent[0].to).toEqual(["https://push/mom", "https://push/dad"])
  })

  it("says so when the running feed is deleted, and moves on to another one still going", () => {
    const older = { id: "f1", type: "feeding", kind: "left", start: ago(30), by: "Mom" }
    const newer = { id: "f2", type: "feeding", kind: "right", start: ago(5), by: "Dad" }
    events = [older, newer]
    changed(null, "Dad", newer)
    expect(sent[0].message.feed).toMatchObject({ state: "running", event: { id: "f2" } })

    events = [older]
    changed(null, "Dad", null)
    expect(sent[1].message.feed).toMatchObject({ state: "running", event: { id: "f1" } })

    events = []
    changed(null, "Mom", null)
    expect(sent[2].message.feed.state).toBe("removed")
    expect(sent[2].message.notification.title).toBe("Feed removed · Left breast")
    expect(sent[2].message.notification.body).toMatch(/was deleted by Mom\.$/)
  })

  it("leaves a timer that has run for hours alone until someone stops it", () => {
    const feed: Event = { id: "f1", type: "feeding", kind: "left", start: ago(170), by: "Mom" }
    events = [feed]
    changed(null, "Mom", feed)
    expect(sent).toHaveLength(1)

    // Three hours on, it no longer counts as running, but it hasn't ended either.
    events = [{ ...feed, start: ago(200) }]
    changed(null, "Mom", { id: "b1", type: "feeding", kind: "formula", start: ago(10), end: ago(5) })
    expect(sent).toHaveLength(1)

    events = [{ ...events[0], end: ago(0), updatedBy: "Mom" }]
    changed(null, "Mom", events[0])
    expect(sent[1].message.feed.state).toBe("ended")
  })

  it("never fails the change that was saved", () => {
    Object.assign(gs, { Logger: { log() {} }, pushSubs_: () => { throw new Error("Properties unavailable") } })
    expect(() => changed(null, "Mom", null)).not.toThrow()
  })

  it("is told by the save, stop and delete actions, with the phone that made the change", () => {
    const feed = { id: "f1", type: "feeding", kind: "left", start: ago(1), by: "Mom" }
    Object.assign(gs, {
      saveEvent_: (e: Event) => {
        events = [e]
        return { event: e, created: true }
      },
      stopFeed_: (id: string, end: string) => {
        events = [{ ...events[0], end }]
        return events[0]
      },
    })
    const handle = gs.handle_ as (req: Record<string, unknown>, user: string) => unknown
    handle({ action: "save", event: feed, from: "https://push/mom" }, "Mom")
    expect(sent[0].to).toEqual(["https://push/dad", "https://push/grandma"])
    handle({ action: "stop", id: "f1", end: ago(0), from: "https://push/dad" }, "Dad")
    expect(sent[1].to).toEqual(["https://push/mom", "https://push/grandma"])
    expect(sent[1].message.feed.state).toBe("ended")
  })
})
