import { useEffect, useState } from "react"
import { Baby, Droplet, Milk, Pill, Timer, Trash2 } from "lucide-react"

import { DateTimeField } from "@/components/datetime-field"
import { confidenceLabel } from "@/components/describe"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { consumedMl } from "@/lib/derive"
import { newId } from "@/lib/api"
import { isBottle, type EventType, type LogEvent } from "@/lib/types"
import { formatAmount, fromDisplay, toDisplay, type Unit } from "@/lib/units"

/** A new entry's starting values, or an existing entry with `edit: true`. */
export type Draft = (Partial<LogEvent> & { type: EventType; edit?: false }) | (LogEvent & { edit: true })

function blank(draft: Partial<LogEvent> & { type: EventType }, user: string): LogEvent {
  const now = new Date().toISOString()
  const defaults: Record<EventType, string> = { feeding: "left", diaper: "wet", med: "ibuprofen" }
  return {
    id: newId(),
    kind: defaults[draft.type],
    start: now,
    end: draft.type === "feeding" ? now : undefined,
    by: user,
    ...draft,
  }
}

const TITLES: Record<EventType, string> = {
  feeding: "Feeding",
  diaper: "Diaper",
  med: "Mom's medication",
}

function parseNum(value: string) {
  if (value.trim() === "") return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

export function EntrySheet({
  draft,
  onClose,
  onSave,
  onDelete,
  user,
  unit,
}: {
  draft: Draft | null
  onClose: () => void
  onSave: (event: LogEvent) => Promise<void>
  onDelete: (id: string) => void
  user: string
  unit: Unit
}) {
  const [event, setEvent] = useState<LogEvent | null>(null)
  const [bottleMode, setBottleMode] = useState<"left" | "percent">("left")
  const [saving, setSaving] = useState(false)
  const editing = Boolean(draft?.edit)

  useEffect(() => {
    if (!draft) return
    const { edit, ...rest } = draft
    const e = edit ? (rest as LogEvent) : blank(rest, user)
    setEvent(e)
    setBottleMode(e.percent !== undefined && e.amountEndMl === undefined ? "percent" : "left")
  }, [draft, user])

  const set = (patch: Partial<LogEvent>) => setEvent((e) => (e ? { ...e, ...patch } : e))

  async function submit(override?: Partial<LogEvent>) {
    if (!event) return
    const out: LogEvent = { ...event, ...override }
    if (out.type !== "feeding") delete out.end
    if (out.type === "feeding" && isBottle(out.kind)) {
      delete out.confidence
      if (bottleMode === "left") delete out.percent
      else delete out.amountEndMl
    } else {
      delete out.amountStartMl
      delete out.amountEndMl
      delete out.percent
    }
    setSaving(true)
    try {
      await onSave(out)
      onClose()
    } catch {
      // The tracker hook already showed a toast; keep the sheet open so nothing is lost.
    } finally {
      setSaving(false)
    }
  }

  const open = Boolean(draft && event)
  const bottle = event?.type === "feeding" && isBottle(event.kind)
  const drank = event && bottle ? consumedMl({ ...event, ...(bottleMode === "left" ? { percent: undefined } : { amountEndMl: undefined }) }) : undefined

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="overflow-y-auto">
        {event && (
          <>
            <SheetHeader>
              <SheetTitle>
                {editing ? "Edit" : "Log"} {TITLES[event.type].toLowerCase()}
              </SheetTitle>
              <SheetDescription>
                {editing ? `Logged by ${event.by}` : "Times default to now. Change them to log something earlier."}
              </SheetDescription>
            </SheetHeader>

            <form
              className="grid grid-cols-1 gap-5 px-4"
              onSubmit={(e) => {
                e.preventDefault()
                submit()
              }}
            >
              {event.type === "feeding" && (
                <>
                  <div className="grid gap-2">
                    <Label>Breast</Label>
                    <ToggleGroup type="single" value={event.kind} onValueChange={(v) => v && set({ kind: v })}>
                      <ToggleGroupItem value="left">
                        <Baby /> Left
                      </ToggleGroupItem>
                      <ToggleGroupItem value="right">
                        <Baby /> Right
                      </ToggleGroupItem>
                      <ToggleGroupItem value="both">Both</ToggleGroupItem>
                    </ToggleGroup>
                    <Label className="mt-1">Bottle</Label>
                    <ToggleGroup type="single" value={event.kind} onValueChange={(v) => v && set({ kind: v })}>
                      <ToggleGroupItem value="formula">
                        <Milk /> Formula
                      </ToggleGroupItem>
                      <ToggleGroupItem value="expressed">
                        <Milk /> Expressed
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>

                  <DateTimeField id="start" label="Started" value={event.start} onChange={(v) => v && set({ start: v })} />
                  <DateTimeField
                    id="end"
                    label="Finished"
                    value={event.end ?? ""}
                    onChange={(v) => set({ end: v || undefined })}
                    clearable
                  />
                  {!event.end && (
                    <p className="text-muted-foreground -mt-3 text-sm">
                      No finish time means the feeding is still going. You can stop it from the home screen.
                    </p>
                  )}

                  {bottle ? (
                    <div className="grid gap-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="grid gap-1.5">
                          <Label htmlFor="amt-start">Offered ({unit})</Label>
                          <Input
                            id="amt-start"
                            inputMode="decimal"
                            value={toDisplay(event.amountStartMl, unit) ?? ""}
                            onChange={(e) => set({ amountStartMl: fromDisplay(parseNum(e.target.value), unit) })}
                            placeholder={unit === "ml" ? "60" : "2"}
                          />
                        </div>
                        <div className="grid gap-1.5">
                          <Label htmlFor="amt-end">{bottleMode === "left" ? `Left over (${unit})` : "Drank (%)"}</Label>
                          {bottleMode === "left" ? (
                            <Input
                              id="amt-end"
                              inputMode="decimal"
                              value={toDisplay(event.amountEndMl, unit) ?? ""}
                              onChange={(e) => set({ amountEndMl: fromDisplay(parseNum(e.target.value), unit) })}
                              placeholder="0"
                            />
                          ) : (
                            <Input
                              id="amt-end"
                              inputMode="numeric"
                              value={event.percent ?? ""}
                              onChange={(e) => set({ percent: parseNum(e.target.value) })}
                              placeholder="100"
                            />
                          )}
                        </div>
                      </div>
                      <ToggleGroup
                        type="single"
                        value={bottleMode}
                        onValueChange={(v) => v && setBottleMode(v as "left" | "percent")}
                      >
                        <ToggleGroupItem value="left" className="h-8 text-xs">
                          Measure what's left
                        </ToggleGroupItem>
                        <ToggleGroupItem value="percent" className="h-8 text-xs">
                          Estimate % drank
                        </ToggleGroupItem>
                      </ToggleGroup>
                      {drank !== undefined && (
                        <p className="text-sm">
                          She drank about <strong>{formatAmount(drank, unit)}</strong>.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      <Label>How well did she eat?</Label>
                      <ToggleGroup
                        type="single"
                        value={event.confidence ? String(event.confidence) : ""}
                        onValueChange={(v) => set({ confidence: v ? Number(v) : undefined })}
                      >
                        {[1, 2, 3, 4, 5].map((n) => (
                          <ToggleGroupItem key={n} value={String(n)}>
                            {n}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                      <p className="text-muted-foreground text-sm">
                        {event.confidence ? confidenceLabel(event.confidence) : "1 means barely ate, 5 means a great feed."}
                      </p>
                    </div>
                  )}
                </>
              )}

              {event.type === "diaper" && (
                <>
                  <div className="grid gap-2">
                    <Label>What was in it?</Label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <ToggleGroup type="single" value={event.kind} onValueChange={(v) => v && set({ kind: v })} className="contents">
                        <ToggleGroupItem value="wet">
                          <Droplet /> Wet
                        </ToggleGroupItem>
                        <ToggleGroupItem value="stool">Stool</ToggleGroupItem>
                        <ToggleGroupItem value="both">Wet + stool</ToggleGroupItem>
                        <ToggleGroupItem value="dry">Checked, clean</ToggleGroupItem>
                      </ToggleGroup>
                    </div>
                  </div>
                  <DateTimeField id="start" label="Time" value={event.start} onChange={(v) => v && set({ start: v })} />
                </>
              )}

              {event.type === "med" && (
                <>
                  <div className="grid gap-2">
                    <Label>Medication</Label>
                    <ToggleGroup type="single" value={event.kind} onValueChange={(v) => v && set({ kind: v })}>
                      <ToggleGroupItem value="ibuprofen">
                        <Pill /> Ibuprofen
                      </ToggleGroupItem>
                      <ToggleGroupItem value="tylenol">
                        <Pill /> Tylenol
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                  <DateTimeField id="start" label="Taken at" value={event.start} onChange={(v) => v && set({ start: v })} />
                </>
              )}

              <div className="grid gap-1.5">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={event.notes ?? ""}
                  onChange={(e) => set({ notes: e.target.value || undefined })}
                  placeholder="Optional"
                  rows={2}
                />
              </div>
              <button type="submit" hidden />
            </form>

            <SheetFooter className="pt-1">
              <Button size="lg" disabled={saving} onClick={() => submit()}>
                {saving ? "Saving…" : editing ? "Save changes" : "Save"}
              </Button>
              {!editing && event.type === "feeding" && (
                <Button size="lg" variant="outline" disabled={saving} onClick={() => submit({ end: undefined })}>
                  <Timer /> Start timer instead
                </Button>
              )}
              {editing && (
                <Button
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => {
                    if (confirm("Delete this entry?")) {
                      onDelete(event.id)
                      onClose()
                    }
                  }}
                >
                  <Trash2 /> Delete
                </Button>
              )}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
