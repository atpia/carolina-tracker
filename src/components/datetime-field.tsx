import { Clock, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { fromLocalInput, toLocalInput } from "@/lib/time"

export function DateTimeField({
  id,
  label,
  value,
  onChange,
  clearable,
  description,
}: {
  id: string
  label: string
  value: string
  onChange: (iso: string) => void
  clearable?: boolean
  description?: string
}) {
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
      <ButtonGroup className="w-full">
        <Input
          id={id}
          type="datetime-local"
          value={toLocalInput(value)}
          onChange={(e) => onChange(fromLocalInput(e.target.value))}
          className="min-w-0 flex-1"
        />
        <Button type="button" variant="outline" className="h-10" onClick={() => onChange(new Date().toISOString())}>
          <Clock /> Now
        </Button>
      </ButtonGroup>
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  )
}
