import { Bell, BellOff, CircleCheck, Download, Send, Share } from "lucide-react"
import { useState } from "react"
import { toast } from "@/components/ui/toast"

import { PendingButton } from "@/components/pending-button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { setFeedNoticePref, useFeedNoticePref } from "@/hooks/use-feed-notice"
import { useInstallState, usePush } from "@/hooks/use-push"
import { isOldScriptError, type Backend } from "@/lib/api"
import { canShowActions } from "@/lib/feed-notice"
import { promptInstall } from "@/lib/install"
import type { DiscordState } from "@/lib/types"

/** Error text for a notification step, pointing an old Sheet script at the update it needs. */
function pushError(e: unknown) {
  return isOldScriptError(e)
    ? "The Sheet's script needs updating for notifications. See SETUP.md, section 8."
    : (e as Error).message
}

/** Settings → putting the app on the home screen and turning on notifications for this phone. */
export function HomeScreenCard({
  backend,
  owner,
  demo,
  discord,
  onDiscord,
}: {
  backend: Backend
  owner: string
  demo: boolean
  /** The Sheet's Discord channel: "none" hides the switch. */
  discord: DiscordState
  onDiscord: (on: boolean) => Promise<DiscordState>
}) {
  const install = useInstallState()
  const push = usePush(backend, owner)
  const feedNotice = useFeedNoticePref()
  const allowed = push.permission === "granted"
  // Shows the new position while the Sheet is asked, so the switch doesn't jump back and forth.
  const [discordWant, setDiscordWant] = useState<boolean | null>(null)
  const discordOn = discordWant ?? discord === "on"

  const switchDiscord = (on: boolean) => {
    setDiscordWant(on)
    onDiscord(on)
      .then((now) =>
        toast.add({
          title: now === "off" ? "Discord messages are off" : now === "on" ? "Discord messages are on" : "No Discord",
          description:
            now === "none"
              ? "The Sheet no longer has a Discord link."
              : now === "off"
                ? "For everyone. Phone notifications keep coming."
                : "For everyone, as set in the Sheet.",
          type: "success",
        }),
      )
      .catch((e) =>
        toast.add({
          title: on ? "Couldn't turn Discord on" : "Couldn't turn Discord off",
          description: isOldScriptError(e)
            ? "The Sheet's script needs updating for this switch. See SETUP.md, section 4."
            : (e as Error).message,
          type: "error",
        }),
      )
      .finally(() => setDiscordWant(null))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Home screen and notifications</CardTitle>
        <CardDescription>
          Reminders from the Sheet can come to this phone as notifications, alongside or instead of Discord.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldTitle>Home screen app</FieldTitle>
            {install === "installed" ? (
              <FieldDescription className="flex items-center gap-1.5">
                <CircleCheck className="text-med size-4" /> Open from the home screen.
              </FieldDescription>
            ) : install === "prompt" ? (
              <>
                <PendingButton
                  variant="outline"
                  icon={Download}
                  onClick={async () => {
                    if (await promptInstall())
                      toast.add({
                        title: "Installed",
                        description: "Open it from the home screen from now on.",
                        type: "success",
                      })
                  }}
                >
                  Install app
                </PendingButton>
                <FieldDescription>Adds an icon that opens the tracker full screen, even offline.</FieldDescription>
              </>
            ) : install === "ios" ? (
              <FieldDescription>
                In Safari, tap <Share className="inline size-4 align-text-bottom" /> Share, then{" "}
                <strong>Add to Home Screen</strong>. Notifications only work in the home screen app, so open it from
                there and sign in with your setup link again.
              </FieldDescription>
            ) : (
              <FieldDescription>
                Open your browser's menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.
              </FieldDescription>
            )}
          </Field>

          <Field>
            <FieldTitle>Notifications on this phone</FieldTitle>
            {demo ? (
              <FieldDescription>Notifications come from the Sheet, so the demo doesn't have them.</FieldDescription>
            ) : push.support === "needs-install" ? (
              <FieldDescription>
                Add the app to your home screen first (see above), then turn them on there.
              </FieldDescription>
            ) : push.support === "unsupported" ? (
              <FieldDescription>This browser can't get notifications from a web app.</FieldDescription>
            ) : push.on ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <PendingButton
                    variant="outline"
                    icon={Send}
                    onClick={() =>
                      toast.promise(push.test(), {
                        loading: "Sending a test…",
                        success: { title: "Test sent", description: "It should arrive in a few seconds." },
                        error: (e) => ({ title: "Couldn't send a test", description: pushError(e) }),
                      })
                    }
                  >
                    Send a test
                  </PendingButton>
                  <PendingButton
                    variant="ghost"
                    icon={BellOff}
                    onClick={() =>
                      toast.promise(push.disable(), {
                        loading: "Turning off notifications…",
                        success: "Notifications are off on this phone",
                        error: (e) => ({ title: "Couldn't turn them off", description: pushError(e) }),
                      })
                    }
                  >
                    Turn off
                  </PendingButton>
                </div>
                <FieldDescription>
                  On. Feeding, diaper and medicine reminders arrive here, as set in the Sheet's Settings tab.
                </FieldDescription>
              </>
            ) : push.permission === "denied" ? (
              <FieldDescription>
                Notifications are blocked for this app. Allow them in the phone's settings (on iPhone: Settings →
                Notifications → {document.title}), then come back here.
              </FieldDescription>
            ) : (
              <>
                <PendingButton
                  icon={Bell}
                  disabled={push.on === null}
                  onClick={() =>
                    toast.promise(push.enable(), {
                      loading: "Turning on notifications…",
                      success: (r) =>
                        r.reminders === false
                          ? {
                              title: "On, but the Sheet's reminders are off",
                              description: "In the Sheet, click Baby tracker → 3. Turn on reminders.",
                              timeout: 10_000,
                            }
                          : "Notifications are on for this phone",
                      error: (e) => ({ title: "Couldn't turn them on", description: pushError(e) }),
                    })
                  }
                >
                  Turn on notifications
                </PendingButton>
                <FieldDescription>Each person turns them on on their own phone.</FieldDescription>
              </>
            )}
          </Field>

          {!demo && push.support === "ok" && (
            <Field>
              <div className="flex items-center justify-between gap-3">
                <FieldLabel htmlFor="feed-notice">Running feed in notifications</FieldLabel>
                <Switch
                  id="feed-notice"
                  checked={allowed && feedNotice}
                  disabled={!allowed}
                  onCheckedChange={(on) => {
                    setFeedNoticePref(on)
                    // The Sheet only sends the feed to phones that want it.
                    if (push.on)
                      push.sendFeedPref().catch((e) =>
                        toast.add({
                          title: "Couldn't tell the Sheet",
                          description: `${pushError(e)} The app tries again the next time it opens.`,
                          type: "error",
                        }),
                      )
                  }}
                />
              </div>
              <FieldDescription>
                {!allowed
                  ? "Turn on notifications above first."
                  : `While a feed runs, a silent notification shows ${
                      canShowActions() ? "how long it's been going, with a Stop button" : "when it started"
                    }. ${
                      push.on
                        ? "It comes up whoever started the feed, even with the app closed."
                        : "Turn on notifications above to see feeds started on other phones while the app is closed."
                    }`}
              </FieldDescription>
            </Field>
          )}

          {!demo && discord !== "none" && (
            <Field>
              <div className="flex items-center justify-between gap-3">
                <FieldLabel htmlFor="discord-on">Discord messages, for everyone</FieldLabel>
                <Switch
                  id="discord-on"
                  checked={discordOn}
                  disabled={discordWant !== null}
                  onCheckedChange={switchDiscord}
                />
              </div>
              <FieldDescription>
                {discordOn
                  ? "The Sheet posts reminders to your Discord channel. Turning this off stops every Discord message, for everyone. Phone notifications keep coming."
                  : "Off for everyone. The Sheet keeps the Discord link, so turning this back on is all it takes. Phone notifications aren't affected."}
              </FieldDescription>
            </Field>
          )}
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
