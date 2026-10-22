// Lets the app open without a connection. It only handles this site's own files: requests to the
// Google Sheet go straight to the network, and entries made offline wait in the app's sync queue.
const CACHE = "ct-shell-v1"

self.addEventListener("install", () => self.skipWaiting())

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return
  // Network first so a new version shows up right away; the cached copy is for when that fails.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then((cache) => cache.put(req, copy))
          return res
        }
        // A file from the previous version is gone after a deploy; an older copy beats a 404.
        return caches.match(req).then((hit) => hit || res)
      })
      .catch(() =>
        caches.match(req).then((hit) => {
          if (hit) return hit
          // Only a page load falls back to the app itself. Serving it in place of a script breaks the import.
          if (req.mode === "navigate") return caches.match("./").then((page) => page || Response.error())
          return Response.error()
        }),
      ),
  )
})

// Reminders from the Sheet. They're Declarative Web Push messages: iOS 18.4 and later can show one on its own,
// but whenever this worker gets the push event it shows the notification itself, which takes the place of that.
self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { notification: { body: event.data ? event.data.text() : "" } }
  }
  const n = data.notification || {}
  const shown = self.registration.showNotification(n.title || "Baby tracker", {
    body: n.body || "",
    // A newer reminder of the same kind replaces the older one, and still buzzes.
    tag: n.tag,
    renotify: !!n.tag,
    lang: n.lang,
    icon: "./icon-192.png",
    // Android's status bar wants a white-on-transparent shape.
    badge: "./badge-96.png",
    data: { url: n.navigate || self.registration.scope },
  })
  const badge = n.app_badge && self.navigator.setAppBadge ? self.navigator.setAppBadge(Number(n.app_badge)) : null
  event.waitUntil(Promise.all([shown, badge && badge.catch(() => {})]))
})

// A tap brings the app forward if it's open, or opens it.
self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || "./", self.registration.scope)
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(self.registration.scope))
      if (open) return open.focus()
      return self.clients.openWindow(url.href)
    }),
  )
})
