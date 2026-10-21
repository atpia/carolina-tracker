import { Fragment, useMemo, useState } from "react"
import { BookmarkPlus, CalendarCheck, CalendarClock, CalendarPlus, CalendarX, MapPin, Plus, RefreshCw, Trash2 } from "lucide-react"
import { toast } from "sonner"

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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import type { Appointments as AppointmentsState } from "@/hooks/use-appointments"
import { newId } from "@/lib/api"
import { formatClock, formatClockRange, formatDay, fromLocalInput, HOUR, toLocalInput } from "@/lib/time"
import type { Appointment, Place } from "@/lib/types"

/** The Sheet script refuses longer notes. */
const NOTES_MAX = 1000

function blank(user: string): Appointment {
  // Tomorrow at 9 is a likelier start than right now.
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  return { id: newId(), title: "", start: d.toISOString(), end: new Date(d.getTime() + HOUR).toISOString(), by: user }
}

function when(a: Appointment) {
  return a.end && a.end !== a.start ? formatClockRange(a.start, a.end) : formatClock(a.start)
}

function errorsFor(a: Appointment) {
  const out: string[] = []
  if (!a.title.trim()) out.push("Give the appointment a name.")
  if (a.end && new Date(a.end) < new Date(a.start)) out.push("It ends before it starts.")
  return out
}

export function Appointments({
  state,
  user,
  demo,
}: {
  state: AppointmentsState
  user: string
  demo?: boolean
}) {
  const [draft, setDraft] = useState<{ appointment: Appointment; edit: boolean } | null>(null)
  const [showPast, setShowPast] = useState(false)
  const [placeDraft, setPlaceDraft] = useState<Place | null>(null)

  const { upcoming, past } = useMemo(() => {
    const now = Date.now()
    const sorted = [...state.appointments].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    return {
      upcoming: sorted.filter((a) => new Date(a.end || a.start).getTime() >= now),
      past: sorted.filter((a) => new Date(a.end || a.start).getTime() < now).reverse(),
    }
  }, [state.appointments])

  if (state.outdated) {
    return (
      <Alert>
        <CalendarClock />
        <AlertTitle>The Sheet's script needs an update</AlertTitle>
        <AlertDescription>
          Appointments need the newest Code.gs. Paste it into the Sheet's Apps Script, deploy a new version, then run
          Baby tracker → 1. Set up tabs and codes and 4. Set up appointments calendar.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="grid gap-4">
      <Button size="lg" onClick={() => setDraft({ appointment: blank(user), edit: false })}>
        <CalendarPlus /> New appointment
      </Button>

      {state.error && (
        <button className="text-destructive flex items-center justify-center gap-1 text-xs" onClick={state.refresh}>
          <RefreshCw className="size-3.5" /> {state.error}
        </button>
      )}

      {state.loading && state.appointments.length === 0 ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : upcoming.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia>
              <CalendarClock />
            </EmptyMedia>
            <EmptyTitle>No upcoming appointments</EmptyTitle>
            <EmptyDescription>
              {demo
                ? "Appointments added here show up for every caregiver."
                : "Appointments added here show up for every caregiver and in the shared Google Calendar."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <AppointmentList items={upcoming} onOpen={(a) => setDraft({ appointment: a, edit: true })} />
      )}

      {past.length > 0 &&
        (showPast ? (
          <>
            <h2 className="text-muted-foreground px-1 pt-2 text-sm font-semibold">Past</h2>
            <AppointmentList items={past} onOpen={(a) => setDraft({ appointment: a, edit: true })} />
          </>
        ) : (
          <Button variant="outline" onClick={() => setShowPast(true)}>
            Show past appointments ({past.length})
          </Button>
        ))}

      <section className="grid gap-1.5 pt-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-muted-foreground text-sm font-semibold">Saved places</h2>
          <Button variant="ghost" size="sm" onClick={() => setPlaceDraft({ id: newId(), name: "", address: "" })}>
            <Plus /> Add
          </Button>
        </div>
        {state.places.length === 0 ? (
          <p className="text-muted-foreground px-1 text-sm">
            Save places you go often, like the pediatrician, to pick them when making an appointment.
          </p>
        ) : (
          <ItemGroup className="bg-card divide-y overflow-hidden rounded-xl border">
            {state.places.map((p) => (
              <Item key={p.id} asChild className="rounded-none">
                <button onClick={() => setPlaceDraft(p)}>
                  <ItemContent>
                    <ItemTitle>{p.name}</ItemTitle>
                    {p.address && <ItemDescription className="line-clamp-1">{p.address}</ItemDescription>}
                  </ItemContent>
                </button>
              </Item>
            ))}
          </ItemGroup>
        )}
      </section>

      <AppointmentSheet
        draft={draft}
        places={state.places}
        onClose={() => setDraft(null)}
        onSave={state.save}
        onDelete={state.remove}
        onSavePlace={state.savePlace}
        demo={demo}
      />
      <PlaceSheet
        place={placeDraft}
        isNew={!state.places.some((p) => p.id === placeDraft?.id)}
        onClose={() => setPlaceDraft(null)}
        onSave={state.savePlace}
        onDelete={state.removePlace}
      />
    </div>
  )
}

function AppointmentList({ items, onOpen }: { items: Appointment[]; onOpen: (a: Appointment) => void }) {
  const groups: { day: string; items: Appointment[] }[] = []
  for (const a of items) {
    const day = formatDay(a.start)
    if (groups[groups.length - 1]?.day !== day) groups.push({ day, items: [] })
    groups[groups.length - 1].items.push(a)
  }
  return groups.map((g) => (
    <section key={g.day} className="grid gap-1.5">
      <h2 className="text-muted-foreground px-1 text-xs font-semibold tracking-wide uppercase">{g.day}</h2>
      <ItemGroup className="bg-card divide-y overflow-hidden rounded-xl border">
        {g.items.map((a) => (
          <Item key={a.id} asChild className="rounded-none">
            <button onClick={() => onOpen(a)}>
              <ItemContent>
                <ItemTitle className="w-full justify-between">
                  <span className="truncate">{a.title}</span>
                  <span className="text-muted-foreground shrink-0 font-normal tabular-nums">{when(a)}</span>
                </ItemTitle>
                {(a.location || a.placeName || a.notes) && (
                  <ItemDescription className="line-clamp-1">
                    {[a.placeName || a.location, a.notes].filter(Boolean).join(" · ")}
                  </ItemDescription>
                )}
              </ItemContent>
              <ItemActions>
                {a.synced ? (
                  <CalendarCheck className="text-muted-foreground size-4" aria-label="In Google Calendar" />
                ) : (
                  <CalendarX
                    className="text-destructive size-4"
                    aria-label={`Not in Google Calendar${a.syncError ? `: ${a.syncError}` : ""}`}
                  />
                )}
              </ItemActions>
            </button>
          </Item>
        ))}
      </ItemGroup>
    </section>
  ))
}

function AppointmentSheet({
  draft,
  places,
  onClose,
  onSave,
  onDelete,
  onSavePlace,
  demo,
}: {
  draft: { appointment: Appointment; edit: boolean } | null
  places: Place[]
  onClose: () => void
  onSave: (a: Appointment) => Promise<Appointment>
  onDelete: (id: string) => Promise<void>
  onSavePlace: (p: Place) => Promise<Place>
  demo?: boolean
}) {
  const [appt, setAppt] = useState<Appointment | null>(null)
  const [opened, setOpened] = useState<typeof draft>(null)
  const [busy, setBusy] = useState(false)
  // The name typed for "Save as a place", or null while that row is closed.
  const [newPlaceName, setNewPlaceName] = useState<string | null>(null)
  const [savingPlace, setSavingPlace] = useState(false)

  // Fill the form while rendering, like the entry sheet, so reopening never flashes the previous one.
  if (draft && draft !== opened) {
    setOpened(draft)
    setAppt(draft.appointment)
    setNewPlaceName(null)
  }

  const set = (patch: Partial<Appointment>) => setAppt((a) => (a ? { ...a, ...patch } : a))
  const errors = appt ? errorsFor(appt) : []
  const editing = Boolean(opened?.edit)

  function setStart(iso: string) {
    if (!appt || !iso) return
    // Moving the start keeps the same length, so the end doesn't end up before it.
    const length = appt.end ? new Date(appt.end).getTime() - new Date(appt.start).getTime() : HOUR
    set({ start: iso, end: new Date(new Date(iso).getTime() + Math.max(0, length)).toISOString() })
  }

  async function submit() {
    if (!appt || errors.length) return
    setBusy(true)
    try {
      const saved = await onSave({ ...appt, title: appt.title.trim() })
      if (saved.syncError) toast.warning(`Saved, but not added to Google Calendar: ${saved.syncError}`)
      onClose()
    } catch (e) {
      toast.error(`Couldn't save: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function savePlace() {
    const name = newPlaceName?.trim()
    if (!appt?.location || !name) return
    setSavingPlace(true)
    try {
      const saved = await onSavePlace({ id: newId(), name, address: appt.location })
      set({ placeName: saved.name })
      setNewPlaceName(null)
    } catch (e) {
      toast.error(`Couldn't save the place: ${(e as Error).message}`)
    } finally {
      setSavingPlace(false)
    }
  }

  async function remove() {
    if (!appt) return
    setBusy(true)
    try {
      await onDelete(appt.id)
      onClose()
    } catch (e) {
      toast.error(`Couldn't delete: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer open={draft !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <DrawerContent className="mx-auto max-w-lg">
        {appt && (
          <Fragment>
            <DrawerHeader>
              <DrawerTitle>{editing ? "Edit appointment" : "New appointment"}</DrawerTitle>
              <DrawerDescription>
                {demo ? "Saved on this phone only in the demo." : "Saved for everyone and copied to Google Calendar."}
              </DrawerDescription>
            </DrawerHeader>
            <form
              className="overflow-y-auto px-4"
              onSubmit={(e) => {
                e.preventDefault()
                submit()
              }}
            >
              <FieldGroup className="gap-5">
                <Field>
                  <FieldLabel htmlFor="appt-title">What</FieldLabel>
                  <Input
                    id="appt-title"
                    value={appt.title}
                    onChange={(e) => set({ title: e.target.value })}
                    placeholder="Two-week checkup"
                    maxLength={200}
                  />
                </Field>
                <div className="grid gap-3">
                  <Field>
                    <FieldLabel htmlFor="appt-start">Starts</FieldLabel>
                    <Input
                      id="appt-start"
                      type="datetime-local"
                      value={toLocalInput(appt.start)}
                      onChange={(e) => setStart(fromLocalInput(e.target.value))}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="appt-end">Ends</FieldLabel>
                    <Input
                      id="appt-end"
                      type="datetime-local"
                      value={toLocalInput(appt.end)}
                      onChange={(e) => set({ end: fromLocalInput(e.target.value) || undefined })}
                    />
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="appt-location">Where</FieldLabel>
                  {places.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {places.map((p) => {
                        const picked = appt.placeName === p.name && (appt.location ?? "") === p.address
                        return (
                          <Button
                            key={p.id}
                            type="button"
                            size="sm"
                            variant={picked ? "default" : "outline"}
                            onClick={() =>
                              picked
                                ? set({ placeName: undefined, location: undefined })
                                : set({ placeName: p.name, location: p.address || undefined })
                            }
                          >
                            <MapPin /> {p.name}
                          </Button>
                        )
                      })}
                    </div>
                  )}
                  <Input
                    id="appt-location"
                    value={appt.location ?? ""}
                    // A typed address no longer belongs to the saved place it came from.
                    onChange={(e) => set({ location: e.target.value || undefined, placeName: undefined })}
                    placeholder={places.length ? "Or type an address" : "Address, optional"}
                    maxLength={500}
                  />
                  {appt.location && !appt.placeName && newPlaceName === null && (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto justify-start px-0"
                      onClick={() => setNewPlaceName("")}
                    >
                      <BookmarkPlus /> Save this address as a place
                    </Button>
                  )}
                  {appt.location && !appt.placeName && newPlaceName !== null && (
                    <div className="flex gap-2">
                      <Input
                        aria-label="Place name"
                        value={newPlaceName}
                        onChange={(e) => setNewPlaceName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            savePlace()
                          }
                        }}
                        placeholder="Name, e.g. Pediatrician"
                        maxLength={100}
                        autoFocus
                      />
                      <Button type="button" disabled={!newPlaceName.trim() || savingPlace} onClick={savePlace}>
                        {savingPlace && <Spinner />} Save place
                      </Button>
                    </div>
                  )}
                </Field>
                <Field>
                  <FieldLabel htmlFor="appt-notes">Notes</FieldLabel>
                  <Textarea
                    id="appt-notes"
                    value={appt.notes ?? ""}
                    onChange={(e) => set({ notes: e.target.value || undefined })}
                    placeholder="Optional, e.g. questions to ask"
                    rows={2}
                    maxLength={NOTES_MAX}
                  />
                </Field>
                {editing && !demo && (
                  <FieldDescription>
                    Added by {appt.by}
                    {appt.updatedBy && appt.updatedBy !== appt.by ? `, last changed by ${appt.updatedBy}` : ""}.
                    {appt.syncError ? ` Not in Google Calendar yet: ${appt.syncError}.` : ""}
                  </FieldDescription>
                )}
              </FieldGroup>
              <button type="submit" hidden disabled={errors.length > 0} />
            </form>
            <DrawerFooter>
              {errors.length > 0 && appt.title !== "" && (
                <p role="alert" className="text-destructive text-sm">
                  {errors.join(" ")}
                </p>
              )}
              <Button size="lg" disabled={busy || errors.length > 0} onClick={submit}>
                {busy && <Spinner />}
                {busy ? "Saving" : editing ? "Save changes" : "Save"}
              </Button>
              {editing && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" className="text-destructive hover:text-destructive" disabled={busy}>
                      <Trash2 /> Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this appointment?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {demo
                          ? "It disappears from the app."
                          : "It disappears from the app and from Google Calendar. A copy stays in the Google Sheet, marked as deleted."}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep it</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={remove}>
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </DrawerFooter>
          </Fragment>
        )}
      </DrawerContent>
    </Drawer>
  )
}

function PlaceSheet({
  place,
  isNew,
  onClose,
  onSave,
  onDelete,
}: {
  place: Place | null
  isNew: boolean
  onClose: () => void
  onSave: (p: Place) => Promise<Place>
  onDelete: (id: string) => Promise<void>
}) {
  const [form, setForm] = useState<Place | null>(null)
  const [opened, setOpened] = useState<Place | null>(null)
  const [busy, setBusy] = useState(false)

  if (place && place !== opened) {
    setOpened(place)
    setForm(place)
  }

  async function run(action: () => Promise<unknown>, failure: string) {
    setBusy(true)
    try {
      await action()
      onClose()
    } catch (e) {
      toast.error(`${failure}: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer open={place !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <DrawerContent className="mx-auto max-w-lg">
        {form && (
          <Fragment>
            <DrawerHeader>
              <DrawerTitle>{isNew ? "New place" : "Edit place"}</DrawerTitle>
              <DrawerDescription>
                The address goes into Google Calendar, so tapping it there opens Maps.
              </DrawerDescription>
            </DrawerHeader>
            <FieldGroup className="gap-5 px-4">
              <Field>
                <FieldLabel htmlFor="place-name">Name</FieldLabel>
                <Input
                  id="place-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Pediatrician"
                  maxLength={100}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="place-address">Address</FieldLabel>
                <Input
                  id="place-address"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="123 Main St, City"
                  maxLength={500}
                />
                {!isNew && (
                  <FieldDescription>Changing it doesn't change appointments already saved.</FieldDescription>
                )}
              </Field>
            </FieldGroup>
            <DrawerFooter>
              <Button
                size="lg"
                disabled={busy || !form.name.trim()}
                onClick={() =>
                  run(() => onSave({ ...form, name: form.name.trim(), address: form.address.trim() }), "Couldn't save")
                }
              >
                {busy && <Spinner />} Save
              </Button>
              {!isNew && (
                <Button
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={busy}
                  onClick={() => run(() => onDelete(form.id), "Couldn't delete")}
                >
                  <Trash2 /> Delete place
                </Button>
              )}
            </DrawerFooter>
          </Fragment>
        )}
      </DrawerContent>
    </Drawer>
  )
}
