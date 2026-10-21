import { useState, type ComponentProps } from "react"

import { Input } from "@/components/ui/input"
import { amountText, parseAmount, type InputUnit } from "@/lib/units"

/**
 * A number box that keeps exactly what was typed, so "1." stays on screen on the way to "1.5". It only
 * rewrites its text on blur, or when the value is changed from outside (another button, a unit switch).
 */
export function AmountInput({
  value,
  unit,
  onValueChange,
  ...props
}: Omit<ComponentProps<"input">, "value" | "onChange"> & {
  value: number | undefined
  unit: InputUnit
  onValueChange: (value: number | undefined) => void
}) {
  const [text, setText] = useState(() => amountText(value, unit))
  // The value and unit the text currently stands for.
  const [synced, setSynced] = useState({ value, unit })
  if (synced.value !== value || synced.unit !== unit) {
    setSynced({ value, unit })
    setText(amountText(value, unit))
  }

  return (
    <Input
      inputMode="decimal"
      {...props}
      value={text}
      onChange={(e) => {
        const next = parseAmount(e.target.value, unit)
        setText(e.target.value)
        setSynced({ value: next, unit })
        onValueChange(next)
      }}
      onBlur={(e) => {
        setText(amountText(value, unit))
        props.onBlur?.(e)
      }}
    />
  )
}
