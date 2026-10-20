import { mergeConfig } from "vite"
import { viteSingleFile } from "vite-plugin-singlefile"

import base from "./vite.config"

// One self-contained HTML file with demo data, for sharing a preview.
export default mergeConfig(base, {
  plugins: [viteSingleFile()],
  define: { "import.meta.env.VITE_DEMO": JSON.stringify("1") },
  build: { outDir: "dist-demo" },
})
