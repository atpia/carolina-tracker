/**
 * Each deploy replaces the app's hashed files, so a phone still running the previous version can ask for a
 * file that no longer exists. Browsers word that failure differently.
 */
export function isChunkLoadError(e: unknown) {
  const message = e instanceof Error ? e.message : String(e)
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(
    message,
  )
}

const RELOAD_KEY = "ct.chunkReload"

type SessionStore = Pick<Storage, "getItem" | "setItem" | "removeItem">

function store(): SessionStore | undefined {
  try {
    return sessionStorage
  } catch {
    return undefined
  }
}

/** True once per broken load: the flag stops a reload loop if the new version can't load either. */
export function claimAutoReload(storage = store()) {
  try {
    if (!storage || storage.getItem(RELOAD_KEY)) return false
    storage.setItem(RELOAD_KEY, "1")
    return true
  } catch {
    return false
  }
}

/** Called once the lazy code loads, so a later deploy can reload automatically again. */
export function clearAutoReload(storage = store()) {
  try {
    storage?.removeItem(RELOAD_KEY)
  } catch {
    // ignore
  }
}
