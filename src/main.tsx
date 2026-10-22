import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { ErrorBoundary } from "./components/error-boundary"
import { listenForInstall } from "./lib/install"

// Before rendering, so Chrome's one-time install event isn't missed.
listenForInstall()

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

// The demo build is a single file with nothing to cache, so only the hosted app registers the worker.
if (import.meta.env.PROD && !import.meta.env.VITE_DEMO && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {
    // Without it the app still works, it just needs a connection to open.
  })
}
