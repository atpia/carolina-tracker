export type EventType = "feeding" | "diaper" | "med" | "temp"
export type FeedKind = "left" | "right" | "both" | "formula" | "expressed"
export type DiaperKind = "wet" | "stool" | "both" | "dry"
export type MedKind = "ibuprofen" | "tylenol" | "probiotic" | "vitamind"
/** Once a day: mom's probiotics and the baby's Vitamin D drops. They stay out of the pain reliever rotation. */
export type DailyKind = "probiotic" | "vitamind"
/** The pain relievers mom alternates. */
export type PainMedKind = Exclude<MedKind, DailyKind>
/** Where a temperature was taken. */
export type TempMethod = "rectal" | "armpit" | "forehead" | "ear"

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
  /** Mom's medication only: the dose in mg, if someone entered it. */
  doseMg?: number
  /** Temperature readings only, always stored in °C. */
  tempC?: number
  notes?: string
  by: string
  createdAt?: string
  updatedAt?: string
  updatedBy?: string
}

/** A doctor's visit or similar. Copied one way to a Google Calendar by the Sheet script. */
export interface Appointment {
  id: string
  title: string
  /** ISO timestamp. */
  start: string
  /** ISO timestamp. Without one the calendar shows an hour. */
  end?: string
  location?: string
  notes?: string
  by: string
  createdAt?: string
  updatedAt?: string
  updatedBy?: string
  /** The calendar has the latest version. */
  synced?: boolean
  /** Why the calendar copy failed, if it did. The appointment itself is saved either way. */
  syncError?: string
}

export interface Settings {
  babyName: string
  feedMinH: number
  feedMaxH: number
  medIntervalH: number
  /** Hours until the next check after a wet or stool diaper. */
  diaperAfterChangeH: number
  /** Hours until the next check after a check that found it clean. */
  diaperAfterCleanH: number
  /** Daily goals shown on the Today card. 0 hides a goal. */
  targetFeedsPerDay: number
  targetWetPerDay: number
  /** Minutes per breast before a running timer flashes. 0 turns the warning off. */
  breastLimitMin: number
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
  diaperAfterChangeH: 2,
  diaperAfterCleanH: 1,
  targetFeedsPerDay: 0,
  targetWetPerDay: 0,
  breastLimitMin: 15,
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
  probiotic: "Probiotics",
  vitamind: "Vitamin D",
}

export const TEMP_LABELS: Record<TempMethod, string> = {
  rectal: "Rectal",
  armpit: "Armpit",
  forehead: "Forehead",
  ear: "Ear",
}

/** 100.4 °F. For a newborn, a reading this high is a reason to call the doctor. */
export const FEVER_C = 38

export const DAILY_KINDS: DailyKind[] = ["probiotic", "vitamind"]

export function isDaily(kind: string): kind is DailyKind {
  return kind === "probiotic" || kind === "vitamind"
}

export function isPainMed(kind: string): kind is PainMedKind {
  return kind === "ibuprofen" || kind === "tylenol"
}

export function isBottle(kind: string) {
  return kind === "formula" || kind === "expressed"
}
