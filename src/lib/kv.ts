/**
 * A small key-value store in IndexedDB. Unlike localStorage, the service worker can read and write it too, so it
 * can send entries that are waiting to sync, and refresh the offline copy, while the app is closed.
 *
 * If IndexedDB can't be opened at all (some private browsing modes), the app falls back to localStorage. The
 * service worker has no localStorage, so background sync just doesn't happen then; the app still syncs when open.
 */

const DB_NAME = "carolina-tracker"
const STORE = "kv"
const FALLBACK_PREFIX = "ct.kv."

let opening: Promise<IDBDatabase> | null = null
/** Set once IndexedDB has failed to open, for the rest of this page's life. */
let useFallback = false

function openDb(): Promise<IDBDatabase> {
  if (opening) return opening
  const attempt = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") throw new Error("IndexedDB is not available")
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => {
      const db = req.result
      // Another copy of the app upgrading the database, or the browser closing it: open a fresh one next time.
      db.onversionchange = () => {
        db.close()
        opening = null
      }
      db.onclose = () => {
        opening = null
      }
      resolve(db)
    }
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error("IndexedDB is blocked"))
  })
  opening = attempt
  attempt.catch(() => {
    if (opening === attempt) opening = null
  })
  return attempt
}

/** Runs requests in one transaction and resolves with what `run` reports once the transaction has committed. */
function transact<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, report: (value: T) => void) => void,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        let result: T
        run(tx.objectStore(STORE), (value) => {
          result = value
        })
        tx.oncomplete = () => resolve(result)
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"))
      }),
  )
}

const hasLocalStorage = () => {
  try {
    return typeof localStorage !== "undefined"
  } catch {
    return false
  }
}

function lsGet<T>(key: string): T | undefined {
  const raw = localStorage.getItem(FALLBACK_PREFIX + key)
  return raw === null ? undefined : (JSON.parse(raw) as T)
}

function lsSet(key: string, value: unknown) {
  if (value === undefined) localStorage.removeItem(FALLBACK_PREFIX + key)
  else localStorage.setItem(FALLBACK_PREFIX + key, JSON.stringify(value))
}

/**
 * Opens the database, or switches this page to localStorage if it can't be opened. Call once before the first read;
 * the other functions also work without it. A failure later on (a full disk, say) is reported, not switched over,
 * so the data never ends up split between the two.
 */
export async function kvInit(): Promise<"indexeddb" | "localstorage" | "none"> {
  if (useFallback) return "localstorage"
  try {
    await openDb()
    return "indexeddb"
  } catch {
    if (!hasLocalStorage()) return "none"
    useFallback = true
    return "localstorage"
  }
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  if (useFallback) return lsGet<T>(key)
  return transact<T | undefined>("readonly", (store, report) => {
    const req = store.get(key)
    req.onsuccess = () => report(req.result as T | undefined)
  })
}

/** Several keys in one read. */
export async function kvGetMany(keys: string[]): Promise<Record<string, unknown>> {
  if (useFallback) return Object.fromEntries(keys.map((k) => [k, lsGet(k)]))
  return transact<Record<string, unknown>>("readonly", (store, report) => {
    const out: Record<string, unknown> = {}
    for (const key of keys) {
      const req = store.get(key)
      req.onsuccess = () => {
        out[key] = req.result
      }
    }
    report(out)
  })
}

/** Writes a value. `undefined` deletes it. */
export async function kvSet(key: string, value: unknown): Promise<void> {
  if (useFallback) return lsSet(key, value)
  return transact<void>("readwrite", (store) => {
    if (value === undefined) store.delete(key)
    else store.put(value, key)
  })
}

/**
 * Reads, changes and writes a value in one transaction, so a change made at the same moment by the service worker
 * (or another tab) can't slip in between and get overwritten. Resolves with the new value.
 */
export async function kvUpdate<T>(key: string, change: (value: T | undefined) => T): Promise<T> {
  if (useFallback) {
    const next = change(lsGet<T>(key))
    lsSet(key, next)
    return next
  }
  return transact<T>("readwrite", (store, report) => {
    const req = store.get(key)
    req.onsuccess = () => {
      const next = change(req.result as T | undefined)
      if (next === undefined) store.delete(key)
      else store.put(next, key)
      report(next)
    }
  })
}
