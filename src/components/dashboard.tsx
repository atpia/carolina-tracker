import { Fragment, useEffect, useState } from "react"
import { CircleCheck, CircleStop, Pencil, Plus, type LucideIcon } from "lucide-react"
import { toast } from "sonner"

import type { Draft } from "@/components/entry-sheet"
import { eventDetails, eventTitle } from "@/components/describe"
import { kindIcon, TYPE_ICONS } from "@/components/icons"
import { LightCard } from "@/components/light-card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { PendingButton } from "@/components/pending-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { useNow } from "@/hooks/use-now"
import { useTempUnit } from "@/hooks/use-temp-unit"
import { newId } from "@/lib/api"
import type { Status } from "@/lib/derive"
import { formatTemp, isFever } from "@/lib/temperature"
import { HOUR, formatClock, formatClockRange, formatDuration, formatTimer, relative } from "@/lib/time"
import {
  MED_LABELS,
  TEMP_LABELS,
  isBottle,
  type DailyKind,
  type DiaperKind,
  type LightState,
  type LogEvent,
  type PainMedKind,
  type TempMethod,
} from "@/lib/types"
import { formatAmount, type Unit } from "@/lib/units"
import { cn } from "@/lib/utils"

const t = (iso: string) => new Date(iso).getTime()

export function Dashboard({
  status,
  user,
  babyName,
  unit,
  onOpen,
  onSave,
  onRemove,
  light,
}: {
  status: Status
  user: string
  babyName: string
  unit: Unit
  onOpen: (draft: Draft) => void
  onSave: (event: LogEvent) => Promise<void>
  onRemove: (id: string) => Promise<void>
  /** Shown when the Sheet has a Home Assistant reading light set up. */
  light?: { onGet: () => Promise<LightState>; onSet: (light: LightState) => Promise<LightState> }
}) {
  const now = useNow(1000)

  async function quickLog(partial: Pick<LogEvent, "type" | "kind" | "doseMg">, message: string) {
    const event: LogEvent = { id: newId(), start: new Date().toISOString(), by: user, ...partial }
    try {
      await onSave(event)
      toast.success(message, {
        action: { label: "Undo", onClick: () => onRemove(event.id) },
      })
    } catch {
      // toast already shown
    }
  }

  return (
    <div className="grid gap-4">
      {status.activeFeeds.map(({ event, stale, switchAt, overAt }) =>
        stale ? (
          <ForgottenFeed key={event.id} event={event} now={now} onOpen={onOpen} />
        ) : (
          <ActiveFeed
            key={event.id}
            event={event}
            now={now}
            switchAt={switchAt}
            overAt={overAt}
            limitMin={status.breastLimitMin}
            onOpen={onOpen}
            onSave={onSave}
          />
        ),
      )}
      {light && <LightCard onGet={light.onGet} onSet={light.onSet} />}
      <MedsDue status={status} babyName={babyName} now={now} quickLog={quickLog} />
      <FeedingCard status={status} now={now} unit={unit} onOpen={onOpen} quickLog={quickLog} />
      <DiaperCard status={status} babyName={babyName} now={now} onOpen={onOpen} quickLog={quickLog} />
      <MedCard status={status} now={now} onOpen={onOpen} quickLog={quickLog} />
      <TempCard status={status} now={now} onOpen={onOpen} />
      <TodayCard status={status} unit={unit} />
    </div>
  )
}

/** How long the switch-sides nudge flashes before it settles into a note. */
const SWITCH_FLASH_MS = 2 * 60_000

function ActiveFeed({
  event,
  now,
  switchAt,
  overAt,
  limitMin,
  onOpen,
  onSave,
}: {
  event: LogEvent
  now: number
  /** "Both sides" feeds: when the first side reaches the limit. */
  switchAt?: number
  /** When the feed passes the per-side limit. The timer keeps counting. */
  overAt?: number
  limitMin: number
  onOpen: (draft: Draft) => void
  onSave: (event: LogEvent) => Promise<void>
}) {
  const over = overAt !== undefined && now >= overAt
  const switching = !over && switchAt !== undefined && now >= switchAt
  const flashing = over || (switching && now - switchAt! < SWITCH_FLASH_MS)
  const alert = over ? "over" : switching ? "switch" : undefined

  // One buzz each time a limit is reached, on phones that support it.
  useEffect(() => {
    if (alert) navigator.vibrate?.([300, 150, 300])
  }, [alert])

  let note = "Feeding in progress"
  if (over)
    note = `Over the ${limitMin} min ${event.kind === "both" ? "per side " : ""}limit by ${formatTimer(now - overAt!)}`
  else if (switching) note = `${limitMin} min on the first side. Time to switch.`

  return (
    <Card
      className={cn(
        "relative gap-3 overflow-hidden",
        over ? "border-destructive/60 bg-destructive/10" : "border-feed/40 bg-feed/10",
      )}
    >
      {flashing && (
        <>
          {/* The whole screen's edge pulses, so it's noticeable from across the room. */}
          <div
            aria-hidden
            className={cn(
              "limit-flash pointer-events-none fixed inset-0 z-40",
              over ? "shadow-[inset_0_0_0_8px_var(--destructive)]" : "shadow-[inset_0_0_0_8px_var(--feed)]",
            )}
          />
          <div
            aria-hidden
            className={cn(
              "limit-flash pointer-events-none absolute inset-0",
              over ? "bg-destructive/15" : "bg-feed/15",
            )}
          />
        </>
      )}
      <CardHeader className="relative">
        <CardDescription
          role={alert ? "alert" : undefined}
          className={cn("font-medium", over ? "text-destructive" : "text-feed")}
        >
          {note}
        </CardDescription>
        <CardTitle className={cn("text-4xl tabular-nums", over && "text-destructive")}>
          {formatTimer(now - t(event.start))}
        </CardTitle>
        <CardAction>
          <Badge variant="outline">{eventTitle(event)}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="relative grid grid-cols-2 gap-2">
        <Button
          size="lg"
          variant={over ? "destructive" : "default"}
          onClick={async () => {
            const done = { ...event, end: new Date().toISOString() }
            try {
              await onSave(done)
              // Open the entry so they can add a confidence score or bottle amounts right away.
              onOpen({ ...done, edit: true })
            } catch {
              // toast already shown
            }
          }}
        >
          <CircleStop /> Stop
        </Button>
        <Button size="lg" variant="outline" onClick={() => onOpen({ ...event, edit: true })}>
          <Pencil /> Edit
        </Button>
      </CardContent>
    </Card>
  )
}

/** Pain relievers stop nagging after a day without a dose, in case mom no longer needs them. */
const MED_BANNER_WINDOW = 24 * HOUR

/** One line in the "Due now" banner. */
interface DueItem {
  key: string
  label: string
  sub: string
  icon: LucideIcon
  log: () => Promise<void>
}

/**
 * Stays at the top while something can be taken: mom's next pain reliever once it's allowed, her probiotics,
 * and the baby's Vitamin D until today's is logged.
 */
function MedsDue({
  status,
  babyName,
  now,
  quickLog,
}: {
  status: Status
  babyName: string
  now: number
  quickLog: (partial: Pick<LogEvent, "type" | "kind" | "doseMg">, message: string) => Promise<void>
}) {
  const { nextMedKind, nextMedAt, lastMed, meds, daily } = status
  const items: DueItem[] = []
  if (lastMed && nextMedAt !== undefined && now >= nextMedAt && now - t(lastMed.start) < MED_BANNER_WINDOW)
    items.push({
      key: "pain",
      label: MED_LABELS[nextMedKind],
      sub: `Mom · allowed since ${formatClock(nextMedAt)} (${relative(nextMedAt, now)})`,
      icon: kindIcon("med", nextMedKind),
      log: () =>
        quickLog(
          { type: "med", kind: nextMedKind, doseMg: meds[nextMedKind].last?.doseMg },
          `${MED_LABELS[nextMedKind]} logged`,
        ),
    })
  if (!daily.probiotic)
    items.push({
      key: "probiotic",
      label: "Probiotics",
      sub: "Mom · not taken yet today",
      icon: kindIcon("med", "probiotic"),
      log: () => quickLog({ type: "med", kind: "probiotic" }, "Probiotics logged"),
    })
  if (!daily.vitamind)
    items.push({
      key: "vitamind",
      label: "Vitamin D",
      sub: `${babyName} · in a bottle, not given yet today`,
      icon: kindIcon("med", "vitamind"),
      log: () => quickLog({ type: "med", kind: "vitamind" }, "Vitamin D logged"),
    })
  if (!items.length) return null

  return (
    <Card className="border-med/40 bg-med/10 gap-3">
      <CardHeader>
        <CardDescription className="text-med flex items-center gap-1.5 font-medium">
          <TYPE_ICONS.med className="size-4" /> Due now
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {items.map((item, i) => (
          <Fragment key={item.key}>
            {i > 0 && <Separator />}
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-lg font-semibold">{item.label}</div>
                <div className="text-muted-foreground text-sm">{item.sub}</div>
              </div>
              <PendingButton variant={i === 0 ? "default" : "outline"} icon={item.icon} onClick={item.log}>
                Took it
              </PendingButton>
            </div>
          </Fragment>
        ))}
      </CardContent>
    </Card>
  )
}

/** A timer left running for hours: ask for the real finish time rather than stopping it now. */
function ForgottenFeed({ event, now, onOpen }: { event: LogEvent; now: number; onOpen: (draft: Draft) => void }) {
  return (
    <Card className="border-destructive/40 bg-destructive/10 gap-3">
      <CardHeader>
        <CardDescription className="text-destructive font-medium">Feeding timer still running</CardDescription>
        <CardTitle className="text-xl">
          {eventTitle(event)} started {formatClock(event.start)} ({relative(t(event.start), now)})
        </CardTitle>
        <p className="text-muted-foreground text-sm">
          It looks like it was never stopped. Add when the feed really ended so the next feeding window is right.
        </p>
      </CardHeader>
      <CardContent>
        <Button size="lg" className="w-full" onClick={() => onOpen({ ...event, edit: true })}>
          <Pencil /> Set finish time
        </Button>
      </CardContent>
    </Card>
  )
}

function FeedingCard({
  status,
  now,
  unit,
  onOpen,
  quickLog,
}: {
  status: Status
  now: number
  unit: Unit
  onOpen: (draft: Draft) => void
  quickLog: (partial: Pick<LogEvent, "type" | "kind" | "doseMg">, message: string) => Promise<void>
}) {
  const { lastFeed, lastSide, feedRunning, feedEndedAt, feedFrom, feedBy } = status
  let headline = "No feedings logged yet"
  let sub = ""
  let tone = "text-foreground"
  let progress = 0
  const suggested = nextSide(lastSide)

  if (feedRunning) {
    headline = "Feeding now"
    sub = "The next window starts counting when this feed ends."
    tone = "text-feed"
  } else if (lastFeed && feedEndedAt !== undefined && feedFrom && feedBy) {
    progress = Math.min(100, Math.max(0, ((now - feedEndedAt) / (feedBy - feedEndedAt)) * 100))
    if (now < feedFrom) {
      headline = `Next feed ${relative(feedFrom, now)}`
      sub = `Window ${formatClock(feedFrom)} to ${formatClock(feedBy)}`
    } else if (now <= feedBy) {
      headline = "Feeding window is open"
      sub = `Feed by ${formatClock(feedBy)} (${relative(feedBy, now)})`
      tone = "text-feed"
    } else {
      headline = `Overdue by ${formatDuration(now - feedBy)}`
      sub = `Expected by ${formatClock(feedBy)}`
      tone = "text-destructive"
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          <TYPE_ICONS.feeding className="text-feed size-4" /> Feeding
        </CardDescription>
        <CardTitle className={cn("text-2xl", tone)}>{headline}</CardTitle>
        {sub && <p className="text-muted-foreground text-sm">{sub}</p>}
      </CardHeader>
      <CardContent className="grid gap-4">
        {lastFeed && (
          <>
            {!feedRunning && (
              <Progress value={progress} indicatorClassName={cn(progress >= 100 ? "bg-destructive" : "bg-feed")} />
            )}
            <button
              className="hover:bg-muted -mx-2 rounded-md px-2 py-1 text-left text-sm"
              onClick={() => onOpen({ ...lastFeed, edit: true })}
            >
              {/* The window counts from the end, so show it when there is one. */}
              <span className="font-medium">Last: {eventTitle(lastFeed)}</span>{" "}
              {lastFeed.end
                ? `${formatClockRange(lastFeed.start, lastFeed.end)} (ended ${relative(t(lastFeed.end), now)})`
                : `at ${formatClock(lastFeed.start)} (${relative(t(lastFeed.start), now)})`}
              <span className="text-muted-foreground block">
                {[eventDetails(lastFeed, unit), `by ${lastFeed.by}`].filter(Boolean).join(" · ")}
              </span>
            </button>
          </>
        )}
        <Button
          size="lg"
          className="w-full"
          onClick={() =>
            onOpen({
              type: "feeding",
              kind: lastFeed && isBottle(lastFeed.kind) ? lastFeed.kind : suggested,
            })
          }
        >
          <Plus /> Add feed
        </Button>
        {lastSide && !(lastFeed && isBottle(lastFeed.kind)) && (
          <p className="text-muted-foreground -mt-2 text-xs">
            Last single side was {lastSide.kind}, so the form starts on the {suggested}.
          </p>
        )}
        <Separator />
        <DailyRow
          kind="vitamind"
          label="Vitamin D"
          hint="Drops in a bottle, once a day"
          verb="given"
          taken={status.daily.vitamind}
          onOpen={onOpen}
          onTake={() => quickLog({ type: "med", kind: "vitamind" }, "Vitamin D logged")}
        />
      </CardContent>
    </Card>
  )
}

/** Breastfeeding usually alternates sides, so suggest the opposite of the last single-side feed. */
function nextSide(lastSide?: LogEvent) {
  return lastSide?.kind === "left" ? "right" : "left"
}

const DIAPER_BUTTONS: { kind: DiaperKind; label: string; toast: string }[] = [
  { kind: "wet", label: "Wet", toast: "Wet diaper logged" },
  { kind: "stool", label: "Stool", toast: "Stool diaper logged" },
  { kind: "both", label: "Both", toast: "Wet + stool logged" },
  { kind: "dry", label: "Clean", toast: "Check logged, diaper was clean" },
]

function DiaperCard({
  status,
  babyName,
  now,
  onOpen,
  quickLog,
}: {
  status: Status
  babyName: string
  now: number
  onOpen: (draft: Draft) => void
  quickLog: (partial: Pick<LogEvent, "type" | "kind">, message: string) => Promise<void>
}) {
  const { lastChange, lastCheck, lastWet, lastStool, nextCheck } = status
  const due = nextCheck !== undefined && now >= nextCheck
  const headline = !nextCheck
    ? "No diaper checks yet"
    : due
      ? `Time to check ${babyName}'s diaper`
      : `Next check ${relative(nextCheck, now)}`

  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          <TYPE_ICONS.diaper className="text-diaper size-4" /> Diaper
        </CardDescription>
        <CardTitle className={cn("text-2xl", due && "text-diaper")}>{headline}</CardTitle>
        {lastCheck && (
          <p className="text-muted-foreground text-sm">
            Last checked {formatClock(lastCheck.start)} ({relative(t(lastCheck.start), now)}) by {lastCheck.by}
          </p>
        )}
        <CardAction>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Log a diaper with details"
            onClick={() => onOpen({ type: "diaper" })}
          >
            <Plus />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3">
        {lastChange && (
          <button
            className="hover:bg-muted -mx-2 rounded-md px-2 py-1 text-left text-sm"
            onClick={() => onOpen({ ...lastChange, edit: true })}
          >
            <span className="font-medium">Last change: {eventTitle(lastChange)}</span> at{" "}
            {formatClock(lastChange.start)} ({relative(t(lastChange.start), now)})
          </button>
        )}
        {(lastWet || lastStool) && (
          <p className="text-muted-foreground -mt-1 text-sm">
            {[
              lastWet && `Last wet ${relative(t(lastWet.start), now)}`,
              lastStool && `Last stool ${relative(t(lastStool.start), now)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          {DIAPER_BUTTONS.map(({ kind, label, toast }) => {
            const Icon = kindIcon("diaper", kind)
            return (
              <PendingButton
                key={kind}
                size="lg"
                variant={kind === "dry" ? "outline" : "secondary"}
                icon={Icon}
                onClick={() => quickLog({ type: "diaper", kind }, toast)}
              >
                {label}
              </PendingButton>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function MedCard({
  status,
  now,
  onOpen,
  quickLog,
}: {
  status: Status
  now: number
  onOpen: (draft: Draft) => void
  quickLog: (partial: Pick<LogEvent, "type" | "kind" | "doseMg">, message: string) => Promise<void>
}) {
  const { nextMedKind, nextMedAt, lastMed, meds, daily } = status
  const [confirm, setConfirm] = useState<{ kind: PainMedKind; reason: string } | null>(null)
  const other: PainMedKind = nextMedKind === "ibuprofen" ? "tylenol" : "ibuprofen"
  const ready = nextMedAt === undefined || now >= nextMedAt
  const remaining = nextMedAt ? nextMedAt - now : 0
  const NextIcon = kindIcon("med", nextMedKind)
  const OtherIcon = kindIcon("med", other)

  // Quick doses reuse the last mg entered for that medicine, so totals stay filled in.
  const log = (kind: PainMedKind) =>
    quickLog({ type: "med", kind, doseMg: meds[kind].last?.doseMg }, `${MED_LABELS[kind]} logged`)

  /** Why taking this medicine now would be ahead of the schedule, if it would be. */
  function tooSoon(kind: PainMedKind) {
    const same = meds[kind]
    if (same.last && same.nextAt !== undefined && now < same.nextAt)
      return `${MED_LABELS[kind]} was last taken ${relative(t(same.last.start), now)}. On this schedule it comes around again at ${formatClock(same.nextAt)}.`
    if (lastMed && nextMedAt !== undefined && now < nextMedAt)
      return `The last dose was ${relative(t(lastMed.start), now)}. The next one is due at ${formatClock(nextMedAt)}.`
    return undefined
  }

  function take(kind: PainMedKind) {
    const reason = tooSoon(kind)
    if (reason) setConfirm({ kind, reason })
    else return log(kind)
  }

  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          <TYPE_ICONS.med className="text-med size-4" /> Mom's medication
        </CardDescription>
        <CardTitle className="text-2xl">
          Next: <span className="text-med">{MED_LABELS[nextMedKind]}</span>
        </CardTitle>
        <p className="text-muted-foreground text-sm">
          {nextMedAt === undefined
            ? "Nothing logged yet."
            : ready
              ? `Ready now (since ${formatClock(nextMedAt)})`
              : `At ${formatClock(nextMedAt)}`}
        </p>
        <CardAction>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Log a dose at another time"
            onClick={() => onOpen({ type: "med", kind: nextMedKind, doseMg: meds[nextMedKind].last?.doseMg })}
          >
            <Plus />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3">
        {!ready && <div className="text-med text-4xl font-semibold tabular-nums">{formatTimer(remaining)}</div>}
        <div className="text-muted-foreground grid grid-cols-2 gap-2 text-sm">
          {(["ibuprofen", "tylenol"] as PainMedKind[]).map((kind) => (
            <MedLast key={kind} label={MED_LABELS[kind]} info={meds[kind]} now={now} onOpen={onOpen} />
          ))}
        </div>
        <PendingButton
          size="lg"
          variant={ready ? "default" : "secondary"}
          icon={NextIcon}
          onClick={() => take(nextMedKind)}
        >
          Took {MED_LABELS[nextMedKind]} now
        </PendingButton>
        <PendingButton
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          icon={OtherIcon}
          onClick={() => take(other)}
        >
          Took {MED_LABELS[other]} instead
        </PendingButton>
        <Separator />
        <DailyRow
          kind="probiotic"
          label="Probiotics"
          hint="Once a day, any time"
          taken={daily.probiotic}
          onOpen={onOpen}
          onTake={() => quickLog({ type: "med", kind: "probiotic" }, "Probiotics logged")}
        />
      </CardContent>
      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>That's earlier than scheduled</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.reason} Log it anyway?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Don't log</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirm && log(confirm.kind)}>Log it anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

/** A once-a-day item: no countdown, just whether today's has been logged. */
function DailyRow({
  kind,
  label,
  hint,
  verb = "taken",
  taken,
  onOpen,
  onTake,
}: {
  kind: DailyKind
  label: string
  hint: string
  /** "taken" for mom, "given" for the baby. */
  verb?: string
  taken?: LogEvent
  onOpen: (draft: Draft) => void
  onTake: () => Promise<void>
}) {
  const Icon = kindIcon("med", kind)
  if (taken)
    return (
      <button
        className="hover:bg-muted flex items-center gap-2 rounded-md px-1 py-1 text-left text-sm"
        onClick={() => onOpen({ ...taken, edit: true })}
      >
        <CircleCheck className="text-med size-4 shrink-0" />
        <span>
          <span className="font-medium">
            {label} {verb} today
          </span>
          <span className="text-muted-foreground">
            {" "}
            at {formatClock(taken.start)} by {taken.by}
          </span>
        </span>
      </button>
    )
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-sm">
        <div className="font-medium">
          {label} not {verb} yet today
        </div>
        <div className="text-muted-foreground text-xs">{hint}</div>
      </div>
      <PendingButton variant="outline" size="sm" icon={Icon} onClick={onTake}>
        Took it
      </PendingButton>
    </div>
  )
}

/** Temperature is log only: the latest reading, with a fever flagged, and a button to add one. */
function TempCard({ status, now, onOpen }: { status: Status; now: number; onOpen: (draft: Draft) => void }) {
  const tempUnit = useTempUnit()
  const last = status.lastTemp
  const fever = isFever(last?.tempC)
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          <TYPE_ICONS.temp className="text-temp size-4" /> Temperature
        </CardDescription>
        {last ? (
          <button className="text-left" onClick={() => onOpen({ ...last, edit: true })}>
            <CardTitle className={cn("text-2xl tabular-nums", fever && "text-destructive")}>
              {formatTemp(last.tempC, tempUnit)}
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              {TEMP_LABELS[last.kind as TempMethod] ?? last.kind} at {formatClock(last.start)} (
              {relative(t(last.start), now)}) by {last.by}
            </p>
          </button>
        ) : (
          <CardTitle className="text-2xl">No readings yet</CardTitle>
        )}
        {fever && (
          <p className="text-destructive text-sm">That's a fever for a newborn. Call her doctor if you haven't.</p>
        )}
      </CardHeader>
      <CardContent>
        <Button
          size="lg"
          variant="outline"
          className="w-full"
          onClick={() => onOpen({ type: "temp", kind: last?.kind ?? "rectal" })}
        >
          <Plus /> Log temperature
        </Button>
      </CardContent>
    </Card>
  )
}

function MedLast({
  label,
  info,
  now,
  onOpen,
}: {
  label: string
  info: Status["meds"][PainMedKind]
  now: number
  onOpen: (draft: Draft) => void
}) {
  const event = info.last
  const day = info.doses24h ? `${info.doses24h} in 24h${info.mg24h ? ` · ${info.mg24h.toLocaleString()} mg` : ""}` : ""
  return (
    <button
      className="bg-muted/60 hover:bg-muted rounded-md px-3 py-2 text-left disabled:pointer-events-none"
      disabled={!event}
      onClick={() => event && onOpen({ ...event, edit: true })}
    >
      <div className="text-foreground font-medium">{label}</div>
      {event ? `${formatClock(event.start)} · ${relative(t(event.start), now)}` : "Not yet"}
      {day && <div className="text-xs">{day}</div>}
    </button>
  )
}

function TodayCard({ status, unit }: { status: Status; unit: Unit }) {
  const { feeds, bottleMl, wet, stool } = status.today
  const { targets } = status
  const stats = [
    { label: "Feeds", value: feeds, goal: targets.feeds },
    { label: "Bottle", value: formatAmount(bottleMl, unit) },
    { label: "Wet", value: wet, goal: targets.wet },
    { label: "Stool", value: stool },
  ]
  return (
    <Card className="gap-3 py-4">
      <CardHeader>
        <CardDescription>Today so far</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-4 gap-2 text-center">
        {stats.map((s) => (
          <div key={s.label}>
            <div className="text-xl font-semibold tabular-nums">
              {s.value}
              {s.goal ? <span className="text-muted-foreground text-sm font-normal">/{s.goal}</span> : null}
            </div>
            <div className="text-muted-foreground text-xs">{s.label}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
