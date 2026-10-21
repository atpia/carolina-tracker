import { useEffect, useState } from "react"
import { Annoyed, Frown, Laugh, Meh, Smile, Timer, Trash2, type LucideIcon } from "lucide-react"

import { DateTimeField } from "@/components/datetime-field"
import { confidenceLabel } from "@/components/describe"
import { kindIcon, TYPE_ICONS } from "@/components/icons"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { consumedMl } from "@/lib/derive"
import { newId } from "@/lib/api"
import {
  DIAPER_LABELS,
  isBottle,
  MED_LABELS,
  type DiaperKind,
  type EventType,
  type LogEvent,
  type MedKind,
} from "@/lib/types"
import { formatAmount, fromDisplay, toDisplay, type Unit } from "@/lib/units"
import { cn } from "@/lib/utils"

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
  feeding: "feeding",
  diaper: "diaper",
  med: "mom's medication",
}

type BottleMode = "left" | "percent" | "amount"

const CONFIDENCE_ICONS: LucideIcon[] = [Frown, Annoyed, Meh, Smile, Laugh]

function parseNum(value: string) {
  if (value.trim() === "") return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function KindOption({
  type,
  kind,
  label,
  className,
}: {
  type: EventType
  kind: string
  label: string
  className?: string
}) {
  const Icon = kindIcon(type, kind)
  return (
    <ToggleGroupItem value={kind} className={className}>
      <Icon /> {label}
    </ToggleGroupItem>
  )
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
  const [bottleMode, setBottleMode] = useState<BottleMode>("left")
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
      if (bottleMode === "percent") delete out.amountEndMl
      else delete out.percent
      // A typed amount is stored as a bottle that was finished, so every report reads it the same way.
      if (bottleMode === "amount") out.amountEndMl = 0
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
      // The tracker hook already showed a toast; keep the drawer open so nothing is lost.
    } finally {
      setSaving(false)
    }
  }

  const open = Boolean(draft && event)
  const bottle = event?.type === "feeding" && isBottle(event.kind)
  const drank =
    event && bottle
      ? consumedMl({ ...event, ...(bottleMode === "percent" ? { amountEndMl: undefined } : { percent: undefined }) })
      : undefined
  const TypeIcon = event ? TYPE_ICONS[event.type] : null

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()} repositionInputs={false}>
      <DrawerContent>
        {event && TypeIcon && (
          <>
            <DrawerHeader className="text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
              <DrawerTitle className="flex items-center gap-2">
                <TypeIcon className="size-5" />
                {editing ? "Edit" : "Log"} {TITLES[event.type]}
              </DrawerTitle>
              <DrawerDescription>
                {editing
                  ? `Logged by ${event.by}${event.updatedBy && event.updatedBy !== event.by ? `, last edited by ${event.updatedBy}` : ""}`
                  : "Times default to now. Change them to log something earlier."}
              </DrawerDescription>
            </DrawerHeader>

            <form
              className="overflow-y-auto px-4"
              onSubmit={(e) => {
                e.preventDefault()
                submit()
              }}
            >
              <FieldGroup>
                {event.type === "feeding" && (
                  <>
                    <Field>
                      <FieldTitle>Breast</FieldTitle>
                      <ToggleGroup
                        type="single"
                        value={event.kind}
                        onValueChange={(v) => v && set({ kind: v })}
                        className="grid grid-cols-2"
                      >
                        <KindOption type="feeding" kind="left" label="Left" />
                        <KindOption type="feeding" kind="right" label="Right" />
                        <KindOption type="feeding" kind="both" label="Both sides" className="col-span-2 h-12" />
                      </ToggleGroup>
                      <FieldTitle className="mt-1">Bottle</FieldTitle>
                      <ToggleGroup type="single" value={event.kind} onValueChange={(v) => v && set({ kind: v })}>
                        <KindOption type="feeding" kind="formula" label="Formula" />
                        <KindOption type="feeding" kind="expressed" label="Expressed" />
                      </ToggleGroup>
                    </Field>

                    <DateTimeField
                      id="start"
                      label="Started"
                      value={event.start}
                      onChange={(v) => v && set({ start: v })}
                    />
                    <DateTimeField
                      id="end"
                      label="Finished"
                      value={event.end ?? ""}
                      onChange={(v) => set({ end: v || undefined })}
                      clearable
                      description={
                        !event.end
                          ? "No finish time means the feeding is still going. You can stop it from the home screen."
                          : undefined
                      }
                    />

                    {bottle ? (
                      <Field>
                        <FieldTitle>How much did she drink?</FieldTitle>
                        <ToggleGroup
                          type="single"
                          value={bottleMode}
                          onValueChange={(v) => {
                            if (!v) return
                            setBottleMode(v as BottleMode)
                            if (v === "percent" && event.percent === undefined) set({ percent: 100 })
                          }}
                        >
                          <ToggleGroupItem value="left" className="h-8 text-xs">
                            Left over
                          </ToggleGroupItem>
                          <ToggleGroupItem value="percent" className="h-8 text-xs">
                            Estimate %
                          </ToggleGroupItem>
                          <ToggleGroupItem value="amount" className="h-8 text-xs">
                            Type amount
                          </ToggleGroupItem>
                        </ToggleGroup>
                        {bottleMode === "amount" ? (
                          <Field>
                            <FieldLabel htmlFor="amt-drank">Drank ({unit})</FieldLabel>
                            <Input
                              id="amt-drank"
                              inputMode="decimal"
                              value={toDisplay(event.amountStartMl, unit) ?? ""}
                              onChange={(e) =>
                                set({ amountStartMl: fromDisplay(parseNum(e.target.value), unit), amountEndMl: 0 })
                              }
                              placeholder={unit === "ml" ? "45" : "1.5"}
                            />
                          </Field>
                        ) : (
                          <div className="grid grid-cols-2 gap-3">
                            <Field>
                              <FieldLabel htmlFor="amt-start">Offered ({unit})</FieldLabel>
                              <Input
                                id="amt-start"
                                inputMode="decimal"
                                value={toDisplay(event.amountStartMl, unit) ?? ""}
                                onChange={(e) => set({ amountStartMl: fromDisplay(parseNum(e.target.value), unit) })}
                                placeholder={unit === "ml" ? "60" : "2"}
                              />
                            </Field>
                            {bottleMode === "left" && (
                              <Field>
                                <FieldLabel htmlFor="amt-end">Left over ({unit})</FieldLabel>
                                <Input
                                  id="amt-end"
                                  inputMode="decimal"
                                  value={toDisplay(event.amountEndMl, unit) ?? ""}
                                  onChange={(e) => set({ amountEndMl: fromDisplay(parseNum(e.target.value), unit) })}
                                  placeholder="0"
                                />
                              </Field>
                            )}
                          </div>
                        )}
                        {bottleMode === "percent" && (
                          <Field className="gap-3 pt-1" data-vaul-no-drag>
                            <div className="flex items-baseline justify-between">
                              <FieldLabel htmlFor="percent">Drank</FieldLabel>
                              <span className="text-2xl font-semibold tabular-nums">{event.percent ?? 100}%</span>
                            </div>
                            <Slider
                              id="percent"
                              min={0}
                              max={100}
                              step={5}
                              value={[event.percent ?? 100]}
                              onValueChange={([v]) => set({ percent: v })}
                              aria-label="Percent of the bottle she drank"
                            />
                            <div className="text-muted-foreground flex justify-between text-xs tabular-nums">
                              <span>0%</span>
                              <span>50%</span>
                              <span>100%</span>
                            </div>
                          </Field>
                        )}
                        {drank !== undefined && bottleMode !== "amount" && (
                          <FieldDescription>
                            She drank about <strong className="text-foreground">{formatAmount(drank, unit)}</strong>.
                          </FieldDescription>
                        )}
                      </Field>
                    ) : (
                      <Field className="gap-3" data-vaul-no-drag>
                        <div className="flex items-baseline justify-between">
                          <FieldLabel htmlFor="confidence">How well did she eat?</FieldLabel>
                          <span className="text-sm font-medium">
                            {event.confidence
                              ? `${event.confidence}/5 · ${confidenceLabel(event.confidence)}`
                              : "Not rated"}
                          </span>
                        </div>
                        <Slider
                          id="confidence"
                          min={1}
                          max={5}
                          step={1}
                          value={[event.confidence ?? 3]}
                          onValueChange={([v]) => set({ confidence: v })}
                          className={cn(!event.confidence && "opacity-50")}
                          aria-label="How well she ate, from 1 to 5"
                        />
                        {/* Each icon is as wide as the slider thumb, so their centers line up with the steps. */}
                        <div className="flex justify-between">
                          {CONFIDENCE_ICONS.map((Icon, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => set({ confidence: i + 1 })}
                              aria-label={`${i + 1}: ${confidenceLabel(i + 1)}`}
                              className={cn(
                                "flex w-6 flex-col items-center gap-0.5 text-xs tabular-nums transition-colors",
                                event.confidence === i + 1 ? "text-foreground" : "text-muted-foreground",
                              )}
                            >
                              <Icon className={cn("size-6", event.confidence === i + 1 && "stroke-[2.5]")} />
                              {i + 1}
                            </button>
                          ))}
                        </div>
                        {!event.confidence && (
                          <FieldDescription>
                            Slide or tap a face. 1 means she barely ate, 5 means a great feed.
                          </FieldDescription>
                        )}
                      </Field>
                    )}
                  </>
                )}

                {event.type === "diaper" && (
                  <>
                    <Field>
                      <FieldTitle>What was in it?</FieldTitle>
                      <ToggleGroup
                        type="single"
                        value={event.kind}
                        onValueChange={(v) => v && set({ kind: v })}
                        className="grid grid-cols-2"
                      >
                        {(Object.keys(DIAPER_LABELS) as DiaperKind[]).map((k) => (
                          <KindOption key={k} type="diaper" kind={k} label={DIAPER_LABELS[k]} />
                        ))}
                      </ToggleGroup>
                    </Field>
                    <DateTimeField
                      id="start"
                      label="Time"
                      value={event.start}
                      onChange={(v) => v && set({ start: v })}
                    />
                  </>
                )}

                {event.type === "med" && (
                  <>
                    <Field>
                      <FieldTitle>Medication</FieldTitle>
                      <ToggleGroup type="single" value={event.kind} onValueChange={(v) => v && set({ kind: v })}>
                        {(Object.keys(MED_LABELS) as MedKind[]).map((k) => (
                          <KindOption key={k} type="med" kind={k} label={MED_LABELS[k]} />
                        ))}
                      </ToggleGroup>
                    </Field>
                    <DateTimeField
                      id="start"
                      label="Taken at"
                      value={event.start}
                      onChange={(v) => v && set({ start: v })}
                    />
                  </>
                )}

                <Field>
                  <FieldLabel htmlFor="notes">Notes</FieldLabel>
                  <Textarea
                    id="notes"
                    value={event.notes ?? ""}
                    onChange={(e) => set({ notes: e.target.value || undefined })}
                    placeholder="Optional"
                    rows={2}
                  />
                </Field>
              </FieldGroup>
              <button type="submit" hidden />
            </form>

            <DrawerFooter>
              <Button size="lg" disabled={saving} onClick={() => submit()}>
                {saving && <Spinner />}
                {saving ? "Saving" : editing ? "Save changes" : "Save"}
              </Button>
              {!editing && event.type === "feeding" && (
                <Button size="lg" variant="outline" disabled={saving} onClick={() => submit({ end: undefined })}>
                  <Timer /> Start timer instead
                </Button>
              )}
              {editing && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" className="text-destructive hover:text-destructive">
                      <Trash2 /> Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
                      <AlertDialogDescription>
                        It disappears from the app for everyone. A copy stays in the Google Sheet, marked as deleted.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep it</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        onClick={() => {
                          onDelete(event.id)
                          onClose()
                        }}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </DrawerFooter>
          </>
        )}
      </DrawerContent>
    </Drawer>
  )
}
