export type Unit = "ml" | "oz"

const ML_PER_OZ = 29.5735

export function toDisplay(ml: number | undefined, unit: Unit) {
  if (ml === undefined || ml === null || Number.isNaN(ml)) return undefined
  return unit === "ml" ? Math.round(ml) : Math.round((ml / ML_PER_OZ) * 10) / 10
}

export function fromDisplay(value: number | undefined, unit: Unit) {
  if (value === undefined || Number.isNaN(value)) return undefined
  return unit === "ml" ? value : Math.round(value * ML_PER_OZ * 10) / 10
}

export function formatAmount(ml: number | undefined, unit: Unit) {
  const v = toDisplay(ml, unit)
  return v === undefined ? "" : `${v.toLocaleString()} ${unit}`
}

/** What an amount box shows: bottle amounts are stored in ml and shown in the phone's unit, doses as typed. */
export type InputUnit = Unit | "mg"

/** Reads a typed amount. Accepts a decimal comma, which some phone keyboards offer instead of a dot. */
export function parseAmount(text: string, unit: InputUnit): number | undefined {
  const clean = text.trim().replace(",", ".")
  if (clean === "" || clean === ".") return undefined
  const n = Number(clean)
  if (!Number.isFinite(n)) return undefined
  return unit === "mg" ? n : fromDisplay(n, unit)
}

/** The text an amount box shows for a stored value. */
export function amountText(value: number | undefined, unit: InputUnit): string {
  const v = unit === "mg" ? value : toDisplay(value, unit)
  return v === undefined || v === null || Number.isNaN(v) ? "" : String(v)
}
