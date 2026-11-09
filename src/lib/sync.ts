/**
 * Syncing with the Sheet, shared by the app and the service worker so both send waiting changes the same way.
 */
import { isAuthError, isRetryable, type Backend } from "./api"
import { dequeue, patchEvents, readQueue, saveEvents, upsert, without, type QueuedOp } from "./store"

/** Background Sync tag for sending waiting changes (Android). */
export const SYNC_TAG = "ct-queue"
/** Periodic Background Sync tag for refreshing the offline copy (installed app on Android). */
export const REFRESH_TAG = "ct-refresh"
/** Messages between the app and the service worker. */
export const MSG_SYNCED = "ct-synced"
export const MSG_LAUNCH = "ct-launch"

/**
 * Runs `fn` while holding a named lock shared by every tab and the service worker, so two of them never send the
 * same waiting change at once. Without the Web Locks API it just runs: a repeated save is harmless, since the
 * Sheet matches entries by id.
 */
export function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined
  return locks?.request ? locks.request(name, fn) : fn()
}

export type FlushResult =
  /** Everything waiting has been sent (or refused for good). */
  | { status: "done"; sent: number }
  /** Offline, or the Sheet was busy. The rest waits for the next try. */
  | { status: "retry"; sent: number }
  /** The Sheet doesn't accept this code any more. The rest waits in case it works again. */
  | { status: "auth"; sent: number; error: Error }

/**
 * Sends waiting changes in order, stopping at the first one that still can't get through. A change the Sheet
 * refuses (for example an edit to an entry deleted on another phone) is dropped and reported to `onDropped`.
 */
export function flushQueue(
  backend: Backend,
  owner: string,
  onDropped?: (op: QueuedOp, error: Error) => void,
): Promise<FlushResult> {
  return withLock(`ct-queue:${owner}`, async () => {
    let queue = await readQueue(owner)
    let sent = 0
    while (queue.length) {
      const next = queue[0]
      try {
        if (next.op === "save") {
          const saved = await backend.save(next.event)
          await patchEvents(owner, (list) => upsert(list, saved))
        } else {
          await backend.remove(next.id)
          await patchEvents(owner, (list) => without(list, next.id))
        }
        sent++
      } catch (e) {
        if (isRetryable(e)) return { status: "retry", sent }
        if (isAuthError(e)) return { status: "auth", sent, error: e as Error }
        onDropped?.(next, e as Error)
        sent++
      }
      queue = await dequeue(owner, next.qid)
    }
    return { status: "done", sent }
  })
}

/** Fetches the latest entries and saves them as the offline copy. */
export async function pullEvents(backend: Backend, owner: string, days = 7) {
  const list = await backend.list(days)
  await saveEvents(owner, list)
  return list
}
