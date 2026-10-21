import { useCallback, useEffect, useMemo, useState } from "react"

import { createBackend, isNetworkError, isOldScriptError, type Connection } from "@/lib/api"
import type { Appointment } from "@/lib/types"

const CACHE_KEY = "ct.appointments"
const POLL_MS = 5 * 60_000

/** Cached appointments, tagged with the personal code they belong to like the tracker's own cache. */
function readCache(owner: string | null): Appointment[] {
  if (!owner) return []
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as { owner: string; value: Appointment[] }
    return parsed?.owner === owner ? parsed.value : []
  } catch {
    return []
  }
}

function writeCache(owner: string | null, value: Appointment[]) {
  if (!owner) return
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ owner, value }))
  } catch {
    // The list just won't be there offline.
  }
}

/**
 * Appointments are few and planned ahead, so unlike feeds and diapers they save only while online: a
 * calendar copy that silently waits on one phone would be easy to miss.
 */
export function useAppointments(conn: Connection) {
  const backend = useMemo(() => createBackend(conn), [conn])
  const owner = conn.api === "demo" ? null : conn.code
  const [appointments, setAppointments] = useState<Appointment[]>(() => readCache(owner))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** The Sheet's script predates appointments and needs updating. */
  const [outdated, setOutdated] = useState(false)

  const store = useCallback(
    (next: Appointment[]) => {
      setAppointments(next)
      writeCache(owner, next)
    },
    [owner],
  )

  const refresh = useCallback(async () => {
    try {
      store(await backend.listAppointments())
      setError(null)
      setOutdated(false)
    } catch (e) {
      if (isOldScriptError(e)) setOutdated(true)
      else setError(isNetworkError(e) ? "Offline. Showing the last list this phone saw." : (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [backend, store])

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

  /** Throws when the Sheet can't be reached or refuses, so the form can stay open. */
  const save = useCallback(
    async (appointment: Appointment) => {
      const saved = await backend.saveAppointment(appointment)
      setAppointments((list) => {
        const next = [...list.filter((a) => a.id !== saved.id), saved]
        writeCache(owner, next)
        return next
      })
      return saved
    },
    [backend, owner],
  )

  const remove = useCallback(
    async (id: string) => {
      await backend.removeAppointment(id)
      setAppointments((list) => {
        const next = list.filter((a) => a.id !== id)
        writeCache(owner, next)
        return next
      })
    },
    [backend, owner],
  )

  return { appointments, loading, error, outdated, refresh, save, remove }
}

export type Appointments = ReturnType<typeof useAppointments>
