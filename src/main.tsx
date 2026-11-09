import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { ErrorBoundary } from "./components/error-boundary"
import { loadConnection } from "./lib/api"
import { listenForInstall } from "./lib/install"
import { kvInit } from "./lib/kv"
import { loadOwner } from "./lib/store"
import { registerServiceWorker } from "./lib/sw-client"

// Before rendering, so Chrome's one-time install event isn't missed.
listenForInstall()

function render() {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ErrorBoundary
        title="Something went wrong"
        description="Your entries are safe. Reload the app to carry on."
        className="mx-auto grid min-h-dvh max-w-md content-center gap-4 p-6"
      >
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
  // Started fine, so the blank-screen check in index.html may reload once again later if it ever needs to.
  try {
    sessionStorage.removeItem("ct.bootReload")
  } catch {
    // ignore
  }
}

/** The data saved on this phone, read before the first screen draws so it opens with it, even offline. */
async function loadSaved() {
  await kvInit()
  const conn = loadConnection()
  if (conn && conn.api !== "demo") await loadOwner(conn.code)
}

// Never wait long: if the read is slow, the app draws now and the data appears a moment later.
Promise.race([loadSaved().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 1500))]).then(render)

// The demo build is a single file with nothing to cache, so only the hosted app registers the worker.
if (import.meta.env.PROD && !import.meta.env.VITE_DEMO) registerServiceWorker()
