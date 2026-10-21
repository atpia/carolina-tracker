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
