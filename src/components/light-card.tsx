import { useCallback, useEffect, useRef, useState } from "react"
import { Lamp, LampDesk } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import type { LightState } from "@/lib/types"
import { cn } from "@/lib/utils"

/** How often the card checks Home Assistant while the app is open, to catch the wall switch. */
const POLL_MS = 30_000

/** The Home Assistant reading light, switched and dimmed through the Sheet. */
export function LightCard({
  onGet,
  onSet,
}: {
  onGet: () => Promise<LightState>
  onSet: (light: LightState) => Promise<LightState>
}) {
  const [light, setLight] = useState<LightState | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  // The slider moves freely; only a finished drag goes to the light.
  const [dragging, setDragging] = useState<number | null>(null)
  const confirmed = useRef<LightState | null>(null)
  const sending = useRef(false)

  const load = useCallback(async () => {
    // A check that lands mid-change would jump the card back to the old state.
    if (sending.current || document.visibilityState !== "visible") return
    try {
      const current = await onGet()
      if (sending.current) return
      confirmed.current = current
      setLight(current)
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [onGet])

  useEffect(() => {
    load()
    const id = setInterval(load, POLL_MS)
    document.addEventListener("visibilitychange", load)
    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", load)
    }
  }, [load])

  async function send(next: LightState) {
    setLight(next)
    setBusy(true)
    sending.current = true
    try {
      const saved = await onSet(next)
      confirmed.current = saved
      setLight(saved)
      setFailed(false)
    } catch (e) {
      setLight(confirmed.current)
      toast.error((e as Error).message || "Couldn't reach the light.")
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  const unavailable = light?.available === false
  const brightness = dragging ?? light?.brightness ?? 50
  const title = !light
    ? failed
      ? "Can't reach the light"
      : "Checking…"
    : unavailable
      ? "Unavailable"
      : light.on
        ? `On, ${brightness}%`
        : "Off"
  const disabled = !light || busy || unavailable

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          <LampDesk className="size-4" /> Reading light
        </CardDescription>
        <CardTitle className="text-2xl tabular-nums">{title}</CardTitle>
        <CardAction>
          <Button
            size="lg"
            variant={light?.on ? "default" : "outline"}
            disabled={disabled}
            aria-pressed={light?.on ?? false}
            onClick={() => light && send({ ...light, on: !light.on })}
          >
            <Lamp /> {light?.on ? "Turn off" : "Turn on"}
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
          disabled={disabled}
          className={cn(!light?.on && "opacity-60")}
          onValueChange={([v]) => setDragging(v)}
          onValueCommit={([v]) => {
            setDragging(null)
            // Moving the slider while the light is off turns it on at that brightness.
            if (light) send({ ...light, on: true, brightness: v })
          }}
        />
      </CardContent>
    </Card>
  )
}
