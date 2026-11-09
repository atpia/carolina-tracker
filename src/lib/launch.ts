import type { EventType } from "./types"

/**
 * One-tap actions. The app takes them as …/?do=diaper-wet (Android's icon shortcuts), and the Sheet script takes
 * the same names in its "quick" action (widgets on either phone, see SETUP.md section 9).
 */
export const QUICK_ACTIONS = [
  "feed",
  "feed-stop",
  "feed-left",
  "feed-right",
  "feed-both",
  "diaper-wet",
  "diaper-stool",
  "diaper-both",
  "diaper-dry",
] as const
export type QuickAction = (typeof QUICK_ACTIONS)[number]

/**
 * What the Sheet's quick action also takes, for Siri: bottles (with the amount offered) and "feed-details", the
 * answer to the question a stopped feed asks (a 1 to 5 score, or how much of the bottle went down).
 */
export type SheetAction = QuickAction | "feed-formula" | "feed-expressed" | "feed-details"

export const TABS = ["now", "history", "reports", "calendar", "settings"] as const

/** What the app was opened to do. */
export interface Launch {
  /** Open the form for a new entry of this type. */
  log?: EventType
  tab?: string
  /** Open an existing entry, e.g. from the "Feed stopped" notification. */
  edit?: string
  do?: QuickAction
}

const LOG_TYPES: EventType[] = ["feeding", "diaper", "med", "temp"]

export function parseLaunch(search: string): Launch {
  const params = new URLSearchParams(search)
  const log = params.get("log") as EventType | null
  const tab = params.get("tab")
  const edit = params.get("edit")
  const action = params.get("do") as QuickAction | null
  const out: Launch = {}
  if (log && LOG_TYPES.includes(log)) out.log = log
  if (tab && (TABS as readonly string[]).includes(tab)) out.tab = tab
  if (edit) out.edit = edit
  if (action && QUICK_ACTIONS.includes(action)) out.do = action
  return out
}

/**
 * A link that logs straight to the Sheet when POSTed, for the iPhone Shortcuts app or Android's HTTP Shortcuts.
 * The Sheet answers with a sentence such as "Wet diaper logged at 3:42 PM." for the shortcut to show or Siri to
 * say. A plain visit (a GET, as a link preview makes) does nothing. `extra` goes on the end in order, so a link can
 * end with "amount=" for the shortcut to put a number after.
 */
export function quickLink(api: string, code: string, action: SheetAction, extra: Record<string, string> = {}) {
  const url = new URL(api)
  url.searchParams.set("action", "quick")
  url.searchParams.set("format", "text")
  url.searchParams.set("code", code)
  url.searchParams.set("do", action)
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v)
  return url.href
}

/** The address without the launch parameters, so a reload doesn't repeat them. */
export function withoutLaunch(url: string) {
  const u = new URL(url)
  for (const p of ["log", "tab", "edit", "do"]) u.searchParams.delete(p)
  return u.pathname + u.search + u.hash
}
