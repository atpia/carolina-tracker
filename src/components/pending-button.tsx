import { useState, type ComponentProps } from "react"
import { Check, type LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

const CHECK_MS = 1200
/** Long enough to see the check before a button that goes away once logged is gone. */
const CONFIRM_FIRST_MS = 700

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * A button whose icon turns into a spinner until the save it started finishes, then into a check, so a
 * tap visibly registers. With confirmFirst, the check shows before the save starts: for buttons that
 * disappear or change as soon as the entry is logged, which would otherwise never show it.
 */
export function PendingButton({
  icon: Icon,
  onClick,
  children,
  disabled,
  confirmFirst,
  ...props
}: Omit<ComponentProps<typeof Button>, "onClick"> & {
  icon: LucideIcon
  onClick: () => Promise<unknown> | void
  confirmFirst?: boolean
}) {
  const [state, setState] = useState<"idle" | "pending" | "done">("idle")
  return (
    <Button
      {...props}
      disabled={disabled || state !== "idle"}
      aria-busy={state === "pending"}
      onClick={async () => {
        try {
          if (confirmFirst) {
            setState("done")
            await wait(CONFIRM_FIRST_MS)
            setState("pending")
            await onClick()
            setState("idle")
          } else {
            const started = onClick()
            // Nothing was saved (it asked first, say), so there's nothing to confirm.
            if (!started) return
            setState("pending")
            await started
            setState("done")
            await wait(CHECK_MS)
            setState("idle")
          }
        } catch {
          setState("idle")
        }
      }}
      // Keep the disabled look off while confirming, so the check reads as success, not as unavailable.
      className={cn(props.className, state === "done" && "disabled:opacity-100")}
    >
      {state === "pending" ? (
        <Spinner />
      ) : state === "done" ? (
        <Check className="animate-in zoom-in-50 duration-200" aria-label="Done" />
      ) : (
        <Icon />
      )}{" "}
      {children}
    </Button>
  )
}
