import { useSyncExternalStore } from "react"

import type { TempUnit } from "@/lib/temperature"

const KEY = "ct.tempUnit"
const listeners = new Set<() => void>()

function read(): TempUnit {
  try {
    return localStorage.getItem(KEY) === "C" ? "C" : "F"
  } catch {
    return "F"
  }
}

let current = read()

/** The phone's temperature unit, for code outside React such as entry descriptions. */
export function getTempUnit() {
  return current
}

export function setTempUnit(unit: TempUnit) {
  current = unit
  try {
    localStorage.setItem(KEY, unit)
  } catch {
    // ignore
  }
  listeners.forEach((l) => l())
}

/** Shared by every screen, so switching it in Settings updates readings everywhere at once. */
export function useTempUnit() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    getTempUnit,
    getTempUnit,
  )
}
