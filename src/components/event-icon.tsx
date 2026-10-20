import { Baby, Droplet, Milk, Pill } from "lucide-react"

import { cn } from "@/lib/utils"
import { isBottle, type LogEvent } from "@/lib/types"

export function EventIcon({ event, className }: { event: Pick<LogEvent, "type" | "kind">; className?: string }) {
  const base = "flex size-9 shrink-0 items-center justify-center rounded-full [&_svg]:size-4.5"
  if (event.type === "feeding") {
    return (
      <span className={cn(base, "bg-feed/15 text-feed", className)}>
        {isBottle(event.kind) ? <Milk /> : <Baby />}
      </span>
    )
  }
  if (event.type === "diaper") {
    return (
      <span className={cn(base, "bg-diaper/15 text-diaper", className)}>
        <Droplet />
      </span>
    )
  }
  return (
    <span className={cn(base, "bg-med/15 text-med", className)}>
      <Pill />
    </span>
  )
}
