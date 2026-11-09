/**
 * The service worker: it lets the app open instantly, even offline or on a slow connection, and syncs in the
 * background where phones allow it.
 *
 * - Opening: every file the app needs is saved when this version installs, and the app always opens from those
 *   copies, never waiting on the network. A new version downloads in the background and is used from the next launch.
 * - Syncing: entries saved offline are sent, and the offline copy refreshed, whenever a reminder arrives (iPhone and
 *   Android), when the connection comes back (Android's Background Sync), and now and then while the installed app
 *   is closed (Android's Periodic Background Sync). The app itself also syncs whenever it's open.
 * - The running feed's notification: the Sheet sends it to every phone when a feed starts and ends, and its Stop
 *   button (Android) stops the feed without opening the app.
 *
 * Built into dist/sw.js by the service-worker plugin in vite.config.ts, which fills in __PRECACHE__ and __VERSION__.
 */
import { createBackend, isRetryable, setPushEndpoint } from "../lib/api"
import {
  canShowActions,
  FEED_DONE_TAG,
  FEED_SHOWN_KEY,
  FEED_TAG,
  feedSig,
  runningFeedNotice,
  STOP_ACTION,
  stoppedFeedNotice,
  type FeedPush,
  type NotificationSpec,
  type RichNotificationOptions,
} from "../lib/feed-notice"
import { kvInit, kvSet } from "../lib/kv"
import { enqueue, patchEvents, readConn, upsert } from "../lib/store"
import { flushQueue, MSG_LAUNCH, MSG_SYNCED, pullEvents, REFRESH_TAG, SYNC_TAG } from "../lib/sync"
import type { LogEvent } from "../lib/types"

declare const __PRECACHE__: string[]
declare const __VERSION__: string

// The parts of the service worker API used here. TypeScript's DOM types don't include them, and its WebWorker
// types can't be mixed with the DOM types the shared code is checked against.
interface ExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void
}
interface FetchEvent extends ExtendableEvent {
  readonly request: Request
  respondWith(response: Response | Promise<Response>): void
}
interface PushEvent extends ExtendableEvent {
  readonly data: { json(): unknown; text(): string } | null
}
interface NotificationEvent extends ExtendableEvent {
  readonly notification: Notification
  readonly action: string
}
interface SyncEvent extends ExtendableEvent {
  readonly tag: string
}
interface WindowClient {
  readonly url: string
  focus(): Promise<WindowClient>
  postMessage(message: unknown): void
}
interface WorkerScope {
  readonly registration: ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }
  readonly clients: {
    matchAll(options?: { type?: "window"; includeUncontrolled?: boolean }): Promise<WindowClient[]>
    openWindow(url: string): Promise<WindowClient | null>
    claim(): Promise<void>
  }
  skipWaiting(): Promise<void>
  addEventListener(type: "install" | "activate", listener: (event: ExtendableEvent) => void): void
  addEventListener(type: "fetch", listener: (event: FetchEvent) => void): void
  addEventListener(type: "push", listener: (event: PushEvent) => void): void
  addEventListener(type: "notificationclick", listener: (event: NotificationEvent) => void): void
  addEventListener(type: "sync" | "periodicsync", listener: (event: SyncEvent) => void): void
}

const sw = self as unknown as WorkerScope
const scope = sw.registration.scope
/** Caches of this app start with "ct-". Other apps can share the github.io address, and their caches stay alone. */
const PRECACHE = `ct-precache-${__VERSION__}`
const RUNTIME = "ct-runtime"
const INDEX = new URL("./", scope).href
const PRECACHED = new Set(__PRECACHE__.map((path) => new URL(path, scope).href))
const ICON = "./icon-192.png"
const BADGE = "./badge-96.png"

const isAsset = (url: string) => new URL(url).pathname.includes("/assets/")

/**
 * Saved copies match by address alone. A server can mark files as varying by request headers (Vite's preview server
 * says Vary: Origin), and the browser asks for the app's scripts with headers the download here didn't have, so a
 * lookup that compares them misses and goes to the network, which offline means a blank screen.
 */
const SAME_FILE: CacheQueryOptions = { ignoreVary: true }

// --- Install and update ---------------------------------------------------------------------------------------

async function precache() {
  const cache = await caches.open(PRECACHE)
  await Promise.all(
    [...PRECACHED].map(async (url) => {
      // Files in assets/ have a hash in their name and never change, so a copy from the previous version is reused
      // instead of downloaded again: an update only fetches what actually changed.
      if (isAsset(url)) {
        const old = await caches.match(url, SAME_FILE)
        if (old) return cache.put(url, old)
      }
      // Straight from the server: GitHub Pages lets browsers keep pages for 10 minutes, which could mix versions.
      const res = await fetch(new Request(url, { cache: "reload" }))
      if (!res.ok) throw new Error(`Couldn't download ${url} (${res.status})`)
      // A redirected response can't answer a page load, so keep a plain copy.
      await cache.put(url, res.redirected ? new Response(await res.blob(), { headers: res.headers }) : res)
    }),
  )
}

sw.addEventListener("install", (event) => {
  // If any file fails to download, this version isn't installed and the previous one keeps working.
  event.waitUntil(precache().then(() => sw.skipWaiting()))
})

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("ct-") && key !== PRECACHE && key !== RUNTIME) await caches.delete(key)
      }
      // Files from older versions picked up along the way won't be asked for again.
      const runtime = await caches.open(RUNTIME)
      for (const req of await runtime.keys()) if (isAsset(req.url)) await runtime.delete(req)
      await sw.clients.claim()
    })(),
  )
})

// --- Requests -------------------------------------------------------------------------------------------------

/** The app's one page, from this version's saved copy so it opens at once and matches the saved scripts. */
async function appPage(req: Request) {
  const hit = await caches.match(INDEX, { ...SAME_FILE, cacheName: PRECACHE })
  if (hit) return hit
  try {
    return await fetch(req)
  } catch {
    return (await caches.match(INDEX, SAME_FILE)) ?? Response.error()
  }
}

async function precached(req: Request) {
  return (await caches.match(req, { ...SAME_FILE, cacheName: PRECACHE })) ?? fetch(req)
}

/** Anything else on this site (launch screens, screenshots): the saved copy at once, refreshed in the background. */
function savedThenNetwork(event: FetchEvent, req: Request) {
  const network = fetch(req).then(async (res) => {
    if (res.ok && res.type === "basic") {
      const copy = res.clone()
      await (await caches.open(RUNTIME)).put(req, copy)
    }
    return res
  })
  event.waitUntil(network.then(
    () => undefined,
    () => undefined,
  ))
  return caches
    .match(req, SAME_FILE)
    .then((hit) => hit ?? network)
    .catch(() => Response.error())
}

sw.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET") return
  // The Sheet, and other apps on the same address, go straight to the network.
  if (!req.url.startsWith(scope)) return
  const path = new URL(req.url).pathname
  const scopePath = new URL(scope).pathname
  if (req.mode === "navigate" && (path === scopePath || path === `${scopePath}index.html`)) {
    event.respondWith(appPage(req))
  } else if (PRECACHED.has(req.url.split("#")[0])) {
    event.respondWith(precached(req))
  } else {
    event.respondWith(savedThenNetwork(event, req))
  }
})

// --- Background sync ------------------------------------------------------------------------------------------

function show(spec: NotificationSpec) {
  return sw.registration.showNotification(spec.title, spec.options)
}

async function tellApp(message: unknown = { type: MSG_SYNCED }) {
  for (const client of await sw.clients.matchAll({ type: "window" })) client.postMessage(message)
}

/** Closes the running-feed notice once the feed has ended, wherever it was stopped. */
async function tidyFeedNotice(list: LogEvent[]) {
  const running = new Set(list.filter((e) => e.type === "feeding" && !e.end).map((e) => e.id))
  for (const n of await sw.registration.getNotifications({ tag: FEED_TAG })) {
    const data = n.data as { event?: LogEvent; ended?: boolean } | null
    // The Sheet's "feed stopped" notice that took its place stays until the app is opened or a new feed starts.
    if (data?.ended) continue
    if (!data?.event?.id || !running.has(data.event.id)) n.close()
  }
}

/** Changes sent from here say which phone made them, so the Sheet doesn't notify this one about them. */
async function knowThisPhone() {
  try {
    setPushEndpoint((await sw.registration.pushManager.getSubscription())?.endpoint)
  } catch {
    // Then this phone also hears about its own change.
  }
}

/**
 * Sends anything waiting and refreshes the offline copy, then tells an open app to pick it up. "retry" means the
 * Sheet couldn't be reached.
 */
async function syncInBackground(): Promise<"done" | "retry" | "skip"> {
  if ((await kvInit()) !== "indexeddb") return "skip"
  const conn = await readConn()
  if (!conn) return "skip"
  await knowThisPhone()
  const backend = createBackend(conn)
  const dropped: string[] = []
  const flushed = await flushQueue(backend, conn.code, (_op, error) => dropped.push(error.message))
  if (dropped.length) {
    await show({
      title: dropped.length === 1 ? "An entry couldn't be saved" : `${dropped.length} entries couldn't be saved`,
      options: { body: dropped.join(" "), tag: "sync-error", icon: ICON, badge: BADGE, data: { url: "./" } },
    })
  }
  if (flushed.status !== "done") {
    if (flushed.sent) await tellApp()
    return flushed.status === "retry" ? "retry" : "skip"
  }
  try {
    await tidyFeedNotice(await pullEvents(backend, conn.code))
  } catch (e) {
    if (flushed.sent) await tellApp()
    if (isRetryable(e)) return "retry"
    throw e
  }
  await tellApp()
  return "done"
}

/** Stops waiting on background work after `ms`, so a slow Sheet doesn't hold up the notification it came with. */
function capped(work: Promise<unknown>, ms: number) {
  return Promise.race([work.catch(() => undefined), new Promise((resolve) => setTimeout(resolve, ms))])
}

sw.addEventListener("sync", (event) => {
  if (event.tag !== SYNC_TAG) return
  // Rejecting asks the browser to try again later, waiting longer each time.
  event.waitUntil(
    syncInBackground().then((result) => {
      if (result === "retry") throw new Error("The Sheet still can't be reached")
    }),
  )
})

sw.addEventListener("periodicsync", (event) => {
  if (event.tag === REFRESH_TAG) event.waitUntil(syncInBackground().catch(() => undefined))
})

// --- Notifications --------------------------------------------------------------------------------------------

/** Reminders from the Sheet, as Declarative Web Push messages (see pushMessage_ in Code.gs). */
interface PushNotice {
  title?: string
  body?: string
  tag?: string
  lang?: string
  navigate?: string
  app_badge?: number | string
}

function showReminder(n: PushNotice) {
  const options: RichNotificationOptions = {
    body: n.body || "",
    // A newer reminder of the same kind replaces the older one, and still buzzes.
    tag: n.tag,
    renotify: !!n.tag,
    lang: n.lang,
    icon: ICON,
    // Android's status bar wants a white-on-transparent shape.
    badge: BADGE,
    data: { url: n.navigate || scope },
  }
  return sw.registration.showNotification(n.title || "Baby tracker", options)
}

/**
 * The running feed, from the Sheet: the same notice the app puts up (with the Stop button on Android), or, once
 * the feed has ended, how it went in its place. Phones must show something for every push, so an ended feed's
 * notice is replaced rather than just closed.
 */
async function showFeed(feed: FeedPush, n: PushNotice) {
  if (feed.state === "running" && feed.event) {
    await show(runningFeedNotice(feed.event, feed.baby || n.title || "", canShowActions()))
    // So the app doesn't put it back up after it's swiped away.
    if ((await kvInit()) === "indexeddb") await kvSet(FEED_SHOWN_KEY, feedSig(feed.event)).catch(() => undefined)
    return
  }
  await show({
    title: n.title || "Feed stopped",
    options: {
      body: n.body || "",
      tag: FEED_TAG,
      silent: true,
      lang: n.lang,
      icon: ICON,
      badge: BADGE,
      data: { url: "./", ended: true },
    },
  })
}

sw.addEventListener("push", (event) => {
  let data: { notification?: PushNotice; feed?: FeedPush } = {}
  try {
    data = (event.data?.json() as typeof data) ?? {}
  } catch {
    data = { notification: { body: event.data?.text() ?? "" } }
  }
  const n = data.notification ?? {}
  // iOS 18.4 and later can show a Declarative Web Push message on its own, but whenever this worker gets the
  // push event it shows the notification itself, which takes the place of that.
  const shown = data.feed ? showFeed(data.feed, n) : showReminder(n)
  const badge = n.app_badge && "setAppBadge" in navigator ? navigator.setAppBadge(Number(n.app_badge)) : undefined
  // A push is also a chance to sync. On iPhones it's the only time a closed web app gets to run, so the app
  // opens up to date even with a weak connection then. The notice goes up first, so the sync's tidy-up sees it.
  event.waitUntil(
    (async () => {
      await shown.catch(() => undefined)
      await Promise.all([badge?.catch(() => undefined), capped(syncInBackground(), 25_000)])
    })(),
  )
})

/** Brings the app forward, or opens it. An open app is handed the link (open an entry, a tab) without a reload. */
async function openApp(url?: string) {
  const target = new URL(url || "./", scope)
  const windows = await sw.clients.matchAll({ type: "window", includeUncontrolled: true })
  const open = windows.find((w) => w.url.startsWith(scope))
  if (open) {
    try {
      await open.focus()
      if (target.search) open.postMessage({ type: MSG_LAUNCH, url: target.href })
      return
    } catch {
      // Not allowed to focus it; open a new one instead.
    }
  }
  await sw.clients.openWindow(target.href)
}

/** The running-feed notice's Stop button. */
async function stopFeed(event: LogEvent) {
  const end = new Date().toISOString()
  const conn = (await kvInit()) === "indexeddb" ? await readConn() : null
  if (!conn) return openApp()
  await knowThisPhone()
  const backend = createBackend(conn)
  let stopped: LogEvent = { ...event, end }
  let note: string | undefined
  try {
    // A feed started offline may still be waiting to sync. It goes first, or it would arrive after the stop
    // and set the feed running again.
    await flushQueue(backend, conn.code).catch(() => undefined)
    stopped = await backend.stop(event, end)
    // The Sheet keeps an earlier finish time from another phone.
    if (stopped.end && Math.abs(new Date(stopped.end).getTime() - new Date(end).getTime()) > 5_000)
      note = `It had already been stopped${stopped.updatedBy ? ` by ${stopped.updatedBy}` : ""}.`
  } catch (e) {
    if (!isRetryable(e)) {
      await show({
        title: "Couldn't stop the feed",
        options: {
          body: `${(e as Error).message} Tap to open the app and stop it there.`,
          tag: FEED_DONE_TAG,
          icon: ICON,
          badge: BADGE,
          data: { url: "./" },
        },
      })
      return
    }
    await enqueue(conn.code, { op: "save", event: stopped })
    await sw.registration.sync?.register(SYNC_TAG).catch(() => undefined)
    note = "Saved on this phone. It will sync when the connection is back."
  }
  await patchEvents(conn.code, (list) => upsert(list, stopped))
  await tellApp()
  await show(stoppedFeedNotice(stopped, note))
}

sw.addEventListener("notificationclick", (event) => {
  const n = event.notification
  const data = (n.data ?? {}) as { url?: string; event?: LogEvent }
  if (event.action === STOP_ACTION && data.event) {
    n.close()
    event.waitUntil(stopFeed(data.event))
    return
  }
  // The running feed's notice stays up until the feed ends. (iPhones clear a tapped notification themselves.)
  if (n.tag !== FEED_TAG) n.close()
  event.waitUntil(openApp(data.url))
})
