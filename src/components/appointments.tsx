import { Fragment, useMemo, useState } from "react"
import { CalendarCheck, CalendarClock, CalendarPlus, CalendarX, RefreshCw, Trash2 } from "lucide-react"
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
import type { Appointment } from "@/lib/types"

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

      <AppointmentSheet
        draft={draft}
        onClose={() => setDraft(null)}
        onSave={state.save}
        onDelete={state.remove}
        demo={demo}
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
                {(a.location || a.notes) && (
                  <ItemDescription className="line-clamp-1">
                    {[a.location, a.notes].filter(Boolean).join(" · ")}
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
  onClose,
  onSave,
  onDelete,
  demo,
}: {
  draft: { appointment: Appointment; edit: boolean } | null
  onClose: () => void
  onSave: (a: Appointment) => Promise<Appointment>
  onDelete: (id: string) => Promise<void>
  demo?: boolean
}) {
  const [appt, setAppt] = useState<Appointment | null>(null)
  const [opened, setOpened] = useState<typeof draft>(null)
  const [busy, setBusy] = useState(false)

  // Fill the form while rendering, like the entry sheet, so reopening never flashes the previous one.
  if (draft && draft !== opened) {
    setOpened(draft)
    setAppt(draft.appointment)
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
                  <Input
                    id="appt-location"
                    value={appt.location ?? ""}
                    onChange={(e) => set({ location: e.target.value || undefined })}
                    placeholder="Optional"
                    maxLength={500}
                  />
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
