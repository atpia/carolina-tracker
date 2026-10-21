import {
  Baby,
  Bomb,
  CircleDot,
  Droplets,
  GlassWater,
  Milk,
  Pill,
  PillBottle,
  RefreshCcwDot,
  Sparkles,
  Tablets,
  WavesHorizontal,
  type LucideIcon,
  type LucideProps,
} from "lucide-react"

import type { EventType } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Two icons side by side, for a wet + stool diaper. */
function pair(First: LucideIcon, Second: LucideIcon): LucideIcon {
  const Pair = ({ className, ...props }: LucideProps) => (
    <span data-icon-pair className="inline-flex shrink-0 items-center -space-x-0.5">
      <First className={cn("size-4", className)} {...props} />
      <Second className={cn("size-4", className)} {...props} />
    </span>
  )
  return Pair as unknown as LucideIcon
}

const WetAndStool = pair(WavesHorizontal, Bomb)

/** One lucide icon per kind of entry, used everywhere an entry is shown. */
export const KIND_ICONS: Record<string, LucideIcon> = {
  left: CircleDot,
  right: CircleDot,
  formula: Milk,
  expressed: GlassWater,
  wet: WavesHorizontal,
  stool: Bomb,
  dry: Sparkles,
  ibuprofen: Pill,
  tylenol: Tablets,
}

/** "both" means both breasts for a feeding and wet + stool for a diaper. */
export function kindIcon(type: EventType, kind: string): LucideIcon {
  if (kind === "both") return type === "diaper" ? WetAndStool : RefreshCcwDot
  return KIND_ICONS[kind] ?? (type === "feeding" ? Baby : type === "diaper" ? Droplets : Pill)
}

export function isPairKind(type: EventType, kind: string) {
  return type === "diaper" && kind === "both"
}

export const TYPE_ICONS: Record<EventType, LucideIcon> = {
  feeding: Baby,
  diaper: Droplets,
  med: PillBottle,
}
