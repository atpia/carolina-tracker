import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { beforeEach, describe, expect, it } from "vitest"

// The one-tap actions widgets use, with the Sheet itself stubbed out. See push.test.ts for how the script loads.
type Event = {
  id: string
  type: string
  kind: string
  start: string
  end?: string
  by?: string
  updatedBy?: string
  amountStartMl?: number
  amountEndMl?: number
  percent?: number
  confidence?: number
}
type Script = Record<string, (...args: never[]) => unknown> & Record<string, unknown>

const source = readFileSync(new URL("./Code.gs", import.meta.url), "utf8")
const MIN = 60_000

function load() {
  let n = 0
  return runInNewContext(source + "\nthis", {
    Utilities: {
      getUuid: () => `new-${++n}`,
      formatDate: (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }),
    },
    Session: { getScriptTimeZone: () => "UTC" },
    ContentService: {
      createTextOutput: (text: string) => ({ text, mime: "text", setMimeType(m: string) { this.mime = m; return this } }),
      MimeType: { JSON: "json" },
    },
  }) as Script
}

let gs: Script
let events: Event[]
let saved: Event[]
let stopped: { id: string; end: string }[]

beforeEach(() => {
  gs = load()
  events = []
  saved = []
  stopped = []
  // Stand-ins for the parts that read and write the Sheet.
  Object.assign(gs, {
    authenticate_: (code: string) => {
      if (code !== "good-code") throw Object.assign(new Error("That code is not valid."), { auth: true })
      return "Mom"
    },
    withLock_: (fn: () => unknown) => fn(),
    announce_: () => {},
    // Telling the phones about the feed is tested in feed-notice.test.ts.
    feedChanged_: () => {},
    settingsWithDefaults_: () => ({ babyName: "Carolina" }),
    listEvents_: () => events,
    saveEvent_: (input: Event, user: string) => {
      const event = { ...input, by: user }
      saved.push(event)
      return { event, created: true }
    },
    stopFeed_: (id: string, end: string) => {
      stopped.push({ id, end })
      return { ...events.find((e) => e.id === id)!, end }
    },
  })
})

const post = (params: Record<string, string>) =>
  (gs.doPost as (e: unknown) => { text: string; mime: string })({ parameter: params })

describe("quickPlan_", () => {
  const now = Date.parse("2026-11-09T12:00:00Z")
  const ago = (min: number) => new Date(now - min * MIN).toISOString()
  const plan = (what: string, list: Event[]) => (gs.quickPlan_ as (...a: unknown[]) => unknown)(what, list, now)

  it("matches the app: toggle, one feed at a time, stop and diapers", () => {
    const running = { id: "r", type: "feeding", kind: "left", start: ago(10) }
    const ended = { id: "e", type: "feeding", kind: "left", start: ago(200), end: ago(180) }
    expect(plan("diaper-both", [])).toEqual({ diaper: "both" })
    expect(plan("feed", [running])).toEqual({ stop: running })
    expect(plan("feed", [ended])).toEqual({ start: "right" })
    expect(plan("feed-left", [running])).toEqual({ busy: running })
    expect(plan("feed-formula", [running])).toEqual({ busy: running })
    expect(plan("feed-expressed", [ended])).toEqual({ start: "expressed" })
    expect(plan("feed-stop", [ended])).toEqual({ stop: null })
  })

  it("adds details to the feed that ended last, one this person stopped first", () => {
    const mine = { id: "m", type: "feeding", kind: "left", start: ago(40), end: ago(30), by: "Mom" }
    const theirs = { id: "t", type: "feeding", kind: "formula", start: ago(20), end: ago(10), by: "Dad" }
    const old = { id: "o", type: "feeding", kind: "right", start: ago(120), end: ago(90), by: "Mom" }
    const details = (list: Event[], user: string) => (gs.quickPlan_ as (...a: unknown[]) => unknown)("feed-details", list, now, user)
    expect(details([mine, theirs], "Mom")).toEqual({ details: mine })
    expect(details([mine, theirs], "Grandma")).toEqual({ details: theirs })
    expect(details([old], "Mom")).toEqual({ details: null })
  })

  it("ignores a timer left running for hours", () => {
    const forgotten = { id: "f", type: "feeding", kind: "right", start: ago(4 * 60) }
    expect(plan("feed", [forgotten])).toEqual({ start: "left" })
  })

  it("names the actions it knows when given one it doesn't", () => {
    expect(() => plan("nap", [])).toThrow(/Unknown quick action "nap".*diaper-wet/)
  })
})

describe("requestFrom_", () => {
  const read = (e: unknown) => (gs.requestFrom_ as (e: unknown) => unknown)(e)

  it("reads the app's JSON body", () => {
    expect(read({ postData: { contents: '{"action":"list","code":"c"}' }, parameter: {} })).toEqual({
      action: "list",
      code: "c",
    })
  })

  it("reads a widget's link when the body is empty or a form", () => {
    const parameter = { action: "quick", code: "c", do: "diaper-wet" }
    expect(read({ parameter })).toEqual(parameter)
    expect(read({ postData: { contents: "action=quick&code=c&do=diaper-wet" }, parameter })).toEqual(parameter)
  })

  it("refuses a request it can't read", () => {
    expect(() => read({ postData: { contents: "nonsense" }, parameter: {} })).toThrow(/not understood/)
  })
})

describe("doPost with a widget's link", () => {
  it("logs a diaper and answers with a sentence", () => {
    const res = post({ action: "quick", format: "text", code: "good-code", do: "diaper-wet" })
    expect(res.mime).toBe("text")
    expect(res.text).toMatch(/^Wet diaper logged at \d{1,2}:\d\d [AP]M\.$/)
    expect(saved).toMatchObject([{ type: "diaper", kind: "wet", by: "Mom" }])
  })

  const quick = (params: Record<string, string>) => post({ action: "quick", format: "text", code: "good-code", ...params }).text
  const ago = (min: number) => new Date(Date.now() - min * MIN).toISOString()

  it("won't start a second feed while one is running", () => {
    events = [{ id: "r", type: "feeding", kind: "left", start: ago(12), by: "Dad" }]
    expect(quick({ do: "feed-right" })).toMatch(
      /^A left breast feed is already running, started at .+ \(12 min\)\. Stop it before starting another\.$/,
    )
    events = [{ id: "r", type: "feeding", kind: "expressed", start: ago(3), by: "Dad" }]
    expect(quick({ do: "feed-formula" })).toMatch(/^An expressed milk feed is already running/)
    expect(stopped).toEqual([])
    expect(saved).toEqual([])
  })

  it("starts a bottle with the amount offered, in the phone's unit", () => {
    expect(quick({ do: "feed-formula", amount: "4", unit: "oz" })).toMatch(
      /^Formula feed started at \d{1,2}:\d\d [AP]M, 4 oz offered\.$/,
    )
    expect(saved).toMatchObject([{ type: "feeding", kind: "formula", amountStartMl: 118.3 }])
    expect(quick({ do: "feed-expressed", amount: "90" })).toMatch(/, 90 ml offered\.$/)
  })

  it("starts a bottle without an amount, and says to add it in the app", () => {
    expect(quick({ do: "feed-expressed", amount: "" })).toMatch(/started at .+\. Add how much was offered in the app\.$/)
    expect(saved[0].amountStartMl).toBeUndefined()
  })

  it("refuses an amount no bottle holds, such as a misheard 40 oz", () => {
    expect(quick({ do: "feed-formula", amount: "40", unit: "oz" })).toBe(
      "Couldn't do that: 40 oz is more than a bottle holds. Try again, or use the app.",
    )
    expect(saved).toEqual([])
  })

  it("asks how a feed went when stopping it for Siri, depending on the kind", () => {
    events = [{ id: "r", type: "feeding", kind: "left", start: ago(12), by: "Mom" }]
    expect(quick({ do: "feed-stop", ask: "1" })).toBe("Left breast feed stopped after 12 min. How did it go, from 1 to 5?")
    events = [{ id: "r", type: "feeding", kind: "formula", start: ago(12), by: "Mom", amountStartMl: 120 }]
    expect(quick({ do: "feed-stop", ask: "1" })).toMatch(/ What percent did Carolina drink\?$/)
    events = [{ id: "r", type: "feeding", kind: "formula", start: ago(12), by: "Mom" }]
    expect(quick({ do: "feed-stop", ask: "1", unit: "oz" })).toMatch(/ How much did Carolina drink, in oz\?$/)
    // A widget just stops it.
    expect(quick({ do: "feed-stop" })).toBe("Formula feed stopped after 12 min.")
  })

  it("saves the answer to the feed that just ended", () => {
    events = [{ id: "e", type: "feeding", kind: "right", start: ago(30), end: ago(1), by: "Mom", updatedBy: "Mom" }]
    expect(quick({ do: "feed-details", value: "4" })).toBe("Saved. Right breast feed, 4 out of 5.")
    expect(saved).toMatchObject([{ id: "e", confidence: 4 }])

    events = [{ id: "b", type: "feeding", kind: "formula", start: ago(30), end: ago(1), by: "Mom", amountStartMl: 120 }]
    expect(quick({ do: "feed-details", value: "75", unit: "oz" })).toBe("Saved. Carolina drank 75% of 4.1 oz.")
    expect(saved[1]).toMatchObject({ id: "b", percent: 75, amountStartMl: 120 })

    events = [{ id: "n", type: "feeding", kind: "expressed", start: ago(30), end: ago(1), by: "Mom" }]
    expect(quick({ do: "feed-details", value: "2,5", unit: "oz" })).toBe("Saved. Carolina drank 2.5 oz.")
    expect(saved[2]).toMatchObject({ id: "n", amountStartMl: 73.9, amountEndMl: 0 })
  })

  it("leaves the feed alone when the answer doesn't fit", () => {
    events = [{ id: "e", type: "feeding", kind: "left", start: ago(30), end: ago(1), by: "Mom" }]
    expect(quick({ do: "feed-details", value: "8" })).toBe("That needs a number from 1 to 5. Add it in the app instead.")
    expect(quick({ do: "feed-details", value: "" })).toBe("That needs a number from 1 to 5. Add it in the app instead.")
    events = []
    expect(quick({ do: "feed-details", value: "4" })).toBe("No feed has ended in the last hour.")
    expect(saved).toEqual([])
  })

  it("says when there was nothing to stop", () => {
    expect(quick({ do: "feed-stop" })).toBe("No feed is running.")
  })

  it("points out a timer that was never stopped", () => {
    events = [{ id: "f", type: "feeding", kind: "left", start: ago(5 * 60), by: "Mom" }]
    expect(quick({ do: "feed-stop" })).toMatch(
      /^No feed is running\. A feed timer from .+ was never stopped\. Set when it ended in the app\.$/,
    )
    expect(quick({ do: "feed-left" })).toMatch(/^Left breast feed started at .+\. A feed timer from .+ was never stopped/)
  })

  it("explains a refusal in plain words", () => {
    expect(post({ action: "quick", format: "text", code: "bad", do: "diaper-wet" }).text).toBe(
      "Couldn't do that: That code is not valid.",
    )
  })

  it("still answers the app in JSON", () => {
    const res = post({ action: "quick", code: "good-code", do: "diaper-dry" })
    expect(res.mime).toBe("json")
    expect(JSON.parse(res.text)).toEqual({ ok: true, result: { message: expect.stringMatching(/^Diaper check/) } })
  })
})
