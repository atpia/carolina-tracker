import { DEFAULT_SETTINGS, type LogEvent, type Session } from "./types"

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

export function isNetworkError(e: unknown) {
  return e instanceof NetworkError
}

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
    let data
    try {
      const res = await fetch(this.conn.api, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, code: this.conn.code, ...payload }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      data = await res.json()
    } catch (e) {
      // fetch rejects with a TypeError when offline, and a timeout aborts it.
      if (e instanceof TypeError || (e as Error).name === "TimeoutError" || (e as Error).name === "AbortError")
        throw new NetworkError()
      throw e
    }
    if (!data.ok) throw new Error(data.error || "Request failed")
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
}

const DEMO_KEY = "ct.demo.events"

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
  return events
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
    return { user: "Demo", users: ["Demo"], settings: DEFAULT_SETTINGS }
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
}

export function createBackend(conn: Connection): Backend {
  return conn.api === "demo" ? new DemoBackend() : new RemoteBackend(conn)
}
