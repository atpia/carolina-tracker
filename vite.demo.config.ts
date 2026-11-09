import { mergeConfig, type UserConfig } from "vite"
import { viteSingleFile } from "vite-plugin-singlefile"

import base from "./vite.config"

// One self-contained HTML file with demo data, for sharing a preview.
const config: UserConfig = mergeConfig(base, {
  plugins: [viteSingleFile()],
  define: { "import.meta.env.VITE_DEMO": JSON.stringify("1") },
  build: { outDir: "dist-demo" },
})

// Everything goes in the one file, so the separate library files of the hosted app don't apply.
const output = config.build?.rollupOptions?.output
if (output && !Array.isArray(output)) delete output.manualChunks

export default config
