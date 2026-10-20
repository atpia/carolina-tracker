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
      <div className="flex h-5 items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {clearable && value && (
          <Button type="button" variant="link" size="sm" className="text-muted-foreground h-5 px-0" onClick={() => onChange("")}>
            <X /> Clear
          </Button>
        )}
      </div>
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
      </div>
    </div>
  )
}
