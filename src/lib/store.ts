/**
 * What this phone keeps for offline use, per personal code: the last session, the last list of entries from the
 * Sheet, and changes that haven't reached the Sheet yet. It lives in IndexedDB (see kv.ts) so the service worker
 * can sync while the app is closed. The app keeps a copy in memory as well, so its first screen can draw at once.
 */
import type { Connection } from "./api"
import { kvGetMany, kvSet, kvUpdate } from "./kv"
import type { LogEvent, Session } from "./types"

/** A change that hasn't reached the Sheet yet. */
export type NewOp = { op: "save"; event: LogEvent } | { op: "delete"; id: string }
/** `qid` tells queued changes apart, so the one that was sent is the one removed. */
export type QueuedOp = NewOp & { qid: string }

/** The last list from the Sheet, and when it arrived. */
export interface CachedEvents {
  list: LogEvent[]
  at?: number
  /** When the list last changed here at all, including single entries patched in. Tells which copy is newer. */
  rev?: number
}

export interface Snapshot {
  session?: Session
  events: CachedEvents
  queue: QueuedOp[]
}

const CONN_KEY = "conn"
const keys = (owner: string) => ({
  session: `session:${owner}`,
  events: `events:${owner}`,
  queue: `queue:${owner}`,
})

// --- Pure helpers ---------------------------------------------------------------------------------------------

/** Adds a change to the queue. A newer save of the same entry replaces the older one; a delete must still follow any save. */
export function addToQueue(queue: QueuedOp[], op: NewOp, qid: string): QueuedOp[] {
  const rest = op.op === "save" ? queue.filter((q) => q.op !== "save" || q.event.id !== op.event.id) : queue
  return [...rest, { ...op, qid }]
}

/** Lays changes that are still waiting to sync over a list from the Sheet. */
export function withQueued(list: LogEvent[], queue: QueuedOp[]) {
  let out = list
  for (const q of queue) out = q.op === "save" ? upsert(out, q.event) : without(out, q.id)
  return out
}

export function upsert(list: LogEvent[], event: LogEvent) {
  return [...list.filter((e) => e.id !== event.id), event]
}

export function without(list: LogEvent[], id: string) {
  return list.filter((e) => e.id !== id)
}

function qid() {
  return crypto.randomUUID()
}

// --- Memory copy ----------------------------------------------------------------------------------------------

const memory = new Map<string, Snapshot>()

/** What was last loaded or written for this code, without waiting. Undefined until loadOwner has run once. */
export function peek(owner: string): Snapshot | undefined {
  return memory.get(owner)
}

function remember(owner: string, patch: Partial<Snapshot>) {
  const prev = memory.get(owner) ?? { events: { list: [] }, queue: [] }
  memory.set(owner, { ...prev, ...patch })
}

// --- Moving over from the localStorage keys of earlier versions -------------------------------------------------

const LEGACY = { session: "ct.session", events: "ct.events", queue: "ct.queue" } as const

function takeLegacy<T>(key: string, owner: string): T | undefined {
  try {
    if (typeof localStorage === "undefined") return undefined
    const raw = localStorage.getItem(key)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as { owner?: string; value?: T }
    return parsed?.owner === owner && parsed.value != null ? parsed.value : undefined
  } catch {
    return undefined
  }
}

function dropLegacy(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

async function migrate(owner: string) {
  const k = keys(owner)
  const queue = takeLegacy<NewOp[]>(LEGACY.queue, owner)
  if (queue?.length) {
    // Appended to anything already there, so nothing waiting to sync is lost.
    await kvUpdate<QueuedOp[]>(k.queue, (q) => queue.reduce((acc, op) => addToQueue(acc, op, qid()), q ?? []))
  }
  if (queue) dropLegacy(LEGACY.queue)

  const events = takeLegacy<LogEvent[]>(LEGACY.events, owner)
  if (events) {
    await kvUpdate<CachedEvents>(k.events, (cached) => cached ?? { list: events })
    dropLegacy(LEGACY.events)
  }

  const session = takeLegacy<Session>(LEGACY.session, owner)
  if (session) {
    await kvUpdate<Session>(k.session, (s) => s ?? session)
    dropLegacy(LEGACY.session)
  }
}

// --- Reading and writing --------------------------------------------------------------------------------------

/** Reads everything kept for this code into memory, moving over data from older versions of the app first. */
export async function loadOwner(owner: string): Promise<Snapshot> {
  await migrate(owner)
  const k = keys(owner)
  const values = await kvGetMany([k.session, k.events, k.queue])
  const snapshot: Snapshot = {
    session: (values[k.session] as Session | undefined) ?? undefined,
    events: (values[k.events] as CachedEvents | undefined) ?? { list: [] },
    queue: (values[k.queue] as QueuedOp[] | undefined) ?? [],
  }
  memory.set(owner, snapshot)
  return snapshot
}

export async function saveSession(owner: string, session: Session | null) {
  remember(owner, { session: session ?? undefined })
  await kvSet(keys(owner).session, session ?? undefined)
}

/** A fresh list from the Sheet. */
export async function saveEvents(owner: string, list: LogEvent[], at = Date.now()) {
  const events = { list, at, rev: at }
  remember(owner, { events })
  await kvSet(keys(owner).events, events)
}

/** Changes the saved list without counting as a fresh copy from the Sheet, e.g. after one entry was saved. */
export async function patchEvents(owner: string, change: (list: LogEvent[]) => LogEvent[]) {
  const next = await kvUpdate<CachedEvents>(keys(owner).events, (cached) => ({
    list: change(cached?.list ?? []),
    at: cached?.at,
    rev: Date.now(),
  }))
  remember(owner, { events: next })
  return next
}

export async function readQueue(owner: string): Promise<QueuedOp[]> {
  const [queue] = Object.values(await kvGetMany([keys(owner).queue])) as (QueuedOp[] | undefined)[]
  remember(owner, { queue: queue ?? [] })
  return queue ?? []
}

export async function enqueue(owner: string, op: NewOp): Promise<QueuedOp[]> {
  const queue = await kvUpdate<QueuedOp[]>(keys(owner).queue, (q) => addToQueue(q ?? [], op, qid()))
  remember(owner, { queue })
  return queue
}

/** Removes a change once it has reached the Sheet (or been refused for good). */
export async function dequeue(owner: string, id: string): Promise<QueuedOp[]> {
  const queue = await kvUpdate<QueuedOp[]>(keys(owner).queue, (q) => (q ?? []).filter((op) => op.qid !== id))
  remember(owner, { queue })
  return queue
}

/** The service worker needs the Sheet's address and the code to sync on its own. */
export async function saveConn(conn: Connection | null) {
  await kvSet(CONN_KEY, conn && conn.api !== "demo" ? { api: conn.api, code: conn.code } : undefined)
}

export async function readConn(): Promise<Connection | null> {
  const values = await kvGetMany([CONN_KEY])
  return (values[CONN_KEY] as Connection | undefined) ?? null
}
