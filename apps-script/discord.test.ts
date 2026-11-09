import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { beforeEach, describe, expect, it } from "vitest"

// The Discord on/off switch, with the Sheet and Discord stubbed out. See push.test.ts for how the script loads.
type Script = Record<string, (...args: never[]) => unknown> & Record<string, unknown>
type Settings = Record<string, unknown>

const source = readFileSync(new URL("./Code.gs", import.meta.url), "utf8")
const HOUR = 3_600_000
const WEBHOOK = "https://discord.example/webhook"

let gs: Script
let settings: Settings
let props: Record<string, string>
let posts: string[]
let pushes: string[]
let phones: number

beforeEach(() => {
  settings = { babyName: "Carolina", discordWebhook: WEBHOOK, discordOn: true }
  props = {}
  posts = []
  pushes = []
  phones = 0
  gs = runInNewContext(source + "\nthis", {
    UrlFetchApp: {
      fetch: (url: string, opts: { payload: string }) => {
        posts.push(`${url} ${JSON.parse(opts.payload).content}`)
        return { getResponseCode: () => 204 }
      },
    },
    Utilities: {
      formatDate: (d: Date, _tz: string, fmt: string) =>
        fmt === "H" ? String(d.getUTCHours()) : d.toISOString().slice(0, 10),
    },
    Session: { getScriptTimeZone: () => "UTC" },
    Logger: { log: (e: unknown) => { throw e } },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) => props[k] ?? null,
        setProperty: (k: string, v: string) => (props[k] = v),
      }),
    },
  }) as Script
  Object.assign(gs, {
    withLock_: (fn: () => unknown) => fn(),
    settingsWithDefaults_: () => ({ ...settings }),
    setSetting_: (key: string, value: unknown) => (settings[key] = value),
    pushSubs_: () => Array.from({ length: phones }, (_, i) => ({ endpoint: `https://push/${i}` })),
    pushAll_: (body: string) => {
      pushes.push(body)
      return true
    },
  })
})

const state = (s: Settings) => (gs.discordState_ as (s: Settings) => string)(s)
const post = (text: string) => (gs.postDiscord_ as (c: string, s?: Settings) => boolean)(text)

describe("the Discord switch", () => {
  it("reports none, on or off for the app", () => {
    expect(state({ discordWebhook: "", discordOn: true })).toBe("none")
    expect(state({ discordWebhook: " ", discordOn: false })).toBe("none")
    expect(state({ discordWebhook: WEBHOOK, discordOn: true })).toBe("on")
    expect(state({ discordWebhook: WEBHOOK, discordOn: "TRUE" })).toBe("on")
    expect(state({ discordWebhook: WEBHOOK, discordOn: false })).toBe("off")
    expect(state({ discordWebhook: WEBHOOK, discordOn: "FALSE" })).toBe("off")
  })

  it("defaults to on, so a Sheet set up before the switch keeps posting", () => {
    const row = (gs.DEFAULT_SETTINGS as [string, unknown][]).find((r) => r[0] === "discordOn")
    expect(row?.[1]).toBe(true)
  })

  it("posts nothing while off and keeps the webhook", () => {
    expect(post("hello")).toBe(true)
    expect(posts).toEqual([`${WEBHOOK} hello`])

    expect((gs.setDiscord_ as (on: boolean) => unknown)(false)).toEqual({ discord: "off" })
    expect(settings.discordWebhook).toBe(WEBHOOK)
    expect(post("still there?")).toBe(false)
    expect(posts).toHaveLength(1)

    expect((gs.setDiscord_ as (on: boolean) => unknown)(true)).toEqual({ discord: "on" })
    expect(post("back")).toBe(true)
    expect(posts).toHaveLength(2)
  })

  it("is in the settings the app reads, without the webhook", () => {
    settings.discordOn = false
    const sent = (gs.clientSettings_ as () => Settings)()
    expect(sent.discord).toBe("off")
    expect(JSON.stringify(sent)).not.toContain(WEBHOOK)
  })
})

describe("reminders with Discord off", () => {
  beforeEach(() => {
    Object.assign(settings, {
      remindFeeding: true,
      feedMinH: 2,
      feedMaxH: 4,
      probioticReminderHour: "off",
      vitaminDReminderHour: "off",
    })
    const end = new Date(Date.now() - 2.5 * HOUR).toISOString()
    const start = new Date(Date.now() - 3 * HOUR).toISOString()
    Object.assign(gs, {
      listEvents_: () => [{ id: "f1", type: "feeding", kind: "left", start, end, by: "Mom" }],
    })
  })
  const check = () => (gs.checkReminders as () => void)()

  it("skips Discord and doesn't replay old reminders when it's turned back on", () => {
    settings.discordOn = false
    check()
    expect(posts).toEqual([])
    expect(JSON.parse(props.sentReminders)).toHaveLength(1)

    settings.discordOn = true
    check()
    expect(posts).toEqual([])
  })

  it("still sends to phones, and tries again if they don't get it", () => {
    settings.discordOn = false
    phones = 2
    Object.assign(gs, { pushAll_: () => false })
    check()
    expect(posts).toEqual([])
    expect(props.sentReminders).toBeUndefined()

    Object.assign(gs, {
      pushAll_: (body: string) => {
        pushes.push(body)
        return true
      },
    })
    check()
    expect(pushes).toHaveLength(1)
    expect(posts).toEqual([])
  })

  it("posts as before when on", () => {
    check()
    expect(posts).toHaveLength(1)
    expect(posts[0]).toContain("Feeding window is open")
  })
})
