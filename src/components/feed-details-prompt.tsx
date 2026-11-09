import { MessageCircleQuestion } from "lucide-react"
import { useSyncExternalStore } from "react"

import { confidenceLabel, eventTitle } from "@/components/describe"
import type { Draft } from "@/components/entry-sheet"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/components/ui/toast"
import { askedFeeds, feedToAsk, markAsked, onAskedFeeds } from "@/lib/feed-details"
import { formatClockRange, formatDuration } from "@/lib/time"
import type { LogEvent } from "@/lib/types"
import { formatAmount, type Unit } from "@/lib/units"

const PERCENTS = [25, 50, 75, 100]

/** Which feeds this phone has already asked about, kept current across the app. */
function useAskedFeeds() {
  return useSyncExternalStore(onAskedFeeds, askedFeeds, askedFeeds)
}

/**
 * Asks how a feed went when it was stopped without saying, by Siri, a widget or the notification: a 1 to 5 score
 * for the breast, or how much of the bottle went down. One tap saves it; "More" opens the full form.
 */
export function FeedDetailsPrompt({
  events,
  user,
  babyName,
  unit,
  now,
  onSave,
  onOpen,
}: {
  events: LogEvent[]
  user: string
  babyName: string
  unit: Unit
  now: number
  onSave: (event: LogEvent, options?: { quiet?: boolean }) => Promise<void>
  onOpen: (draft: Draft) => void
}) {
  const asked = useAskedFeeds()
  const ask = feedToAsk(events, user, asked, now)
  if (!ask) return null
  const { event, need } = ask
  const name = eventTitle(event).toLowerCase()
  const ms = new Date(event.end!).getTime() - new Date(event.start).getTime()

  function answer(patch: Partial<LogEvent>, said: string) {
    markAsked(event.id)
    toast.promise(onSave({ ...event, ...patch }, { quiet: true }), {
      loading: "Saving…",
      success: { title: "Saved", description: said },
      error: (e: Error) => ({ title: "Couldn't save", description: e.message }),
    })
  }

  const title =
    need === "rating"
      ? `How did the ${name} feed go?`
      : need === "percent"
        ? `How much of the ${formatAmount(event.amountStartMl, unit)} ${name} did ${babyName} drink?`
        : `How much ${name} did ${babyName} drink?`

  return (
    <Card className="border-feed/40 gap-3">
      <CardHeader>
        <CardDescription className="text-feed flex items-center gap-1.5 font-medium">
          <MessageCircleQuestion className="size-4" /> Stopped without details
        </CardDescription>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>
          {formatClockRange(event.start, event.end!)} ({formatDuration(Math.max(ms, 60_000))})
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {need === "rating" && (
          <div className="grid grid-cols-5 gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <Button
                key={n}
                variant="outline"
                className="h-auto flex-col gap-0 py-2"
                aria-label={`${n}: ${confidenceLabel(n)}`}
                onClick={() => answer({ confidence: n }, `${n} out of 5, ${confidenceLabel(n).toLowerCase()}.`)}
              >
                <span className="text-base font-semibold">{n}</span>
                <span className="text-muted-foreground text-[10px] leading-tight">{confidenceLabel(n)}</span>
              </Button>
            ))}
          </div>
        )}
        {need === "percent" && (
          <div className="grid grid-cols-4 gap-1.5">
            {PERCENTS.map((p) => (
              <Button key={p} variant="outline" onClick={() => answer({ percent: p }, `${babyName} drank ${p}%.`)}>
                {p}%
              </Button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            variant={need === "amount" ? "default" : "ghost"}
            onClick={() => {
              markAsked(event.id)
              onOpen({ ...event, edit: true })
            }}
          >
            {need === "amount" ? "Add the amount" : "More details"}
          </Button>
          <Button variant="ghost" onClick={() => markAsked(event.id)}>
            Skip
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
