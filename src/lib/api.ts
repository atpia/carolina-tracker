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
    const res = await fetch(this.conn.api, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, code: this.conn.code, ...payload }),
    })
    if (!res.ok) throw new Error(`Server error ${res.status}`)
    const data = await res.json()
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

class DemoBackend implements Backend {
  private read(): LogEvent[] {
    try {
      return JSON.parse(localStorage.getItem(DEMO_KEY) || "[]")
    } catch {
      return []
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
