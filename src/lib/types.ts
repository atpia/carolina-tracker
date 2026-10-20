export type EventType = "feeding" | "diaper" | "med"
export type FeedKind = "left" | "right" | "both" | "formula" | "expressed"
export type DiaperKind = "wet" | "stool" | "both" | "dry"
export type MedKind = "ibuprofen" | "tylenol"

export interface LogEvent {
  id: string
  type: EventType
  kind: string
  /** ISO timestamp. For feedings this is when the feeding started. */
  start: string
  /** ISO timestamp. Empty while a feeding timer is still running. */
  end?: string
  amountStartMl?: number
  amountEndMl?: number
  percent?: number
  /** 1 to 5, how confident we are she ate well (breast feeds). */
  confidence?: number
  notes?: string
  by: string
  createdAt?: string
  updatedAt?: string
}

export interface Settings {
  babyName: string
  feedMinH: number
  feedMaxH: number
  medIntervalH: number
  diaperCheckH: number
}

export interface Session {
  user: string
  users: string[]
  settings: Settings
}

export const DEFAULT_SETTINGS: Settings = {
  babyName: "Carolina",
  feedMinH: 2,
  feedMaxH: 4,
  medIntervalH: 4,
  diaperCheckH: 3,
}

export const FEED_LABELS: Record<FeedKind, string> = {
  left: "Left breast",
  right: "Right breast",
  both: "Both breasts",
  formula: "Formula",
  expressed: "Expressed milk",
}

export const DIAPER_LABELS: Record<DiaperKind, string> = {
  wet: "Wet",
  stool: "Stool",
  both: "Wet + stool",
  dry: "Checked, clean",
}

export const MED_LABELS: Record<MedKind, string> = {
  ibuprofen: "Ibuprofen",
  tylenol: "Tylenol",
}

export function isBottle(kind: string) {
  return kind === "formula" || kind === "expressed"
}
