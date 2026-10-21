import { DEFAULT_SETTINGS, type Appointment, type LightState, type LogEvent, type Place, type Session } from "./types"
import { startOfToday } from "./time"

export interface Connection {
  /** Apps Script web app URL, or "demo" for a local-only trial. */
  api: string
  code: string
}

export interface Backend {
  session(): Promise<Session>
  list(days: number): Promise<LogEvent[]>
  save(event: LogEvent): Promise<LogEvent>
  remove(id: string): Promise<void>
  /** Ask the Sheet to flash the Home Assistant light for a feed past the limit. True if it did. */
  lightAlert(id: string): Promise<boolean>
  /** Turn the Home Assistant reading light on or off, at a brightness from 1 to 100. */
  setLight(light: LightState): Promise<LightState>
  listAppointments(): Promise<Appointment[]>
  saveAppointment(appointment: Appointment): Promise<Appointment>
  removeAppointment(id: string): Promise<void>
  listPlaces(): Promise<Place[]>
  savePlace(place: Place): Promise<Place>
  removePlace(id: string): Promise<void>
}

/** A Sheet script from before appointments answers their actions with this. */
export function isOldScriptError(e: unknown) {
  return e instanceof Error && /^Unknown action/.test(e.message)
}

const CONN_KEY = "ct.connection"

export function loadConnection(): Connection | null {
  try {
    const raw = localStorage.getItem(CONN_KEY)
    return raw ? (JSON.parse(raw) as Connection) : null
  } catch {
    return null
  }
}

export function saveConnection(conn: Connection | null) {
  try {
    if (conn) localStorage.setItem(CONN_KEY, JSON.stringify(conn))
    else localStorage.removeItem(CONN_KEY)
  } catch {
    // Storage can be unavailable in private browsing; the session just won't persist.
  }
}

/** The request never got an answer, as opposed to the Sheet refusing it. Safe to retry later. */
export class NetworkError extends Error {
  constructor() {
    super("Can't reach the tracker. Check your connection.")
    this.name = "NetworkError"
  }
}

/**
 * Something between the phone and the Sheet failed: an error status, a page that isn't the script's JSON
 * (a wifi login page, a Google error page), or the script asking for a retry because the Sheet was busy.
 * Nothing was refused, so it's safe to retry later.
 */
export class ServerError extends Error {
  /** "status" for an error status, "format" for a reply that wasn't JSON, "busy" when the script said to retry. */
  reason: "status" | "format" | "busy"
  status?: number
  constructor(message: string, reason: ServerError["reason"], status?: number) {
    super(message)
    this.name = "ServerError"
    this.reason = reason
    this.status = status
  }
}

/** The Sheet doesn't accept this phone's code any more, for example after its `active` cell was set to FALSE. */
export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AuthError"
  }
}

export function isNetworkError(e: unknown) {
  return e instanceof NetworkError
}

/** A failure worth retrying later, as opposed to the Sheet refusing the request. */
export function isRetryable(e: unknown) {
  return e instanceof NetworkError || e instanceof ServerError
}

export function isAuthError(e: unknown) {
  return e instanceof AuthError
}

/** What the connect screen says when a link doesn't work. */
export function connectErrorMessage(e: unknown) {
  if (isNetworkError(e)) return "Couldn't reach the tracker. Check the link."
  // The app's own page refuses a POST with 405, and any other page isn't the script's JSON.
  if (e instanceof ServerError && e.reason !== "busy")
    return "That link doesn't look like the tracker's script URL. It should end in /exec."
  return (e as Error).message
}

// Scripts from before the `auth` flag only send this message for a code they don't accept.
const OLD_AUTH_MESSAGE = /^That code is not valid/

const TIMEOUT_MS = 20_000

export function newId() {
  return crypto.randomUUID()
}

class RemoteBackend implements Backend {
  private conn: Connection
  constructor(conn: Connection) {
    this.conn = conn
  }

  private async call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
    // text/plain keeps this a "simple" request so the browser skips the CORS
    // preflight, which Apps Script web apps cannot answer.
    let res: Response
    try {
      res = await fetch(this.conn.api, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, code: this.conn.code, ...payload }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch {
      // fetch rejects with a TypeError when offline, and a timeout aborts it.
      throw new NetworkError()
    }
    if (!res.ok) throw new ServerError(`Server error ${res.status}`, "status", res.status)
    let data
    try {
      data = await res.json()
    } catch (e) {
      if ((e as Error).name === "TimeoutError" || (e as Error).name === "AbortError") throw new NetworkError()
      throw new ServerError("The tracker sent back something unexpected.", "format")
    }
    if (!data || typeof data !== "object")
      throw new ServerError("The tracker sent back something unexpected.", "format")
    if (!data.ok) {
      const message = String(data.error || "Request failed")
      if (data.retry) throw new ServerError(message, "busy")
      if (data.auth || OLD_AUTH_MESSAGE.test(message)) throw new AuthError(message)
      throw new Error(message)
    }
    return data.result as T
  }

  session() {
    return this.call<Session>("session")
  }
  list(days: number) {
    return this.call<LogEvent[]>("list", { days })
  }
  save(event: LogEvent) {
    return this.call<LogEvent>("save", { event })
  }
  async remove(id: string) {
    await this.call("delete", { id })
  }
  lightAlert(id: string) {
    return this.call<boolean>("lightAlert", { id })
  }
  setLight(light: LightState) {
    return this.call<LightState>("setLight", { light: { on: light.on, brightness: light.brightness } })
  }
  listAppointments() {
    return this.call<Appointment[]>("listAppointments")
  }
  saveAppointment(appointment: Appointment) {
    return this.call<Appointment>("saveAppointment", { appointment })
  }
  async removeAppointment(id: string) {
    await this.call("deleteAppointment", { id })
  }
  listPlaces() {
    return this.call<Place[]>("listPlaces")
  }
  savePlace(place: Place) {
    return this.call<Place>("savePlace", { place })
  }
  async removePlace(id: string) {
    await this.call("deletePlace", { id })
  }
}

const DEMO_KEY = "ct.demo.events"
const DEMO_APPTS_KEY = "ct.demo.appointments"
const DEMO_PLACES_KEY = "ct.demo.places"
const DEMO_LIGHT_KEY = "ct.demo.light"
const SAMPLE_PLACES: Place[] = [{ id: "p0", name: "Pediatric clinic", address: "100 Main St, Springfield" }]

/** A believable week of entries so the demo, and its reports, open with something to look at. */
function sampleEvents(): LogEvent[] {
  const H = 3_600_000
  const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * H).toISOString()
  // Small deterministic jitter so the week looks lived-in but the same on every load.
  let seed = 7
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const people = ["Mom", "Dad", "Grandma"]
  const events: LogEvent[] = []
  let n = 0
  const add = (type: LogEvent["type"], kind: string, h: number, extra: Partial<LogEvent> = {}) =>
    events.push({ id: `s${n++}`, type, kind, start: at(h), by: people[n % 3], createdAt: at(h), ...extra })

  const sides = ["left", "right"]
  let side = 0
  for (let h = 2.3; h < 7 * 24; h += 2.2 + rand() * 1.4) {
    const r = rand()
    if (r < 0.7) {
      const mins = 12 + Math.round(rand() * 14)
      add("feeding", sides[side++ % 2], h, { end: at(h - mins / 60), confidence: 2 + Math.round(rand() * 3) })
    } else {
      const offered = 60 + Math.round(rand() * 3) * 15
      add("feeding", r < 0.88 ? "formula" : "expressed", h, {
        end: at(h - 0.2),
        amountStartMl: offered,
        amountEndMl: Math.round(rand() * 3) * 5,
      })
    }
    const d = rand()
    add("diaper", d < 0.55 ? "wet" : d < 0.75 ? "both" : d < 0.88 ? "stool" : "dry", h - 0.4)
  }
  for (let h = 2.6, i = 0; h < 4 * 24; h += 4 + rand() * 1.5, i++) add("med", i % 2 ? "tylenol" : "ibuprofen", h)
  // A morning probiotic on each past day, with today's still to take.
  const sinceMidnight = (Date.now() - startOfToday()) / H
  for (let d = 1; d < 7; d++) add("med", "probiotic", sinceMidnight + 24 * (d - 1) + 15 - rand())
  // Vitamin D in a morning bottle, and a temperature or two a day, one of them a little warm.
  for (let d = 1; d < 7; d++) add("med", "vitamind", sinceMidnight + 24 * (d - 1) + 14 - rand())
  for (let h = 5; h < 7 * 24; h += 10 + rand() * 8)
    add("temp", rand() < 0.7 ? "rectal" : "armpit", h, { tempC: Math.round((36.8 + rand() * 0.7) * 10) / 10 })
  add("temp", "rectal", 60, { tempC: 38.1, notes: "A little warm after her shots" })
  return events
}

function sampleAppointments(): Appointment[] {
  const at = (days: number, hour: number) => {
    const d = new Date()
    d.setDate(d.getDate() + days)
    d.setHours(hour, 0, 0, 0)
    return d.toISOString()
  }
  return [
    { id: "a0", title: "Newborn checkup", start: at(-3, 10), end: at(-3, 11), location: SAMPLE_PLACES[0].address, placeName: "Pediatric clinic", by: "Mom", synced: true },
    { id: "a1", title: "Two-week checkup", start: at(4, 9), end: at(4, 10), location: SAMPLE_PLACES[0].address, placeName: "Pediatric clinic", notes: "Bring the feeding log", by: "Dad", synced: true },
    { id: "a2", title: "Lactation consultant", start: at(9, 14), by: "Mom", synced: true },
  ]
}

class DemoBackend implements Backend {
  private read(): LogEvent[] {
    try {
      const raw = localStorage.getItem(DEMO_KEY)
      if (raw === null) return sampleEvents()
      return JSON.parse(raw)
    } catch {
      return sampleEvents()
    }
  }
  private write(events: LogEvent[]) {
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify(events))
    } catch {
      // ignore
    }
  }
  async session(): Promise<Session> {
    let light: LightState = { on: false, brightness: 50 }
    try {
      light = JSON.parse(localStorage.getItem(DEMO_LIGHT_KEY) ?? "null") ?? light
    } catch {
      // ignore
    }
    return { user: "Demo", users: ["Demo"], settings: { ...DEFAULT_SETTINGS, lightControl: true }, light }
  }
  async list(days: number) {
    const since = Date.now() - days * 86_400_000
    return this.read().filter((e) => new Date(e.start).getTime() >= since)
  }
  async save(event: LogEvent) {
    const now = new Date().toISOString()
    const events = this.read()
    const i = events.findIndex((e) => e.id === event.id)
    const saved = { ...event, updatedAt: now, createdAt: event.createdAt || now }
    if (i >= 0) events[i] = saved
    else events.push(saved)
    this.write(events)
    return saved
  }
  async remove(id: string) {
    this.write(this.read().filter((e) => e.id !== id))
  }
  async lightAlert() {
    return false
  }
  async setLight(light: LightState) {
    const saved = { on: light.on, brightness: light.brightness, by: "Demo", at: new Date().toISOString() }
    try {
      localStorage.setItem(DEMO_LIGHT_KEY, JSON.stringify(saved))
    } catch {
      // ignore
    }
    return saved
  }
  private readAppointments(): Appointment[] {
    try {
      const raw = localStorage.getItem(DEMO_APPTS_KEY)
      return raw === null ? sampleAppointments() : JSON.parse(raw)
    } catch {
      return sampleAppointments()
    }
  }
  private writeAppointments(list: Appointment[]) {
    try {
      localStorage.setItem(DEMO_APPTS_KEY, JSON.stringify(list))
    } catch {
      // ignore
    }
  }
  async listAppointments() {
    return this.readAppointments()
  }
  async saveAppointment(appointment: Appointment) {
    const now = new Date().toISOString()
    const saved = { ...appointment, updatedAt: now, createdAt: appointment.createdAt || now, synced: true }
    this.writeAppointments([...this.readAppointments().filter((a) => a.id !== saved.id), saved])
    return saved
  }
  async removeAppointment(id: string) {
    this.writeAppointments(this.readAppointments().filter((a) => a.id !== id))
  }
  private readPlaces(): Place[] {
    try {
      const raw = localStorage.getItem(DEMO_PLACES_KEY)
      return raw === null ? SAMPLE_PLACES : JSON.parse(raw)
    } catch {
      return SAMPLE_PLACES
    }
  }
  private writePlaces(list: Place[]) {
    try {
      localStorage.setItem(DEMO_PLACES_KEY, JSON.stringify(list))
    } catch {
      // ignore
    }
  }
  async listPlaces() {
    return this.readPlaces()
  }
  async savePlace(place: Place) {
    this.writePlaces([...this.readPlaces().filter((p) => p.id !== place.id), place])
    return place
  }
  async removePlace(id: string) {
    this.writePlaces(this.readPlaces().filter((p) => p.id !== id))
  }
}

export function createBackend(conn: Connection): Backend {
  return conn.api === "demo" ? new DemoBackend() : new RemoteBackend(conn)
}
