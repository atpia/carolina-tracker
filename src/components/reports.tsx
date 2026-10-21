import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import type { DateRange } from "react-day-picker"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { CalendarRange, ClipboardCopy, Droplets } from "lucide-react"
import { toast } from "sonner"

import { eventDetails, eventTitle } from "@/components/describe"
import { EventIcon } from "@/components/event-icon"
import { isPairKind, TYPE_ICONS } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useNow } from "@/hooks/use-now"
import { analyze, bucketSize, type Range } from "@/lib/analytics"
import { per, rangeLabel, summaryText } from "@/lib/summary"
import { formatDuration, HOUR } from "@/lib/time"
import type { LogEvent } from "@/lib/types"
import { formatAmount, toDisplay, type Unit } from "@/lib/units"

type Preset = "24h" | "7d" | "custom"

/** The chosen range. The app holds it, so it survives switching tabs. */
export interface ReportRange {
  preset: Preset
  custom?: DateRange
}

const feedChart = {
  breast: { label: "Breast", color: "var(--chart-1)" },
  formula: { label: "Formula", color: "var(--chart-2)" },
  expressed: { label: "Expressed", color: "var(--chart-3)" },
} satisfies ChartConfig

const diaperChart = {
  wet: { label: "Wet", color: "var(--chart-1)" },
  stool: { label: "Stool", color: "var(--chart-2)" },
} satisfies ChartConfig

function rangeFor(preset: Preset, custom: DateRange | undefined, now: number): Range {
  if (preset === "24h") return { from: now - 24 * HOUR, to: now, live: true }
  if (preset === "7d" || !custom?.from) {
    // Today plus the six full days before it, so each bar is a whole calendar day.
    const from = new Date()
    from.setHours(0, 0, 0, 0)
    from.setDate(from.getDate() - 6)
    return { from: from.getTime(), to: now, live: true }
  }
  const from = new Date(custom.from)
  from.setHours(0, 0, 0, 0)
  const to = new Date(custom.to ?? custom.from)
  to.setHours(24, 0, 0, 0)
  return { from: from.getTime(), to: Math.min(to.getTime(), now), live: to.getTime() >= now }
}

export function Reports({
  events,
  unit,
  babyName,
  loadedDays,
  onEnsureDays,
  selected,
  onSelect,
}: {
  events: LogEvent[]
  unit: Unit
  babyName: string
  /** How many days back the app has loaded so far. */
  loadedDays: number
  onEnsureDays: (days: number) => void
  selected: ReportRange
  onSelect: (range: ReportRange) => void
}) {
  const { preset, custom } = selected
  const setPreset = (p: Preset) => onSelect({ ...selected, preset: p })
  const [pickerOpen, setPickerOpen] = useState(false)

  // Ticks every minute so a range that ends "now" keeps up while the tab stays open.
  const now = useNow(60_000)
  const range = useMemo(() => rangeFor(preset, custom, now), [preset, custom, now])
  const a = useMemo(() => analyze(events, range), [events, range])

  useEffect(() => {
    onEnsureDays((Date.now() - range.from) / (24 * HOUR) + 1)
  }, [range.from, onEnsureDays])

  async function copySummary() {
    const text = summaryText(babyName, range, a, unit)
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Summary copied. Paste it into a message or note for the doctor.")
    } catch {
      toast.error("Couldn't copy on this device.")
    }
  }

  // Stats for older dates would be partial until those days arrive.
  const loadingOlder = Date.now() - loadedDays * 24 * HOUR > range.from

  const hourly = bucketSize(range) === "hour"
  const unitLabel = hourly ? "hour" : "day"
  const chartData = a.buckets.map((b) => ({ ...b, bottle: toDisplay(b.bottleMl, unit) ?? 0 }))

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid gap-2">
        <ToggleGroup
          type="single"
          value={preset}
          onValueChange={(v) => {
            if (!v) return
            setPreset(v as Preset)
            if (v === "custom") setPickerOpen(true)
          }}
        >
          <ToggleGroupItem value="24h">24 hours</ToggleGroupItem>
          <ToggleGroupItem value="7d">7 days</ToggleGroupItem>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <ToggleGroupItem value="custom">
                <CalendarRange /> Dates
              </ToggleGroupItem>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={custom}
                onSelect={(r) => onSelect({ preset: "custom", custom: r })}
                disabled={{ after: new Date() }}
                defaultMonth={custom?.from}
                autoFocus
              />
              <div className="flex justify-end border-t p-2">
                <Button size="sm" onClick={() => setPickerOpen(false)} disabled={!custom?.from}>
                  Done
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </ToggleGroup>
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
            {loadingOlder ? (
              <>
                <Spinner className="size-3.5" /> Loading older entries
              </>
            ) : (
              rangeLabel(range)
            )}
          </p>
          <Button variant="outline" size="sm" onClick={copySummary}>
            <ClipboardCopy /> Copy summary
          </Button>
        </div>
      </div>

      <Tabs defaultValue="feeding" className="gap-4">
        <TabsList className="w-full">
          <TabsTrigger value="feeding">
            <TYPE_ICONS.feeding /> Feeding
          </TabsTrigger>
          <TabsTrigger value="diapers">
            <Droplets /> Diapers
          </TabsTrigger>
        </TabsList>

        <TabsContent value="feeding" className="grid grid-cols-1 gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Feeds" value={String(a.feeding.count)} sub={per(a.feeding.perDay, a.days)} />
            <Stat
              label="Time between feeds"
              value={a.feeding.avgInterval ? formatDuration(a.feeding.avgInterval) : "–"}
              sub={a.feeding.longestGap.ms ? `Longest ${formatDuration(a.feeding.longestGap.ms)}` : "average"}
            />
            <Stat
              label="Breast feeds"
              value={String(a.feeding.breastCount)}
              sub={[
                a.feeding.avgBreastMs ? `${formatDuration(a.feeding.avgBreastMs)} avg` : "",
                a.feeding.avgConfidence ? `rated ${a.feeding.avgConfidence.toFixed(1)}/5` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            />
            <Stat
              label="Bottle intake"
              value={formatAmount(a.feeding.bottleMl, unit) || `0 ${unit}`}
              sub={
                a.days >= 1.5
                  ? `${formatAmount(a.feeding.bottleMlPerDay, unit)} per day`
                  : `${a.feeding.bottleCount} bottle${a.feeding.bottleCount === 1 ? "" : "s"}`
              }
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Feeds per {unitLabel}</CardTitle>
              <CardDescription>Breast and bottle feeds, by when each one started</CardDescription>
            </CardHeader>
            <CardContent className="px-2">
              <ChartContainer config={feedChart} className="aspect-auto h-56 w-full">
                <BarChart data={chartData} margin={{ left: -20, right: 4 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="breast" stackId="f" fill="var(--color-breast)" stroke="var(--card)" strokeWidth={1} />
                  <Bar dataKey="formula" stackId="f" fill="var(--color-formula)" stroke="var(--card)" strokeWidth={1} />
                  <Bar
                    dataKey="expressed"
                    stackId="f"
                    fill="var(--color-expressed)"
                    stroke="var(--card)"
                    strokeWidth={1}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bottle intake per {unitLabel}</CardTitle>
              <CardDescription>Formula and expressed milk she actually drank, in {unit}</CardDescription>
            </CardHeader>
            <CardContent className="px-2">
              <ChartContainer
                config={{ bottle: { label: `Drank (${unit})`, color: "var(--chart-3)" } }}
                className="aspect-auto h-48 w-full"
              >
                <BarChart data={chartData} margin={{ left: -20, right: 4 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
                  <YAxis tickLine={false} axisLine={false} width={40} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                  <Bar dataKey="bottle" fill="var(--color-bottle)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <LogTable events={a.feeds} unit={unit} empty="No feedings in this range." />
        </TabsContent>

        <TabsContent value="diapers" className="grid grid-cols-1 gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Wet diapers" value={String(a.diaper.wet)} sub={per(a.diaper.wetPerDay, a.days)} />
            <Stat label="Stools" value={String(a.diaper.stool)} sub={per(a.diaper.stoolPerDay, a.days)} />
            <Stat
              label="Longest without wet"
              value={a.diaper.longestWithoutWet.ms ? formatDuration(a.diaper.longestWithoutWet.ms) : "–"}
              sub={gapNote(a.diaper.longestWithoutWet, "wet diapers")}
            />
            <Stat
              label="Longest without stool"
              value={a.diaper.longestWithoutStool.ms ? formatDuration(a.diaper.longestWithoutStool.ms) : "–"}
              sub={gapNote(a.diaper.longestWithoutStool, "stools")}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Diapers per {unitLabel}</CardTitle>
              <CardDescription>A wet + stool diaper counts once in each</CardDescription>
            </CardHeader>
            <CardContent className="px-2">
              <ChartContainer config={diaperChart} className="aspect-auto h-56 w-full">
                <BarChart data={chartData} margin={{ left: -20, right: 4 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="wet" fill="var(--color-wet)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="stool" fill="var(--color-stool)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <LogTable events={a.diapers} unit={unit} empty="No diapers in this range." />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function gapNote(gap: { at?: number; ongoing: boolean }, noun: string) {
  if (gap.at === undefined) return `needs more ${noun} logged`
  const from = format(new Date(gap.at), "MMM d, h:mm a")
  return gap.ongoing ? `since ${from}, still going` : `from ${from}`
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="gap-1 py-4">
      <CardHeader className="px-4">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {sub && <CardContent className="text-muted-foreground px-4 text-xs">{sub}</CardContent>}
    </Card>
  )
}

function LogTable({ events, unit, empty }: { events: LogEvent[]; unit: Unit; empty: string }) {
  const rows = [...events].reverse()
  return (
    <Card className="min-w-0 gap-2">
      <CardHeader>
        <CardTitle>Log</CardTitle>
        <CardDescription>
          {rows.length} entr{rows.length === 1 ? "y" : "ies"}, newest first
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2">
        {rows.length === 0 ? (
          <p className="text-muted-foreground px-3 py-6 text-center text-sm">{empty}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="tabular-nums">{format(new Date(e.start), "MMM d, h:mm a")}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <EventIcon
                        event={e}
                        className={isPairKind(e.type, e.kind) ? "size-6 [&_svg]:size-2.5" : "size-6 [&_svg]:size-3.5"}
                      />
                      {eventTitle(e)}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{eventDetails(e, unit) || "–"}</TableCell>
                  <TableCell className="text-muted-foreground">{e.by}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
