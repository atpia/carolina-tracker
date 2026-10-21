import { useEffect, useRef, useState } from "react"
import { Lamp, LampDesk } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import type { LightState } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * The Home Assistant reading light. It shows what was last set from the app, since Home Assistant can't tell
 * the Sheet about a change made at the wall switch.
 */
export function LightCard({
  initial,
  onSet,
}: {
  initial?: LightState
  onSet: (light: LightState) => Promise<LightState>
}) {
  const [light, setLight] = useState<LightState>(initial ?? { on: false, brightness: 50 })
  const [busy, setBusy] = useState(false)
  // The slider moves freely; only a finished drag goes to the light.
  const [dragging, setDragging] = useState<number | null>(null)
  const confirmed = useRef(light)

  useEffect(() => {
    if (initial) {
      setLight(initial)
      confirmed.current = initial
    }
  }, [initial])

  async function send(next: LightState) {
    setLight(next)
    setBusy(true)
    try {
      const saved = await onSet(next)
      confirmed.current = saved
      setLight(saved)
    } catch (e) {
      setLight(confirmed.current)
      toast.error((e as Error).message || "Couldn't reach the light.")
    } finally {
      setBusy(false)
    }
  }

  const brightness = dragging ?? light.brightness
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          <LampDesk className="size-4" /> Reading light
        </CardDescription>
        <CardTitle className="text-2xl tabular-nums">{light.on ? `On, ${brightness}%` : "Off"}</CardTitle>
        <CardAction>
          <Button
            size="lg"
            variant={light.on ? "default" : "outline"}
            disabled={busy}
            aria-pressed={light.on}
            onClick={() => send({ ...light, on: !light.on })}
          >
            <Lamp /> {light.on ? "Turn off" : "Turn on"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Slider
          aria-label="Brightness"
          min={1}
          max={100}
          step={1}
          value={[brightness]}
          disabled={busy}
          className={cn(!light.on && "opacity-60")}
          onValueChange={([v]) => setDragging(v)}
          onValueCommit={([v]) => {
            setDragging(null)
            // Moving the slider while the light is off turns it on at that brightness.
            send({ ...light, on: true, brightness: v })
          }}
        />
      </CardContent>
    </Card>
  )
}
