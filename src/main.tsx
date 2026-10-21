import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// The demo build is a single file with nothing to cache, so only the hosted app registers the worker.
if (import.meta.env.PROD && !import.meta.env.VITE_DEMO && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {
    // Without it the app still works, it just needs a connection to open.
  })
}
