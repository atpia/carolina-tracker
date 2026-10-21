import { useMemo, useState } from "react"
import { History as HistoryIcon, List } from "lucide-react"

import type { Draft } from "@/components/entry-sheet"
import { EventIcon } from "@/components/event-icon"
import { eventDetails, eventTitle } from "@/components/describe"
import { TYPE_ICONS } from "@/components/icons"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { formatClock, formatDay } from "@/lib/time"
import type { EventType, LogEvent } from "@/lib/types"
import type { Unit } from "@/lib/units"

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?"
}

const FILTERS: { value: "all" | EventType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "feeding", label: "Feeds" },
  { value: "diaper", label: "Diapers" },
  { value: "med", label: "Meds" },
]

export function History({
  events,
  unit,
  days,
  loadedDays,
  onOpen,
  onLoadMore,
}: {
  events: LogEvent[]
  unit: Unit
  days: number
  loadedDays: number
  onOpen: (draft: Draft) => void
  onLoadMore: () => void
}) {
  const loadingMore = loadedDays > 0 && loadedDays < days
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
        {FILTERS.map(({ value, label }) => {
          const Icon = value === "all" ? List : TYPE_ICONS[value]
          return (
            <ToggleGroupItem key={value} value={value} className="px-1 text-xs">
              <Icon /> {label}
            </ToggleGroupItem>
          )
        })}
      </ToggleGroup>

      {groups.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia>
              <HistoryIcon />
            </EmptyMedia>
            <EmptyTitle>Nothing here yet</EmptyTitle>
            <EmptyDescription>
              Nothing was logged in the last {days} days. Entries from every caregiver show up here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {groups.map((g) => (
        <section key={g.day} className="grid gap-1.5">
          <h2 className="text-muted-foreground px-1 text-xs font-semibold tracking-wide uppercase">{g.day}</h2>
          <ItemGroup className="bg-card divide-y overflow-hidden rounded-xl border">
            {g.items.map((e) => (
              <Item key={e.id} asChild className="rounded-none">
                <button onClick={() => onOpen({ ...e, edit: true })}>
                  <ItemMedia>
                    <EventIcon event={e} />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle className="w-full justify-between">
                      <span className="truncate">{eventTitle(e)}</span>
                      <span className="text-muted-foreground shrink-0 font-normal tabular-nums">
                        {formatClock(e.start)}
                      </span>
                    </ItemTitle>
                    {(eventDetails(e, unit) || e.notes) && (
                      <ItemDescription className="line-clamp-1">
                        {[eventDetails(e, unit), e.notes].filter(Boolean).join(" · ")}
                      </ItemDescription>
                    )}
                  </ItemContent>
                  <ItemActions>
                    <Avatar className="size-7" title={`Logged by ${e.by}`}>
                      <AvatarFallback className="text-[0.65rem] font-medium">{initials(e.by)}</AvatarFallback>
                    </Avatar>
                  </ItemActions>
                </button>
              </Item>
            ))}
          </ItemGroup>
        </section>
      ))}

      <div className="grid gap-1.5">
        <Button variant="outline" onClick={onLoadMore} disabled={loadingMore}>
          {loadingMore ? <Spinner /> : <HistoryIcon />}
          {loadingMore ? "Loading older entries" : "Show older entries"}
        </Button>
        {loadedDays > 0 && (
          <p className="text-muted-foreground text-center text-xs">Showing the last {loadedDays} days</p>
        )}
      </div>
    </div>
  )
}
