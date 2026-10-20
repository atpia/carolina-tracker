import { LogOut } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { Settings } from "@/lib/types"
import type { Unit } from "@/lib/units"

export type Theme = "system" | "light" | "dark"

export function SettingsView({
  user,
  users,
  settings,
  demo,
  unit,
  onUnit,
  theme,
  onTheme,
  onSignOut,
}: {
  user: string
  users: string[]
  settings: Settings
  demo: boolean
  unit: Unit
  onUnit: (u: Unit) => void
  theme: Theme
  onTheme: (t: Theme) => void
  onSignOut: () => void
}) {
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>This phone</CardTitle>
          <CardDescription>
            {demo ? "Demo mode. Entries stay on this phone only." : `Signed in as ${user}. Entries you add are labeled with your name.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label>Bottle units</Label>
            <ToggleGroup type="single" value={unit} onValueChange={(v) => v && onUnit(v as Unit)}>
              <ToggleGroupItem value="ml">ml</ToggleGroupItem>
              <ToggleGroupItem value="oz">oz</ToggleGroupItem>
            </ToggleGroup>
            <p className="text-muted-foreground text-xs">Amounts are always saved in ml, so switching never changes past entries.</p>
          </div>
          <div className="grid gap-2">
            <Label>Appearance</Label>
            <ToggleGroup type="single" value={theme} onValueChange={(v) => v && onTheme(v as Theme)}>
              <ToggleGroupItem value="system">Auto</ToggleGroupItem>
              <ToggleGroupItem value="light">Light</ToggleGroupItem>
              <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <Button variant="outline" onClick={() => confirm("Sign out on this phone?") && onSignOut()}>
            <LogOut /> {demo ? "Leave demo" : "Sign out"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
          <CardDescription>Change these in the Settings tab of the Google Sheet.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-1 text-sm">
          <Row label="Feeding window" value={`${settings.feedMinH} to ${settings.feedMaxH} hours`} />
          <Row label="Medication every" value={`${settings.medIntervalH} hours, alternating`} />
          <Row label="Diaper check every" value={`${settings.diaperCheckH} hours`} />
          {users.length > 0 && <Row label="Caregivers" value={users.join(", ")} />}
        </CardContent>
      </Card>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}
