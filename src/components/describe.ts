import { consumedMl } from "@/lib/derive"
import { formatClock, formatDuration } from "@/lib/time"
import {
  DIAPER_LABELS,
  FEED_LABELS,
  MED_LABELS,
  isBottle,
  type DiaperKind,
  type FeedKind,
  type LogEvent,
  type MedKind,
} from "@/lib/types"
import { formatAmount, type Unit } from "@/lib/units"

export function eventTitle(e: LogEvent) {
  if (e.type === "feeding") return FEED_LABELS[e.kind as FeedKind] ?? e.kind
  if (e.type === "diaper") return DIAPER_LABELS[e.kind as DiaperKind] ?? e.kind
  return MED_LABELS[e.kind as MedKind] ?? e.kind
}

/** Names an entry in a sentence: "the 2:15 AM wet diaper", "the 9:00 PM Tylenol dose". */
export function entryName(e: LogEvent) {
  let noun: string
  if (e.type === "feeding") noun = `${(FEED_LABELS[e.kind as FeedKind] ?? e.kind).toLowerCase()} feed`
  else if (e.type === "diaper")
    noun = e.kind === "dry" ? "diaper check" : `${(DIAPER_LABELS[e.kind as DiaperKind] ?? e.kind).toLowerCase()} diaper`
  else noun = `${e.kind === "tylenol" ? "Tylenol" : (MED_LABELS[e.kind as MedKind] ?? e.kind).toLowerCase()} dose`
  return `the ${formatClock(e.start)} ${noun}`
}

const CONFIDENCE = ["", "Barely ate", "A little", "Okay", "Good", "Great"]

export function confidenceLabel(n?: number) {
  return n ? CONFIDENCE[n] : ""
}

export function eventDetails(e: LogEvent, unit: Unit) {
  const parts: string[] = []
  if (e.type === "feeding") {
    if (e.end) {
      const mins = new Date(e.end).getTime() - new Date(e.start).getTime()
      if (mins >= 60_000) parts.push(formatDuration(mins))
    } else {
      parts.push("in progress")
    }
    if (isBottle(e.kind)) {
      const drank = consumedMl(e)
      if (drank !== undefined) parts.push(`drank ${formatAmount(drank, unit)}`)
      // A finished bottle (or a typed amount) needs no "of" figure.
      if (e.amountStartMl !== undefined && e.amountEndMl !== 0) parts.push(`of ${formatAmount(e.amountStartMl, unit)}`)
    } else if (e.confidence) {
      parts.push(`${confidenceLabel(e.confidence)} (${e.confidence}/5)`)
    }
  }
  if (e.type === "med" && e.doseMg) parts.push(`${e.doseMg.toLocaleString()} mg`)
  return parts.join(" · ")
}
