import { describe, expect, it } from "vitest"

import { claimAutoReload, clearAutoReload, isChunkLoadError } from "./chunk"

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

describe("isChunkLoadError", () => {
  it("recognizes Chrome, Safari and Firefox wording", () => {
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://x/reports-abc.js"))).toBe(
      true,
    )
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true)
    expect(isChunkLoadError(new TypeError("error loading dynamically imported module"))).toBe(true)
  })

  it("ignores other errors", () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false)
  })
})

describe("auto reload guard", () => {
  it("allows one reload until the code loads again", () => {
    const s = memoryStorage()
    expect(claimAutoReload(s)).toBe(true)
    expect(claimAutoReload(s)).toBe(false)
    clearAutoReload(s)
    expect(claimAutoReload(s)).toBe(true)
  })

  it("never reloads without storage", () => {
    expect(claimAutoReload(undefined)).toBe(false)
  })
})
