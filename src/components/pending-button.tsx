import { useState, type ComponentProps } from "react"
import type { LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

/** A button whose icon turns into a spinner until the save it started finishes, so a tap visibly registers. */
export function PendingButton({
  icon: Icon,
  onClick,
  children,
  disabled,
  ...props
}: Omit<ComponentProps<typeof Button>, "onClick"> & {
  icon: LucideIcon
  onClick: () => Promise<unknown> | void
}) {
  const [pending, setPending] = useState(false)
  return (
    <Button
      {...props}
      disabled={disabled || pending}
      aria-busy={pending}
      onClick={async () => {
        setPending(true)
        try {
          await onClick()
        } finally {
          setPending(false)
        }
      }}
    >
      {pending ? <Spinner /> : <Icon />} {children}
    </Button>
  )
}
