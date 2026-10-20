import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import { fromLocalInput, toLocalInput } from "@/lib/time"

export function DateTimeField({
  id,
  label,
  value,
  onChange,
  placeholder,
  clearable,
}: {
  id: string
  label: string
  value: string
  onChange: (iso: string) => void
  placeholder?: string
  clearable?: boolean
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          type="datetime-local"
          value={toLocalInput(value)}
          placeholder={placeholder}
          onChange={(e) => onChange(fromLocalInput(e.target.value))}
          className="min-w-0 flex-1"
        />
        <Button type="button" variant="outline" className="h-10" onClick={() => onChange(new Date().toISOString())}>
          Now
        </Button>
        {clearable && value && (
          <Button type="button" variant="ghost" size="icon" className="size-10" aria-label={`Clear ${label.toLowerCase()}`} onClick={() => onChange("")}>
            <X />
          </Button>
        )}
      </div>
    </div>
  )
}
