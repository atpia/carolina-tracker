import { isPairKind, kindIcon } from "@/components/icons"
import type { LogEvent } from "@/lib/types"
import { cn } from "@/lib/utils"

const TONES = {
  feeding: "bg-feed/15 text-feed",
  diaper: "bg-diaper/15 text-diaper",
  med: "bg-med/15 text-med",
  temp: "bg-temp/15 text-temp",
}

export function EventIcon({ event, className }: { event: Pick<LogEvent, "type" | "kind">; className?: string }) {
  const Icon = kindIcon(event.type, event.kind)
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", TONES[event.type], className)}>
      <Icon className={isPairKind(event.type, event.kind) ? "size-3" : "size-4.5"} />
    </span>
  )
}
