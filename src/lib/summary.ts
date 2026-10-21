import { format } from "date-fns"

import type { Analysis, Range } from "./analytics"
import { formatDuration, HOUR } from "./time"
import { formatAmount, type Unit } from "./units"

export function rangeLabel(range: Range) {
  const from = new Date(range.from)
  const to = new Date(range.to)
  if (range.to - range.from <= 25 * HOUR) return `${format(from, "MMM d, h:mm a")} to ${format(to, "MMM d, h:mm a")}`
  return `${format(from, "MMM d")} to ${format(to, "MMM d, yyyy")}`
}

export const per = (n: number, days: number) =>
  days >= 1.5 ? `${n.toFixed(1)} per day` : `in ${Math.round(days * 24)} hours`

/** The text "Copy summary" puts on the clipboard. */
export function summaryText(name: string, range: Range, a: Analysis, unit: Unit) {
  const f = a.feeding
  const d = a.diaper
  // null is a line left out because there's nothing to say; "" is a break between sections.
  const lines: (string | null)[] = [
    `${name}: ${rangeLabel(range)}`,
    "",
    `Feedings: ${f.count} (${per(f.perDay, a.days)})`,
    f.avgInterval ? `  Average time between feeds: ${formatDuration(f.avgInterval)}` : null,
    f.longestGap.ms ? `  Longest gap: ${formatDuration(f.longestGap.ms)}` : null,
    `  Breast: ${f.breastCount}${f.avgBreastMs ? `, average ${formatDuration(f.avgBreastMs)}` : ""}`,
    `  Bottle: ${f.bottleCount}, ${formatAmount(f.bottleMl, unit)} total${a.days >= 1.5 ? ` (${formatAmount(f.bottleMlPerDay, unit)} per day)` : ""}`,
    "",
    `Wet diapers: ${d.wet} (${per(d.wetPerDay, a.days)})`,
    `Stools: ${d.stool} (${per(d.stoolPerDay, a.days)})`,
    d.longestWithoutWet.ms
      ? `Longest without a wet diaper: ${formatDuration(d.longestWithoutWet.ms)}${d.longestWithoutWet.ongoing ? " (still going)" : ""}`
      : null,
    d.longestWithoutStool.ms
      ? `Longest without a stool: ${formatDuration(d.longestWithoutStool.ms)}${d.longestWithoutStool.ongoing ? " (still going)" : ""}`
      : null,
  ]
  return lines.filter((l) => l !== null).join("\n")
}
