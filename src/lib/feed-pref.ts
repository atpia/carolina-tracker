/**
 * This phone's choice to show the running feed in its notifications. On unless turned off in Settings. The Sheet
 * gets a copy with the phone's push subscription, so it doesn't send the feed to a phone that turned it off.
 */
const PREF_KEY = "ct.feedNotice"

function read() {
  try {
    return localStorage.getItem(PREF_KEY) !== "off"
  } catch {
    return true
  }
}

let pref = typeof localStorage === "undefined" ? true : read()
const listeners = new Set<() => void>()

export function feedNoticePref() {
  return pref
}

export function setFeedNoticePref(on: boolean) {
  pref = on
  try {
    localStorage.setItem(PREF_KEY, on ? "on" : "off")
  } catch {
    // ignore
  }
  listeners.forEach((l) => l())
}

export function onFeedNoticePref(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
