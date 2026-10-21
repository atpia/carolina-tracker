import { LogOut, Monitor, Moon, Sun } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldTitle } from "@/components/ui/field"
import { Separator } from "@/components/ui/separator"
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
  queued = 0,
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
  /** Entries on this phone that haven't reached the Sheet yet. */
  queued?: number
}) {
  const unsynced = queued === 1 ? "1 entry on this phone hasn't" : `${queued} entries on this phone haven't`
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>This phone</CardTitle>
          <CardDescription>
            {demo
              ? "Demo mode. Entries stay on this phone only."
              : `Signed in as ${user}. Entries you add are labeled with your name.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldTitle>Bottle units</FieldTitle>
              <ToggleGroup type="single" value={unit} onValueChange={(v) => v && onUnit(v as Unit)}>
                <ToggleGroupItem value="ml">ml</ToggleGroupItem>
                <ToggleGroupItem value="oz">oz</ToggleGroupItem>
              </ToggleGroup>
              <FieldDescription>
                Amounts are always saved in ml, so switching never changes past entries.
              </FieldDescription>
            </Field>
            <Field>
              <FieldTitle>Appearance</FieldTitle>
              <ToggleGroup type="single" value={theme} onValueChange={(v) => v && onTheme(v as Theme)}>
                <ToggleGroupItem value="system">
                  <Monitor /> Auto
                </ToggleGroupItem>
                <ToggleGroupItem value="light">
                  <Sun /> Light
                </ToggleGroupItem>
                <ToggleGroupItem value="dark">
                  <Moon /> Dark
                </ToggleGroupItem>
              </ToggleGroup>
            </Field>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline">
                  <LogOut /> {demo ? "Leave demo" : "Sign out"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{demo ? "Leave the demo?" : "Sign out on this phone?"}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {demo
                      ? "You'll go back to the connect screen. Demo entries stay on this phone."
                      : queued > 0
                        ? `${unsynced} synced. They'll sync if you sign back in with the same code.`
                        : "Nothing is deleted. You'll need your personal setup link to sign back in."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Stay signed in</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={onSignOut}>
                    {demo ? "Leave demo" : queued > 0 ? "Sign out anyway" : "Sign out"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
          <CardDescription>Change these in the Settings tab of the Google Sheet.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-1 text-sm">
          <Row label="Feeding window" value={`${settings.feedMinH} to ${settings.feedMaxH} hours`} />
          <Separator />
          <Row label="Medication every" value={`${settings.medIntervalH} hours, alternating`} />
          <Separator />
          <Row label="Diaper check after a change" value={`${settings.diaperAfterChangeH} hours`} />
          <Separator />
          <Row label="Recheck after a clean diaper" value={`${settings.diaperAfterCleanH} hours`} />
        </CardContent>
      </Card>

      {users.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Caregivers</CardTitle>
            <CardDescription>Add or remove people in the Users tab of the Google Sheet.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {users.map((name) => (
              <div key={name} className="flex items-center gap-2 text-sm">
                <Avatar className="size-7">
                  <AvatarFallback className="text-[0.65rem] font-medium">
                    {name.slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {name}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}
