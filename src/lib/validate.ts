import { isBottle, type LogEvent } from "./types"

/** How a bottle's amount was entered: offered and left over, a percent of offered, or the amount drunk. */
export type BottleMode = "left" | "percent" | "amount"

/** Problems that would save a wrong entry. Each one blocks saving. */
export function entryErrors(e: LogEvent, mode: BottleMode, now = Date.now()): string[] {
  const out: string[] = []
  // A few minutes of slack so a clock that's slightly off between phones doesn't block a save.
  const soon = now + 5 * 60_000
  const start = new Date(e.start).getTime()
  const end = e.type === "feeding" && e.end ? new Date(e.end).getTime() : undefined
  if (start > soon || (end !== undefined && end > soon)) out.push("Times can't be in the future.")
  if (end !== undefined && end < start) out.push("The finish time is before the start time.")
  if (e.type === "feeding" && isBottle(e.kind)) {
    const offered = e.amountStartMl
    const left = mode === "left" ? e.amountEndMl : undefined
    if ((offered ?? 0) < 0 || (left ?? 0) < 0) out.push("Amounts can't be negative.")
    else if (offered !== undefined && left !== undefined && left > offered)
      out.push("More is left over than was offered.")
    if (offered === undefined && left !== undefined) out.push("Add how much was offered.")
  }
  if (e.type === "med" && (e.doseMg ?? 0) < 0) out.push("The dose can't be negative.")
  return out
}
