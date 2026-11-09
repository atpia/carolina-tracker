import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

import { serviceWorker } from "./build/service-worker"

/**
 * Libraries that rarely change get files of their own. Their names carry a hash of their contents, so after an
 * app update the service worker keeps its saved copies and phones download only the app's own code, about a third
 * of the total. Charts (recharts and its d3 parts) stay out: only Reports loads them, when it's opened.
 */
const CHUNKS: Record<string, string[]> = {
  react: ["react", "react-dom", "scheduler"],
  ui: [
    "@base-ui",
    "@radix-ui",
    "radix-ui",
    "@floating-ui",
    "vaul",
    "react-day-picker",
    "react-remove-scroll",
    "react-remove-scroll-bar",
    "react-style-singleton",
    "use-callback-ref",
    "use-sidecar",
    "aria-hidden",
    "get-nonce",
    "detect-node-es",
    "tslib",
    "tailwind-merge",
    "clsx",
    "class-variance-authority",
  ],
}

function chunkFor(id: string) {
  const pkg = id.replace(/\\/g, "/").match(/\/node_modules\/((?:@[^/]+\/)?[^/]+)\//)?.[1]
  if (!pkg) return undefined
  const scope = pkg.startsWith("@") ? pkg.split("/")[0] : pkg
  return Object.keys(CHUNKS).find((name) => CHUNKS[name].includes(pkg) || CHUNKS[name].includes(scope))
}

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), serviceWorker({ entry: "src/sw/sw.ts" })],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: { manualChunks: chunkFor },
    },
  },
})
