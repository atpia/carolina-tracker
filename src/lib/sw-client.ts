/**
 * The app's side of the service worker (src/sw/sw.ts): registering it, hearing from it, and asking it to sync.
 */
import { MSG_LAUNCH, MSG_SYNCED, REFRESH_TAG, SYNC_TAG } from "./sync"

type SyncRegistration = ServiceWorkerRegistration & {
  sync?: { register(tag: string): Promise<void> }
  periodicSync?: { register(tag: string, options: { minInterval: number }): Promise<void> }
}

const synced = new Set<() => void>()
const launches = new Set<(url: string) => void>()
const updates = new Set<() => void>()

const UPDATE_CHECK_MS = 15 * 60_000

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return
  const container = navigator.serviceWorker
  const hadWorker = !!container.controller
  container.addEventListener("controllerchange", () => {
    // The very first install takes over the page without changing it. Later ones bring a new version.
    if (hadWorker) updates.forEach((l) => l())
  })
  container.addEventListener("message", (event) => {
    const data = event.data as { type?: string; url?: string } | null
    if (data?.type === MSG_SYNCED) synced.forEach((l) => l())
    if (data?.type === MSG_LAUNCH && data.url) launches.forEach((l) => l(data.url!))
  })
  container
    .register("./sw.js")
    .then((reg) => {
      // A phone can keep the app open in the background for days, so look for a new version when it comes back.
      let checked = Date.now()
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "visible" || Date.now() - checked < UPDATE_CHECK_MS) return
        checked = Date.now()
        reg.update().catch(() => {})
      })
      return registerPeriodicRefresh(reg)
    })
    .catch(() => {
      // Without it the app still works, it just needs a connection to open.
    })
  // Ask the browser not to clear the saved data when space runs low. Entries waiting to sync are kept there.
  navigator.storage
    ?.persisted?.()
    .then((yes) => yes || navigator.storage.persist())
    .catch(() => {})
}

/** Android Chrome refreshes an installed app's data now and then while it's closed, if the browser allows it. */
async function registerPeriodicRefresh(reg: SyncRegistration) {
  if (!reg.periodicSync) return
  try {
    const status = await navigator.permissions.query({ name: "periodic-background-sync" as PermissionName })
    if (status.state === "granted") await reg.periodicSync.register(REFRESH_TAG, { minInterval: 60 * 60_000 })
  } catch {
    // Not offered on this phone.
  }
}

/** The active worker, or null without one (the dev server and the demo build don't register it). */
export async function workerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return reg?.active ? reg : null
}

/**
 * Asks Android to send waiting entries as soon as there's a connection, even if the app has been closed by then.
 * iPhones don't offer this; there the app sends them when it's next open, or the worker when a reminder arrives.
 */
export async function requestBackgroundSync() {
  try {
    const reg = (await workerRegistration()) as SyncRegistration | null
    await reg?.sync?.register(SYNC_TAG)
  } catch {
    // Not offered on this phone.
  }
}

/** The worker synced in the background: the saved data changed. */
export function onWorkerSynced(listener: () => void) {
  synced.add(listener)
  return () => {
    synced.delete(listener)
  }
}

/** A notification tap asked the open app to show something, e.g. …/?edit=<id>. */
export function onWorkerLaunch(listener: (url: string) => void) {
  launches.add(listener)
  return () => {
    launches.delete(listener)
  }
}

/** A new version took over while the app was open. */
export function onUpdateReady(listener: () => void) {
  updates.add(listener)
  return () => {
    updates.delete(listener)
  }
}
