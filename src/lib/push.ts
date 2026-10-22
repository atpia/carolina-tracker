import type { Backend } from "./api"

/**
 * Whether this phone can get notifications from the Sheet. iPhones only offer them to the app opened from the
 * home screen (iOS 16.4 and later), so Safari in a tab says "needs-install".
 */
export type PushSupport = "ok" | "needs-install" | "unsupported"

export function isIos() {
  // iPads ask for the desktop site, so they say Macintosh but have a touch screen.
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
}

/** Opened from the home screen rather than in a browser tab. */
export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function pushSupport(): PushSupport {
  if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) return "ok"
  if (isIos() && !isStandalone()) return "needs-install"
  return "unsupported"
}

/** A short name for this phone, so the Sheet's menu can say who a test went to. */
export function deviceName() {
  const ua = navigator.userAgent
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "iPad"
  if (/iPhone/.test(ua)) return "iPhone"
  // Chrome no longer puts the phone's model in its user agent.
  if (/Android/.test(ua)) return "Android"
  return "Computer"
}

function keyBytes(b64url: string) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/")
  return Uint8Array.from(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0))
}

function sameKey(a: ArrayBuffer | null, b64url: string) {
  if (!a) return false
  const x = new Uint8Array(a)
  const y = keyBytes(b64url)
  return x.length === y.length && x.every((v, i) => v === y[i])
}

/** The service worker, or null when there isn't one (the dev server and the demo build don't register it). */
async function registration() {
  if (!("serviceWorker" in navigator)) return null
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return null
  return navigator.serviceWorker.ready
}

export async function currentSubscription() {
  const reg = await registration()
  return reg ? reg.pushManager.getSubscription() : null
}

const SYNC_KEY = "ct.push"
/** How often the app re-sends its subscription, in case the Sheet dropped it or the push service changed it. */
const RESYNC_MS = 24 * 3_600_000

type SyncMark = { owner: string; at: number }

function readMark(): SyncMark | null {
  try {
    return JSON.parse(localStorage.getItem(SYNC_KEY) ?? "null")
  } catch {
    return null
  }
}

function writeMark(mark: SyncMark | null) {
  try {
    if (mark) localStorage.setItem(SYNC_KEY, JSON.stringify(mark))
    else localStorage.removeItem(SYNC_KEY)
  } catch {
    // Without it the app just re-sends the subscription more often.
  }
}

/** Subscribe with the Sheet's key, replacing a subscription made for a different Sheet. */
async function subscribeWith(backend: Backend, owner: string) {
  const reg = await registration()
  if (!reg) throw new Error("Notifications need the installed app. Reload it and try again.")
  const key = await backend.pushKey()
  let sub = await reg.pushManager.getSubscription()
  if (sub && !sameKey(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe()
    sub = null
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) })
  const result = await backend.pushSubscribe({ ...sub.toJSON(), device: deviceName() })
  writeMark({ owner, at: Date.now() })
  return { subscription: sub, ...result }
}

/**
 * Turn notifications on. Call it straight from a tap: iPhones only show the permission prompt for one, so the
 * prompt comes before anything that waits.
 */
export async function enablePush(backend: Backend, owner: string) {
  const permission = await Notification.requestPermission()
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notifications are blocked for this app. Allow them in the phone's settings, then try again."
        : "Notifications weren't allowed.",
    )
  }
  return subscribeWith(backend, owner)
}

export async function disablePush(backend: Backend) {
  const sub = await currentSubscription()
  writeMark(null)
  if (!sub) return
  // Tell the Sheet first: once unsubscribed, the endpoint is gone. The Sheet also drops it on its next send.
  await backend.pushUnsubscribe(sub.endpoint).catch(() => {})
  await sub.unsubscribe()
}

/**
 * Once a day, re-send this phone's subscription, and quietly make a new one if the phone dropped it (iOS can,
 * after an update). Only on a phone where notifications were turned on with this sign-in.
 */
export async function resyncPush(backend: Backend, owner: string) {
  const mark = readMark()
  if (!mark || mark.owner !== owner || Date.now() - mark.at < RESYNC_MS) return
  if (pushSupport() !== "ok" || Notification.permission !== "granted") return
  await subscribeWith(backend, owner)
}

/** Notifications were turned on with this sign-in, on this phone. */
export function pushEnabledHere(owner: string) {
  return readMark()?.owner === owner
}
