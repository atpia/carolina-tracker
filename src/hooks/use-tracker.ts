import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { createBackend, isRetryable, type Connection } from "@/lib/api"
import { DEFAULT_SETTINGS, type LogEvent, type Session } from "@/lib/types"

const POLL_MS = 30_000
const SESSION_KEY = "ct.session"
const EVENTS_KEY = "ct.events"
const QUEUE_KEY = "ct.queue"

/** A change that hasn't reached the Sheet yet because the phone was offline. */
type QueuedOp = { op: "save"; event: LogEvent } | { op: "delete"; id: string }

function definedOnly<T extends object>(obj: T | undefined): Partial<T> {
  if (!obj) return {}
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && !Number.isNaN(v)),
  ) as Partial<T>
}

/** Stored data is tagged with the personal code it belongs to, so a different sign-in never sees it. */
function readStored<T>(key: string, owner: string | null): T | undefined {
  if (!owner) return undefined
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? (JSON.parse(raw) as { owner: string; value: T }) : undefined
    return parsed?.owner === owner ? parsed.value : undefined
  } catch {
    return undefined
  }
}

function writeStored(key: string, owner: string | null, value: unknown) {
  if (!owner) return
  try {
    localStorage.setItem(key, JSON.stringify({ owner, value }))
  } catch {
    // Storage can be full or unavailable; the app still works, just not offline.
  }
}

/** Lay changes that are still waiting to sync over a list from the Sheet. */
function withQueued(list: LogEvent[], queue: QueuedOp[]) {
  let out = list
  for (const q of queue) {
    out = q.op === "save" ? [...out.filter((e) => e.id !== q.event.id), q.event] : out.filter((e) => e.id !== q.id)
  }
  return out
}

export function useTracker(conn: Connection) {
  const backend = useMemo(() => createBackend(conn), [conn])
  // The demo keeps its own data, so only a real sign-in is cached for offline use.
  const owner = conn.api === "demo" ? null : conn.code
  const queue = useRef<QueuedOp[]>(readStored<QueuedOp[]>(QUEUE_KEY, owner) ?? [])
  const [queued, setQueued] = useState(queue.current.length)
  const [session, setSession] = useState<Session | null>(() => readStored<Session>(SESSION_KEY, owner) ?? null)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [events, setEvents] = useState<LogEvent[]>(() =>
    withQueued(readStored<LogEvent[]>(EVENTS_KEY, owner) ?? [], queue.current),
  )
  const [days, setDays] = useState(7)
  const [loadedDays, setLoadedDays] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(0)
  // Bumped on every save or delete, so a poll that started before one can't overwrite it.
  const mutations = useRef(0)
  const flushing = useRef(false)

  const setQueue = useCallback(
    (next: QueuedOp[]) => {
      queue.current = next
      writeStored(QUEUE_KEY, owner, next)
      setQueued(next.length)
    },
    [owner],
  )

  const enqueue = useCallback(
    (op: QueuedOp) => {
      // A newer save of the same entry replaces the older one; a delete must still follow any save.
      const rest =
        op.op === "save" ? queue.current.filter((q) => q.op !== "save" || q.event.id !== op.event.id) : queue.current
      setQueue([...rest, op])
    },
    [setQueue],
  )

  /** Send waiting changes in order. Stops at the first one that still can't get through. */
  const flush = useCallback(async () => {
    if (flushing.current) return
    flushing.current = true
    try {
      while (queue.current.length) {
        const next = queue.current[0]
        try {
          if (next.op === "save") await backend.save(next.event)
          else await backend.remove(next.id)
        } catch (e) {
          // Offline, or the Sheet hiccuped: keep it and try again on the next poll.
          if (isRetryable(e)) return
          toast.error(`Couldn't sync an entry: ${(e as Error).message}`)
        }
        mutations.current++
        setQueue(queue.current.filter((q) => q !== next))
      }
    } finally {
      flushing.current = false
    }
  }, [backend, setQueue])

  const loadSession = useCallback(async () => {
    try {
      const s = await backend.session()
      setSession(s)
      setSessionError(null)
      writeStored(SESSION_KEY, owner, s)
    } catch (e) {
      setSessionError((e as Error).message)
    }
  }, [backend, owner])

  const refresh = useCallback(async () => {
    // Skip a poll while a save is in flight so it can't overwrite the optimistic update.
    if (pending.current > 0) return
    await flush()
    const seen = mutations.current
    try {
      const list = await backend.list(days)
      if (pending.current === 0 && mutations.current === seen) {
        setEvents(withQueued(list, queue.current))
        writeStored(EVENTS_KEY, owner, list)
        setLoadedDays(days)
      }
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [backend, days, flush, owner])

  useEffect(() => {
    loadSession()
  }, [loadSession])

  // Keep retrying the session in the background while only a cached one (or none) is available.
  useEffect(() => {
    if (!sessionError) return
    const id = setInterval(loadSession, POLL_MS)
    return () => clearInterval(id)
  }, [sessionError, loadSession])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, POLL_MS)
    const onFocus = () => document.visibilityState === "visible" && refresh()
    document.addEventListener("visibilitychange", onFocus)
    window.addEventListener("online", refresh)
    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", onFocus)
      window.removeEventListener("online", refresh)
    }
  }, [refresh])

  /** Make sure entries at least this many days back are loaded. */
  const ensureDays = useCallback((n: number) => setDays((d) => Math.max(d, Math.ceil(n))), [])

  const save = useCallback(
    async (event: LogEvent) => {
      let before: LogEvent | undefined
      setEvents((list) => {
        before = list.find((e) => e.id === event.id)
        return [...list.filter((e) => e.id !== event.id), event]
      })
      pending.current++
      mutations.current++
      try {
        // Anything already waiting goes first, so changes reach the Sheet in the order they were made.
        if (queue.current.length) {
          enqueue({ op: "save", event })
          flush()
          return
        }
        const saved = await backend.save(event)
        setEvents((list) => [...list.filter((e) => e.id !== saved.id), saved])
      } catch (e) {
        if (isRetryable(e)) {
          enqueue({ op: "save", event })
          toast.info("Saved on this phone. It will sync when the connection is back.")
          return
        }
        // Undo just this change, leaving anything saved in the meantime alone.
        setEvents((list) => {
          const rest = list.filter((x) => x.id !== event.id)
          return before ? [...rest, before] : rest
        })
        toast.error(`Couldn't save: ${(e as Error).message}`)
        throw e
      } finally {
        pending.current--
      }
    },
    [backend, enqueue, flush],
  )

  const remove = useCallback(
    async (id: string) => {
      let removed: LogEvent | undefined
      setEvents((list) => {
        removed = list.find((e) => e.id === id)
        return list.filter((e) => e.id !== id)
      })
      pending.current++
      mutations.current++
      try {
        if (queue.current.length) {
          enqueue({ op: "delete", id })
          flush()
          return
        }
        await backend.remove(id)
      } catch (e) {
        if (isRetryable(e)) {
          enqueue({ op: "delete", id })
          return
        }
        setEvents((list) => (removed && !list.some((x) => x.id === id) ? [...list, removed] : list))
        toast.error(`Couldn't delete: ${(e as Error).message}`)
      } finally {
        pending.current--
      }
    },
    [backend, enqueue, flush],
  )

  // Fill gaps from defaults so an older Sheet script without newer settings still works.
  const settings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...definedOnly(session?.settings) }), [session])

  return {
    user: session?.user ?? "",
    users: session?.users ?? [],
    settings,
    sessionError: !session ? sessionError : null,
    events,
    loading,
    error,
    /** Changes saved on this phone that haven't reached the Sheet yet. */
    queued,
    days,
    loadedDays,
    loadMore: () => setDays((d) => d + 14),
    ensureDays,
    refresh,
    save,
    remove,
  }
}

export type Tracker = ReturnType<typeof useTracker>
