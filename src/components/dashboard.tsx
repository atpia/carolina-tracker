import { CircleStop, Pencil, Plus } from "lucide-react"
import { toast } from "sonner"

import type { Draft } from "@/components/entry-sheet"
import { eventDetails, eventTitle } from "@/components/describe"
import { kindIcon, TYPE_ICONS } from "@/components/icons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { useNow } from "@/hooks/use-now"
import { newId } from "@/lib/api"
import type { Status } from "@/lib/derive"
import { formatClock, formatDuration, formatTimer, relative } from "@/lib/time"
import { MED_LABELS, isBottle, type DiaperKind, type LogEvent, type MedKind } from "@/lib/types"
import { formatAmount, type Unit } from "@/lib/units"
import { cn } from "@/lib/utils"

const t = (iso: string) => new Date(iso).getTime()

export function Dashboard({
  status,
  user,
  unit,
  onOpen,
  onSave,
  onRemove,
}: {
  status: Status
  user: string
  unit: Unit
  onOpen: (draft: Draft) => void
  onSave: (event: LogEvent) => Promise<void>
  onRemove: (id: string) => Promise<void>
}) {
  const now = useNow(1000)

  async function quickLog(partial: Pick<LogEvent, "type" | "kind">, message: string) {
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
      {status.activeFeed && <ActiveFeed event={status.activeFeed} now={now} onOpen={onOpen} onSave={onSave} />}
      <FeedingCard status={status} now={now} unit={unit} onOpen={onOpen} />
      <DiaperCard status={status} now={now} onOpen={onOpen} quickLog={quickLog} />
      <MedCard status={status} now={now} onOpen={onOpen} quickLog={quickLog} />
      <TodayCard status={status} unit={unit} />
    </div>
  )
}

function ActiveFeed({
  event,
  now,
  onOpen,
  onSave,
}: {
  event: LogEvent
  now: number
  onOpen: (draft: Draft) => void
  onSave: (event: LogEvent) => Promise<void>
}) {
  return (
    <Card className="border-feed/40 bg-feed/10 gap-3">
      <CardHeader>
        <CardDescription className="text-feed font-medium">Feeding in progress</CardDescription>
        <CardTitle className="text-4xl tabular-nums">{formatTimer(now - t(event.start))}</CardTitle>
        <CardAction>
          <Badge variant="outline">{eventTitle(event)}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2">
        <Button
          size="lg"
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

function FeedingCard({
  status,
  now,
  unit,
  onOpen,
}: {
  status: Status
  now: number
  unit: Unit
  onOpen: (draft: Draft) => void
}) {
  const { lastFeed, feedFrom, feedBy } = status
  let headline = "No feedings logged yet"
  let sub = ""
  let tone = "text-foreground"
  let progress = 0

  if (lastFeed && feedFrom && feedBy) {
    const startedAt = t(lastFeed.start)
    progress = Math.min(100, ((now - startedAt) / (feedBy - startedAt)) * 100)
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
            <Progress value={progress} indicatorClassName={cn(progress >= 100 ? "bg-destructive" : "bg-feed")} />
            <button
              className="hover:bg-muted -mx-2 rounded-md px-2 py-1 text-left text-sm"
              onClick={() => onOpen({ ...lastFeed, edit: true })}
            >
              <span className="font-medium">Last: {eventTitle(lastFeed)}</span> at {formatClock(lastFeed.start)} (
              {relative(t(lastFeed.start), now)})
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
              kind: lastFeed && isBottle(lastFeed.kind) ? lastFeed.kind : lastSideSuggestion(lastFeed),
            })
          }
        >
          <Plus /> Add feed
        </Button>
        {lastFeed && !isBottle(lastFeed.kind) && lastFeed.kind !== "both" && (
          <p className="text-muted-foreground -mt-2 text-xs">
            Last side was {lastFeed.kind}, so the form starts on the {lastSideSuggestion(lastFeed)}.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/** Breastfeeding usually alternates sides, so suggest the opposite of the last one. */
function lastSideSuggestion(last?: LogEvent) {
  if (last?.kind === "left") return "right"
  if (last?.kind === "right") return "left"
  return "left"
}

const DIAPER_BUTTONS: { kind: DiaperKind; label: string; toast: string }[] = [
  { kind: "wet", label: "Wet", toast: "Wet diaper logged" },
  { kind: "stool", label: "Stool", toast: "Stool diaper logged" },
  { kind: "both", label: "Both", toast: "Wet + stool logged" },
  { kind: "dry", label: "Clean", toast: "Check logged, diaper was clean" },
]

function DiaperCard({
  status,
  now,
  onOpen,
  quickLog,
}: {
  status: Status
  now: number
  onOpen: (draft: Draft) => void
  quickLog: (partial: Pick<LogEvent, "type" | "kind">, message: string) => void
}) {
  const { lastChange, lastCheck, nextCheck } = status
  const due = nextCheck !== undefined && now >= nextCheck
  const headline = !nextCheck
    ? "No diaper checks yet"
    : due
      ? "Time to check her diaper"
      : `Next check ${relative(nextCheck, now)}`

  const log = (kind: DiaperKind, label: string) => quickLog({ type: "diaper", kind }, label)

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
        <div className="grid grid-cols-2 gap-2">
          {DIAPER_BUTTONS.map(({ kind, label, toast }) => {
            const Icon = kindIcon("diaper", kind)
            return (
              <Button
                key={kind}
                size="lg"
                variant={kind === "dry" ? "outline" : "secondary"}
                onClick={() => log(kind, toast)}
              >
                <Icon /> {label}
              </Button>
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
  quickLog: (partial: Pick<LogEvent, "type" | "kind">, message: string) => void
}) {
  const { nextMedKind, nextMedAt, lastIbuprofen, lastTylenol } = status
  const other: MedKind = nextMedKind === "ibuprofen" ? "tylenol" : "ibuprofen"
  const ready = nextMedAt === undefined || now >= nextMedAt
  const remaining = nextMedAt ? nextMedAt - now : 0
  const NextIcon = kindIcon("med", nextMedKind)
  const OtherIcon = kindIcon("med", other)

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
            onClick={() => onOpen({ type: "med", kind: nextMedKind })}
          >
            <Plus />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3">
        {!ready && <div className="text-med text-4xl font-semibold tabular-nums">{formatTimer(remaining)}</div>}
        <div className="text-muted-foreground grid grid-cols-2 gap-2 text-sm">
          <MedLast label="Ibuprofen" event={lastIbuprofen} now={now} onOpen={onOpen} />
          <MedLast label="Tylenol" event={lastTylenol} now={now} onOpen={onOpen} />
        </div>
        <Button
          size="lg"
          variant={ready ? "default" : "secondary"}
          onClick={() => quickLog({ type: "med", kind: nextMedKind }, `${MED_LABELS[nextMedKind]} logged`)}
        >
          <NextIcon /> Took {MED_LABELS[nextMedKind]} now
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => quickLog({ type: "med", kind: other }, `${MED_LABELS[other]} logged`)}
        >
          <OtherIcon /> Took {MED_LABELS[other]} instead
        </Button>
      </CardContent>
    </Card>
  )
}

function MedLast({
  label,
  event,
  now,
  onOpen,
}: {
  label: string
  event?: LogEvent
  now: number
  onOpen: (draft: Draft) => void
}) {
  return (
    <button
      className="bg-muted/60 hover:bg-muted rounded-md px-3 py-2 text-left disabled:pointer-events-none"
      disabled={!event}
      onClick={() => event && onOpen({ ...event, edit: true })}
    >
      <div className="text-foreground font-medium">{label}</div>
      {event ? `${formatClock(event.start)} · ${relative(t(event.start), now)}` : "Not yet"}
    </button>
  )
}

function TodayCard({ status, unit }: { status: Status; unit: Unit }) {
  const { feeds, bottleMl, wet, stool } = status.today
  const stats = [
    { label: "Feeds", value: feeds },
    { label: "Bottle", value: bottleMl ? formatAmount(bottleMl, unit) : "0" },
    { label: "Wet", value: wet },
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
            <div className="text-xl font-semibold tabular-nums">{s.value}</div>
            <div className="text-muted-foreground text-xs">{s.label}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
