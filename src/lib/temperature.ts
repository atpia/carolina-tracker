import { FEVER_C } from "./types"

export type TempUnit = "F" | "C"

/** Readings are stored in °C and shown in the phone's unit, to one decimal place unless asked for more. */
export function toDisplayTemp(c: number | undefined, unit: TempUnit, digits = 1) {
  if (c === undefined || c === null || Number.isNaN(c)) return undefined
  const f = 10 ** digits
  return Math.round((unit === "C" ? c : (c * 9) / 5 + 32) * f) / f
}

/** Three decimals of °C, so a typed °F value (to two decimals) comes back exactly as typed. */
export function fromDisplayTemp(value: number | undefined, unit: TempUnit) {
  if (value === undefined || Number.isNaN(value)) return undefined
  return Math.round((unit === "C" ? value : ((value - 32) * 5) / 9) * 1000) / 1000
}

export function formatTemp(c: number | undefined, unit: TempUnit) {
  const v = toDisplayTemp(c, unit)
  return v === undefined ? "" : `${v.toFixed(1)} °${unit}`
}

export function isFever(c: number | undefined) {
  // Compare the shown value, so 100.4 °F typed in counts even after rounding to °C and back.
  return c !== undefined && Math.round(c * 10) / 10 >= FEVER_C
}

/** Readings outside this range are almost certainly typos. */
export const TEMP_MIN_C = 30
export const TEMP_MAX_C = 44
