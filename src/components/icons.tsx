import {
  ArrowLeftRight,
  Baby,
  Droplet,
  Droplets,
  GlassWater,
  Layers,
  Milk,
  Pill,
  PillBottle,
  Sparkles,
  Tablets,
  Toilet,
  type LucideIcon,
} from "lucide-react"

import type { EventType } from "@/lib/types"

/** One lucide icon per kind of entry, used everywhere an entry is shown. */
export const KIND_ICONS: Record<string, LucideIcon> = {
  left: Baby,
  right: Baby,
  both: ArrowLeftRight,
  formula: Milk,
  expressed: GlassWater,
  wet: Droplet,
  stool: Toilet,
  dry: Sparkles,
  ibuprofen: Pill,
  tylenol: Tablets,
}

/** The diaper "both" kind shares its key with breastfeeding "both". */
export function kindIcon(type: EventType, kind: string): LucideIcon {
  if (type === "diaper" && kind === "both") return Layers
  return KIND_ICONS[kind] ?? (type === "feeding" ? Baby : type === "diaper" ? Droplets : Pill)
}

export const TYPE_ICONS: Record<EventType, LucideIcon> = {
  feeding: Baby,
  diaper: Droplets,
  med: PillBottle,
}
