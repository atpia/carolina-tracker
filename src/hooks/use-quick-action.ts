import { useCallback } from "react"

import type { Draft } from "@/components/entry-sheet"
import { toast } from "@/components/ui/toast"
import type { Tracker } from "@/hooks/use-tracker"
import { newId } from "@/lib/api"
import type { Status } from "@/lib/derive"
import type { QuickAction } from "@/lib/launch"
import { planQuick } from "@/lib/quick"
import { formatClock, formatDuration, MIN } from "@/lib/time"
import { DIAPER_LABELS, FEED_LABELS, type DiaperKind, type LogEvent } from "@/lib/types"

const DIAPER_DONE: Record<DiaperKind, string> = {
  wet: "Wet diaper logged",
  stool: "Stool diaper logged",
  both: "Wet + stool logged",
  dry: "Check logged, diaper was clean",
}

/**
 * Runs a one-tap action from the home screen icon's shortcuts (…/?do=diaper-wet and so on): logs it straight
 * away, offline too, and says what it did with a way to undo it.
 */
export function useQuickAction(tracker: Tracker, status: Status, onOpen: (draft: Draft) => void) {
  const { save, remove, user } = tracker

  return useCallback(
    async (action: QuickAction) => {
      const plan = planQuick(action, status)
      const now = new Date().toISOString()
      const undo = (event: LogEvent) => ({
        children: "Undo",
        onClick: () => remove(event.id).then(() => toast.add({ title: "Undone" })),
      })

      if (plan.kind === "diaper") {
        const event: LogEvent = { id: newId(), type: "diaper", kind: plan.diaper, start: now, by: user }
        await save(event, { quiet: true })
        toast.add({ title: DIAPER_DONE[plan.diaper] ?? `${DIAPER_LABELS[plan.diaper]} logged`, actionProps: undo(event) })
        return
      }

      // One feed at a time: say which one is going, with a way to stop it and add how it went.
      const stop = async (running: LogEvent) => {
        const stopped = { ...running, end: now }
        await save(stopped, { quiet: true })
        const ms = new Date(now).getTime() - new Date(running.start).getTime()
        const label = FEED_LABELS[running.kind as keyof typeof FEED_LABELS] ?? "Feed"
        toast.add({
          title: ms < MIN ? `${label} stopped` : `${label} stopped after ${formatDuration(ms)}`,
          actionProps: { children: "Add details", onClick: () => onOpen({ ...stopped, edit: true }) },
        })
      }

      if (plan.kind === "busy") {
        const label = FEED_LABELS[plan.running.kind as keyof typeof FEED_LABELS] ?? "A feed"
        toast.add({
          title: `${label} is already running`,
          description: `Started ${formatClock(plan.running.start)}. Stop it before starting another.`,
          type: "warning",
          actionProps: { children: "Stop it", onClick: () => void stop(plan.running) },
        })
        return
      }
      if (plan.stop) return stop(plan.stop)
      if (!plan.start) {
        toast.add({ title: "No feed is running" })
        return
      }
      const started: LogEvent = { id: newId(), type: "feeding", kind: plan.start, start: now, by: user }
      await save(started, { quiet: true })
      toast.add({ title: `${FEED_LABELS[plan.start]} feed started`, actionProps: undo(started) })
    },
    [status, save, remove, user, onOpen],
  )
}
