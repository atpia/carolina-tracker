import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "@/components/ui/toast"

import { entryName } from "@/components/describe"
import { createBackend, isAuthError, isNetworkError, isRetryable, newId, type Connection } from "@/lib/api"
import * as store from "@/lib/store"
import { addToQueue, upsert, withQueued, without, type NewOp, type QueuedOp } from "@/lib/store"
import { onWorkerSynced, requestBackgroundSync } from "@/lib/sw-client"
import { flushQueue } from "@/lib/sync"
import { DEFAULT_SETTINGS, type DiscordState, type LightState, type LogEvent, type Session } from "@/lib/types"

const POLL_MS = 30_000

/** Why the last refresh failed: no connection at all, or the Sheet's side had a problem. */
export type SyncError = { kind: "network" | "server"; message: string }

function definedOnly<T extends object>(obj: T | undefined): Partial<T> {
  if (!obj) return {}
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && !Number.isNaN(v)),
  ) as Partial<T>
}

export function useTracker(conn: Connection) {
  const backend = useMemo(() => createBackend(conn), [conn])
  // The demo keeps its own data, so only a real sign-in is saved for offline use.
  const owner = conn.api === "demo" ? null : conn.code
  // Loaded before the app first draws (main.tsx), so the last known data shows at once, even offline.
  const [initial] = useState(() => (owner ? store.peek(owner) : undefined))
  const queue = useRef<QueuedOp[]>(initial?.queue ?? [])
  const [queued, setQueued] = useState(queue.current.length)
  const [session, setSession] = useState<Session | null>(initial?.session ?? null)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [events, setEvents] = useState<LogEvent[]>(() => withQueued(initial?.events.list ?? [], queue.current))
  /** When the list last came from the Sheet, on this phone or by the service worker. */
  const [syncedAt, setSyncedAt] = useState<number | undefined>(initial?.events.at)
  const [days, setDays] = useState(7)
  const [loadedDays, setLoadedDays] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<SyncError | null>(null)
  const pending = useRef(0)
  // Bumped on every save or delete, so a poll that started before one can't overwrite it.
  const mutations = useRef(0)
  const flushing = useRef(false)
  /** How new the list on screen is, so an older saved copy read back later doesn't replace it. */
  const shownRev = useRef(initial?.events.rev ?? initial?.events.at ?? 0)

  const setQueue = useCallback((next: QueuedOp[]) => {
    queue.current = next
    setQueued(next.length)
  }, [])

  /** Keep a change for later. Saved where the service worker can send it, even after the app is closed. */
  const enqueue = useCallback(
    async (op: NewOp) => {
      if (!owner) return setQueue(addToQueue(queue.current, op, newId()))
      setQueue(await store.enqueue(owner, op))
      requestBackgroundSync()
    },
    [owner, setQueue],
  )

  /** Lay the saved copy over what's on screen, e.g. after the service worker synced in the background. */
  const reloadSaved = useCallback(async () => {
    if (!owner) return
    const seen = mutations.current
    const saved = await store.loadOwner(owner)
    if (pending.current > 0 || mutations.current !== seen) return
    setQueue(saved.queue)
    if (saved.session) setSession(saved.session)
    const rev = saved.events.rev ?? saved.events.at ?? 0
    if (rev < shownRev.current) return
    shownRev.current = rev
    setEvents(withQueued(saved.events.list, saved.queue))
    setSyncedAt(saved.events.at)
  }, [owner, setQueue])

  // Signing in on this phone without a reload (or a slow first read) means the saved copy wasn't loaded yet.
  useEffect(() => {
    if (owner && !initial) reloadSaved().catch(() => {})
  }, [owner, initial, reloadSaved])

  // The service worker keeps the Sheet's address and code, to sync while the app is closed.
  useEffect(() => {
    store.saveConn(owner ? conn : null).catch(() => {})
  }, [conn, owner])

  useEffect(() => onWorkerSynced(() => void reloadSaved().catch(() => {})), [reloadSaved])

  /**
   * The Sheet stopped accepting this code, for example after its `active` cell was set to FALSE. Forget the
   * saved sign-in so the sign-in screen shows. Queued entries stay saved under the code.
   */
  const onAuthError = useCallback(
    (e: unknown) => {
      if (!isAuthError(e)) return false
      if (owner) store.saveSession(owner, null).catch(() => {})
      setSession(null)
      setSessionError((e as Error).message)
      return true
    },
    [owner],
  )

  /** Send waiting changes in order. Stops at the first one that still can't get through. */
  const flush = useCallback(async () => {
    if (!owner || flushing.current) return
    flushing.current = true
    try {
      const result = await flushQueue(backend, owner, (op, e) => {
        const what = op.op === "save" ? entryName(op.event) : "a deleted entry"
        toast.add({ title: `Couldn't sync ${what}`, description: e.message, type: "error" })
      })
      if (result.sent) mutations.current++
      if (result.status === "auth") onAuthError(result.error)
      setQueue(await store.readQueue(owner))
    } catch {
      // Storage trouble: the changes stay queued and the next poll tries again.
    } finally {
      flushing.current = false
    }
  }, [backend, owner, setQueue, onAuthError])

  const loadSession = useCallback(async () => {
    try {
      const s = await backend.session()
      setSession(s)
      setSessionError(null)
      if (owner) store.saveSession(owner, s).catch(() => {})
    } catch (e) {
      if (!onAuthError(e)) setSessionError((e as Error).message)
    }
  }, [backend, owner, onAuthError])

  const refresh = useCallback(async () => {
    // Skip a poll while a save is in flight so it can't overwrite the optimistic update.
    if (pending.current > 0) return
    await flush()
    const seen = mutations.current
    try {
      const list = await backend.list(days)
      if (pending.current === 0 && mutations.current === seen) {
        const at = Date.now()
        shownRev.current = at
        setEvents(withQueued(list, queue.current))
        setLoadedDays(days)
        setSyncedAt(at)
        if (owner) store.saveEvents(owner, list, at).catch(() => {})
      }
      setError(null)
    } catch (e) {
      if (!onAuthError(e)) setError({ kind: isNetworkError(e) ? "network" : "server", message: (e as Error).message })
    } finally {
      setLoading(false)
    }
  }, [backend, days, flush, owner, onAuthError])

  useEffect(() => {
    loadSession()
  }, [loadSession])

  // Keep retrying the session in the background while only a saved one (or none) is available.
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
    /** quiet leaves telling about a failed save to the caller. */
    async (event: LogEvent, { quiet = false }: { quiet?: boolean } = {}) => {
      let before: LogEvent | undefined
      setEvents((list) => {
        before = list.find((e) => e.id === event.id)
        return upsert(list, event)
      })
      pending.current++
      mutations.current++
      try {
        // Anything already waiting goes first, so changes reach the Sheet in the order they were made.
        if (queue.current.length) {
          await enqueue({ op: "save", event })
          flush()
          return
        }
        const saved = await backend.save(event)
        setEvents((list) => upsert(list, saved))
        // Into the offline copy straight away, so it's there if the app is closed before the next poll.
        if (owner) store.patchEvents(owner, (list) => upsert(list, saved)).catch(() => {})
      } catch (e) {
        if (isRetryable(e)) {
          await enqueue({ op: "save", event })
          toast.add({
            title: "Saved on this phone",
            description: "It will sync when the connection is back.",
            type: "info",
          })
          return
        }
        if (isAuthError(e)) {
          await enqueue({ op: "save", event })
          onAuthError(e)
          return
        }
        // Undo just this change, leaving anything saved in the meantime alone.
        setEvents((list) => {
          const rest = without(list, event.id)
          return before ? [...rest, before] : rest
        })
        if (!quiet) toast.add({ title: "Couldn't save", description: (e as Error).message, type: "error" })
        throw e
      } finally {
        pending.current--
      }
    },
    [backend, enqueue, flush, onAuthError, owner],
  )

  const remove = useCallback(
    async (id: string) => {
      let removed: LogEvent | undefined
      setEvents((list) => {
        removed = list.find((e) => e.id === id)
        return without(list, id)
      })
      pending.current++
      mutations.current++
      try {
        if (queue.current.length) {
          await enqueue({ op: "delete", id })
          flush()
          return
        }
        await backend.remove(id)
        if (owner) store.patchEvents(owner, (list) => without(list, id)).catch(() => {})
      } catch (e) {
        if (isRetryable(e) || isAuthError(e)) {
          await enqueue({ op: "delete", id })
          onAuthError(e)
          return
        }
        setEvents((list) => (removed && !list.some((x) => x.id === id) ? [...list, removed] : list))
        toast.add({ title: "Couldn't delete", description: (e as Error).message, type: "error" })
      } finally {
        pending.current--
      }
    },
    [backend, enqueue, flush, onAuthError, owner],
  )

  const lightAlert = useCallback((id: string) => backend.lightAlert(id), [backend])
  const setLight = useCallback((light: LightState) => backend.setLight(light), [backend])
  const getLight = useCallback(() => backend.getLight(), [backend])

  /** Turn the Sheet's Discord messages on or off for everyone, and keep the answer for offline starts. */
  const setDiscord = useCallback(
    async (on: boolean): Promise<DiscordState> => {
      const { discord } = await backend.setDiscord(on)
      setSession((s) => {
        if (!s) return s
        const next = { ...s, settings: { ...s.settings, discord } }
        if (owner) store.saveSession(owner, next).catch(() => {})
        return next
      })
      return discord
    },
    [backend, owner],
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
    /** When the entries on screen last came from the Sheet. Undefined before the first sync on this phone. */
    syncedAt,
    days,
    loadedDays,
    loadMore: () => setDays((d) => d + 14),
    ensureDays,
    refresh,
    save,
    remove,
    lightAlert,
    getLight,
    setLight,
    setDiscord,
  }
}

export type Tracker = ReturnType<typeof useTracker>
