import { useMemo, useState } from "react"

import type { Draft } from "@/components/entry-sheet"
import { EventIcon } from "@/components/event-icon"
import { eventDetails, eventTitle } from "@/components/describe"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { formatClock, formatDay } from "@/lib/time"
import type { EventType, LogEvent } from "@/lib/types"
import type { Unit } from "@/lib/units"

export function History({
  events,
  unit,
  days,
  onOpen,
  onLoadMore,
}: {
  events: LogEvent[]
  unit: Unit
  days: number
  onOpen: (draft: Draft) => void
  onLoadMore: () => void
}) {
  const [filter, setFilter] = useState<"all" | EventType>("all")

  const groups = useMemo(() => {
    const sorted = events
      .filter((e) => filter === "all" || e.type === filter)
      .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())
    const out: { day: string; items: LogEvent[] }[] = []
    for (const e of sorted) {
      const day = formatDay(e.start)
      if (out[out.length - 1]?.day !== day) out.push({ day, items: [] })
      out[out.length - 1].items.push(e)
    }
    return out
  }, [events, filter])

  return (
    <div className="grid gap-4">
      <ToggleGroup type="single" value={filter} onValueChange={(v) => v && setFilter(v as typeof filter)}>
        <ToggleGroupItem value="all">All</ToggleGroupItem>
        <ToggleGroupItem value="feeding">Feeds</ToggleGroupItem>
        <ToggleGroupItem value="diaper">Diapers</ToggleGroupItem>
        <ToggleGroupItem value="med">Meds</ToggleGroupItem>
      </ToggleGroup>

      {groups.length === 0 && (
        <p className="text-muted-foreground py-10 text-center text-sm">Nothing logged in the last {days} days.</p>
      )}

      {groups.map((g) => (
        <section key={g.day} className="grid gap-1">
          <h2 className="text-muted-foreground px-1 text-xs font-semibold tracking-wide uppercase">{g.day}</h2>
          <div className="bg-card divide-y rounded-xl border">
            {g.items.map((e) => (
              <button
                key={e.id}
                onClick={() => onOpen({ ...e, edit: true })}
                className="hover:bg-muted/60 flex w-full items-center gap-3 px-3 py-2.5 text-left first:rounded-t-xl last:rounded-b-xl"
              >
                <EventIcon event={e} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium">{eventTitle(e)}</span>
                    <span className="text-muted-foreground shrink-0 text-sm tabular-nums">{formatClock(e.start)}</span>
                  </div>
                  <div className="text-muted-foreground truncate text-sm">
                    {[eventDetails(e, unit), e.notes, e.by].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}

      <Button variant="outline" onClick={onLoadMore}>
        Show older entries
      </Button>
    </div>
  )
}
