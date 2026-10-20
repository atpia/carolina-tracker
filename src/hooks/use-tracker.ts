import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { createBackend, type Connection } from "@/lib/api"
import { DEFAULT_SETTINGS, type LogEvent, type Session } from "@/lib/types"

const POLL_MS = 30_000

export function useTracker(conn: Connection) {
  const backend = useMemo(() => createBackend(conn), [conn])
  const [session, setSession] = useState<Session | null>(null)
  const [events, setEvents] = useState<LogEvent[]>([])
  const [days, setDays] = useState(7)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(0)

  const refresh = useCallback(async () => {
    // Skip a poll while a save is in flight so it can't overwrite the optimistic update.
    if (pending.current > 0) return
    try {
      const list = await backend.list(days)
      if (pending.current === 0) setEvents(list)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [backend, days])

  useEffect(() => {
    backend
      .session()
      .then(setSession)
      .catch((e) => setError((e as Error).message))
  }, [backend])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, POLL_MS)
    const onFocus = () => document.visibilityState === "visible" && refresh()
    document.addEventListener("visibilitychange", onFocus)
    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", onFocus)
    }
  }, [refresh])

  /** Make sure entries at least this many days back are loaded. */
  const ensureDays = useCallback((n: number) => setDays((d) => Math.max(d, Math.ceil(n))), [])

  const save = useCallback(
    async (event: LogEvent) => {
      const previous = events
      setEvents((list) => [...list.filter((e) => e.id !== event.id), event])
      pending.current++
      try {
        const saved = await backend.save(event)
        setEvents((list) => [...list.filter((e) => e.id !== saved.id), saved])
      } catch (e) {
        setEvents(previous)
        toast.error(`Couldn't save: ${(e as Error).message}`)
        throw e
      } finally {
        pending.current--
      }
    },
    [backend, events],
  )

  const remove = useCallback(
    async (id: string) => {
      const previous = events
      setEvents((list) => list.filter((e) => e.id !== id))
      pending.current++
      try {
        await backend.remove(id)
      } catch (e) {
        setEvents(previous)
        toast.error(`Couldn't delete: ${(e as Error).message}`)
      } finally {
        pending.current--
      }
    },
    [backend, events],
  )

  return {
    user: session?.user ?? "",
    users: session?.users ?? [],
    settings: session?.settings ?? DEFAULT_SETTINGS,
    sessionError: !session ? error : null,
    events,
    loading,
    error,
    days,
    loadMore: () => setDays((d) => d + 14),
    ensureDays,
    refresh,
    save,
    remove,
  }
}

export type Tracker = ReturnType<typeof useTracker>
