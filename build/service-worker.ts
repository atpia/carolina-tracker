import { createHash } from "node:crypto"
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { build } from "esbuild"
import type { Plugin, ResolvedConfig } from "vite"

/** Files from public/ the app needs to open offline. Launch screens and screenshots are saved once they're used. */
export const PUBLIC_PRECACHE = ["manifest.webmanifest", "icon.svg", "icon-192.png", "badge-96.png", "apple-touch-icon.png"]

function listFiles(dir: string, prefix = ""): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? listFiles(path.join(dir, entry.name), `${prefix}${entry.name}/`)
      : [`${prefix}${entry.name}`],
  )
}

/**
 * Builds src/sw/sw.ts into sw.js next to the app, with the list of files to save for offline use and a version that
 * changes whenever any of them does. A new version is what makes phones download the update.
 */
export function serviceWorker({ entry }: { entry: string }): Plugin {
  let config: ResolvedConfig
  return {
    name: "carolina:service-worker",
    apply: "build",
    configResolved(resolved) {
      config = resolved
    },
    async closeBundle() {
      // The single-file demo build doesn't register a worker.
      if (config.define?.["import.meta.env.VITE_DEMO"]) return
      const outDir = path.resolve(config.root, config.build.outDir)
      const assets = listFiles(path.join(outDir, config.build.assetsDir)).map((f) => `${config.build.assetsDir}/${f}`)
      const files = ["index.html", ...assets, ...PUBLIC_PRECACHE]
      const hash = createHash("sha256")
      for (const file of files) {
        const full = path.join(outDir, file)
        if (!existsSync(full)) throw new Error(`service worker: ${file} is missing from the build`)
        hash.update(file).update(readFileSync(full))
      }
      const result = await build({
        entryPoints: [path.resolve(config.root, entry)],
        bundle: true,
        write: false,
        format: "iife",
        target: "es2020",
        minify: true,
        legalComments: "none",
        define: {
          // The page itself is saved as "./", the address the app is opened at.
          __PRECACHE__: JSON.stringify(["./", ...assets, ...PUBLIC_PRECACHE]),
          __VERSION__: JSON.stringify(hash.digest("hex").slice(0, 12)),
        },
      })
      writeFileSync(path.join(outDir, "sw.js"), result.outputFiles[0].text)
    },
  }
}
