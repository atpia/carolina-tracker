import { useCallback, useEffect, useMemo, useState } from "react"

import { createBackend, isNetworkError, isOldScriptError, type Connection } from "@/lib/api"
import type { Appointment, Place } from "@/lib/types"

const CACHE_KEY = "ct.appointments"
const PLACES_KEY = "ct.places"
const POLL_MS = 5 * 60_000

/** Cached appointments, tagged with the personal code they belong to like the tracker's own cache. */
function readCache<T>(owner: string | null, key = CACHE_KEY): T[] {
  if (!owner) return []
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "null") as { owner: string; value: T[] }
    return parsed?.owner === owner ? parsed.value : []
  } catch {
    return []
  }
}

function writeCache(owner: string | null, value: unknown[], key = CACHE_KEY) {
  if (!owner) return
  try {
    localStorage.setItem(key, JSON.stringify({ owner, value }))
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
  const [places, setPlaces] = useState<Place[]>(() => readCache(owner, PLACES_KEY))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** The Sheet's script predates appointments and needs updating. */
  const [outdated, setOutdated] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [list, saved] = await Promise.all([
        backend.listAppointments(),
        // A script from before saved places still has appointments, so it just shows none.
        backend.listPlaces().catch((e) => {
          if (isOldScriptError(e)) return []
          throw e
        }),
      ])
      setAppointments(list)
      writeCache(owner, list)
      setPlaces(saved)
      writeCache(owner, saved, PLACES_KEY)
      setError(null)
      setOutdated(false)
    } catch (e) {
      if (isOldScriptError(e)) setOutdated(true)
      else setError(isNetworkError(e) ? "Offline. Showing the last list this phone saw." : (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [backend, owner])

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

  const savePlace = useCallback(
    async (place: Place) => {
      const saved = await backend.savePlace(place)
      setPlaces((list) => {
        const next = [...list.filter((p) => p.id !== saved.id), saved]
        writeCache(owner, next, PLACES_KEY)
        return next
      })
      return saved
    },
    [backend, owner],
  )

  const removePlace = useCallback(
    async (id: string) => {
      await backend.removePlace(id)
      setPlaces((list) => {
        const next = list.filter((p) => p.id !== id)
        writeCache(owner, next, PLACES_KEY)
        return next
      })
    },
    [backend, owner],
  )

  const sortedPlaces = useMemo(() => [...places].sort((a, b) => a.name.localeCompare(b.name)), [places])

  return {
    appointments,
    places: sortedPlaces,
    loading,
    error,
    outdated,
    refresh,
    save,
    remove,
    savePlace,
    removePlace,
  }
}

export type Appointments = ReturnType<typeof useAppointments>
