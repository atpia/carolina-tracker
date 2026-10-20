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
  return v === undefined ? "" : `${v} ${unit}`
}
