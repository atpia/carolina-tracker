import { useState } from "react"
import { addDays, format, isSameDay } from "date-fns"
import { ChevronDown, Clock, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Calendar } from "@/components/ui/calendar"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { toClockInput, withClock, withDay } from "@/lib/time"

function dayLabel(d: Date) {
  const today = new Date()
  if (isSameDay(d, today)) return "Today"
  if (isSameDay(d, addDays(today, -1))) return "Yesterday"
  if (isSameDay(d, addDays(today, 1))) return "Tomorrow"
  return format(d, d.getFullYear() === today.getFullYear() ? "EEE, MMM d" : "MMM d, yyyy")
}

/** shadcn's date and time picker: a Calendar in a Popover for the day, and a time box beside it. */
export function DateTimeField({
  id,
  label,
  value,
  onChange,
  clearable,
  showNow = true,
  description,
}: {
  id: string
  label: string
  value: string
  onChange: (iso: string) => void
  clearable?: boolean
  /** A "Now" button, for logging something that just happened. */
  showNow?: boolean
  description?: string
}) {
  const [open, setOpen] = useState(false)
  const date = value ? new Date(value) : undefined

  return (
    <Field>
      <div className="flex h-5 items-center justify-between">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {clearable && value && (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="text-muted-foreground h-5 px-0"
            onClick={() => onChange("")}
          >
            <X /> Clear
          </Button>
        )}
      </div>
      <div className="flex gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id={id}
              type="button"
              variant="outline"
              className="h-10 min-w-0 flex-1 justify-between gap-1 px-2.5 font-normal"
            >
              <span className={date ? "truncate" : "text-muted-foreground truncate"}>
                {date ? dayLabel(date) : "Pick a day"}
              </span>
              <ChevronDown className="text-muted-foreground max-[359px]:hidden" />
            </Button>
          </PopoverTrigger>
          {/* data-vaul-no-drag keeps a swipe across the month from dragging the sheet closed. */}
          <PopoverContent className="w-auto overflow-hidden p-0" align="start" data-vaul-no-drag>
            <Calendar
              mode="single"
              selected={date}
              defaultMonth={date}
              onSelect={(d) => {
                if (!d) return
                onChange(withDay(value, d))
                setOpen(false)
              }}
            />
          </PopoverContent>
        </Popover>
        <ButtonGroup className="shrink-0">
          <Input
            type="time"
            aria-label={`${label}, time`}
            value={toClockInput(value)}
            // An emptied time box isn't a time; Clear is how a time is removed.
            onChange={(e) => e.target.value && onChange(withClock(value, e.target.value))}
            className="w-[6.75rem] appearance-none px-2.5 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
          />
          {showNow && (
            <Button
              type="button"
              variant="outline"
              className="h-10 px-3"
              onClick={() => onChange(new Date().toISOString())}
            >
              <Clock /> Now
            </Button>
          )}
        </ButtonGroup>
      </div>
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  )
}
