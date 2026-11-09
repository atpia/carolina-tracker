import { Copy } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldTitle } from "@/components/ui/field"
import { Separator } from "@/components/ui/separator"
import { toast } from "@/components/ui/toast"
import { quickLink, type SheetAction } from "@/lib/launch"
import { isIos } from "@/lib/push"
import type { Unit } from "@/lib/units"


interface QuickLinkSpec {
  action: SheetAction
  label: string
  hint?: string
  extra?: Record<string, string>
}

function linkGroups(unit: Unit, siri: boolean): { title: string; links: QuickLinkSpec[] }[] {
  return [
    {
      title: "Feeds",
      links: [
        { action: "feed-left", label: "Start left breast" },
        { action: "feed-right", label: "Start right breast" },
        { action: "feed-both", label: "Start both breasts" },
        {
          action: "feed-formula",
          label: "Start formula",
          hint: `Asks how much was offered, in ${unit}`,
          extra: { unit, amount: "" },
        },
        {
          action: "feed-expressed",
          label: "Start expressed milk",
          hint: `Asks how much was offered, in ${unit}`,
          extra: { unit, amount: "" },
        },
        siri
          ? {
              action: "feed-stop",
              label: "Stop feeding",
              hint: "Stops whatever feed is going, then asks how it went",
              extra: { unit, ask: "1" },
            }
          : { action: "feed-stop", label: "Stop feeding", hint: "Stops whatever feed is going" },
        ...(siri
          ? [
              {
                action: "feed-details",
                label: "Stop feeding: the answer",
                hint: "Goes inside the Stop feeding shortcut",
                extra: { unit, value: "" },
              } satisfies QuickLinkSpec,
            ]
          : []),
        {
          action: "feed",
          label: "Start or stop a feed",
          hint: "One button: stops the running feed, or starts the next side",
        },
      ],
    },
    {
      title: "Diapers",
      links: [
        { action: "diaper-wet", label: "Wet diaper" },
        { action: "diaper-dry", label: "Dry diaper (checked, still clean)" },
        { action: "diaper-both", label: "Wet + stool diaper" },
        { action: "diaper-stool", label: "Stool diaper" },
      ],
    },
  ]
}

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ title: "Link copied", description: label })
  } catch {
    toast.add({ title: "Couldn't copy", description: text, timeout: 0 })
  }
}

function Steps({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-lg border px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium">{title}</summary>
      <div className="text-muted-foreground mt-2 grid gap-2 [&_li]:ml-4 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_strong]:text-foreground">
        {children}
      </div>
    </details>
  )
}

/** The iPhone steps: Siri runs a shortcut by its name, even with the phone locked. */
function SiriSteps({ unit }: { unit: Unit }) {
  return (
    <>
      <Steps title="1. A simple one: diapers and breast feeds">
        <ol>
          <li>
            Tap <strong>Copy link</strong> next to it below.
          </li>
          <li>
            Open the <strong>Shortcuts</strong> app, tap <strong>+</strong>, then search for and add{" "}
            <strong>Get Contents of URL</strong>.
          </li>
          <li>Tap the URL field in it and paste the link.</li>
          <li>
            Tap the <strong>▸</strong> arrow beside it and change <strong>Method</strong> to <strong>POST</strong>.
          </li>
          <li>
            Add <strong>Show Result</strong> and tap its text to pick <strong>Contents of URL</strong>. Siri reads
            this out, e.g. "Wet diaper logged at 3:42 PM."
          </li>
          <li>
            Tap the name at the top and call it what you'll say to Siri, like <strong>Wet diaper</strong> or{" "}
            <strong>Start left</strong>. Tap <strong>Done</strong>.
          </li>
        </ol>
      </Steps>
      <Steps title="2. Formula and expressed milk: asks the amount">
        <ol>
          <li>
            In a new shortcut, add <strong>Ask for Input</strong> first. Set <strong>Input Type</strong> to{" "}
            <strong>Number</strong> and the prompt to something like <strong>How many {unit}?</strong>
          </li>
          <li>
            Add <strong>Get Contents of URL</strong> and paste the <strong>Start formula</strong> link. It ends with{" "}
            <strong>amount=</strong>.
          </li>
          <li>
            Tap at the very end of the link, then tap <strong>Provided Input</strong> in the bar above the keyboard,
            so the link ends with <strong>amount=Provided Input</strong>.
          </li>
          <li>
            Set <strong>Method</strong> to <strong>POST</strong>, add <strong>Show Result</strong> with{" "}
            <strong>Contents of URL</strong>, and name it, e.g. <strong>Start formula</strong>.
          </li>
        </ol>
      </Steps>
      <Steps title="3. Stop feeding: then asks how it went">
        <p>
          It stops whatever feed is going. For the breast it asks for a score from 1 to 5, for a bottle what percent
          she drank, and saves the answer. If you skip the question, the app asks next time it's opened.
        </p>
        <ol>
          <li>
            Add <strong>Get Contents of URL</strong> with the <strong>Stop feeding</strong> link, Method{" "}
            <strong>POST</strong>.
          </li>
          <li>
            Add <strong>If</strong>. Set it to <strong>Contents of URL</strong> <strong>contains</strong> and type{" "}
            <strong>?</strong> (a question mark).
          </li>
          <li>
            Inside the If (above <strong>Otherwise</strong>), add <strong>Ask for Input</strong>: Input Type{" "}
            <strong>Number</strong>, and for the prompt tap <strong>Contents of URL</strong> so Siri asks the
            question the Sheet sends back.
          </li>
          <li>
            Below it, still above Otherwise, add another <strong>Get Contents of URL</strong> with the{" "}
            <strong>Stop feeding: the answer</strong> link, Method <strong>POST</strong>, and put{" "}
            <strong>Provided Input</strong> at the end of it, after <strong>value=</strong>.
          </li>
          <li>
            Below that, add <strong>Show Result</strong> with that second <strong>Contents of URL</strong>.
          </li>
          <li>
            Under <strong>Otherwise</strong>, add <strong>Show Result</strong> with the first{" "}
            <strong>Contents of URL</strong> (it says e.g. "No feed is running.").
          </li>
          <li>
            Name it <strong>Stop feeding</strong>.
          </li>
        </ol>
      </Steps>
      <Steps title="4. With the phone locked">
        <ol>
          <li>
            Run each new shortcut once from the Shortcuts app with the phone unlocked. The first time, it asks to
            connect to Google: tap <strong>Always Allow</strong>. Otherwise Siri stops there when the phone is locked.
          </li>
          <li>
            In <strong>Settings → Siri</strong> (or <strong>Apple Intelligence &amp; Siri</strong>), turn on{" "}
            <strong>Allow Siri When Locked</strong>, and <strong>Listen for "Siri" or "Hey Siri"</strong> for
            hands-free.
          </li>
          <li>
            Lock the phone and try one: "Hey Siri, wet diaper". If it asks to unlock, check step 1.
          </li>
        </ol>
      </Steps>
    </>
  )
}

/** Settings → logging by voice or with one tap, without opening the app. */
export function ShortcutsCard({ api, code, unit }: { api: string; code: string; unit: Unit }) {
  const ios = isIos()
  const android = !ios && /Android/.test(navigator.userAgent)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Siri, widgets and one-tap buttons</CardTitle>
        <CardDescription>
          Start and stop feeds and log diapers by voice or with one tap, without opening the app. Only one feed runs
          at a time: starting another while one is going says so instead.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          {!android && (
            <Field>
              <FieldTitle>iPhone: Siri and the Shortcuts app</FieldTitle>
              <FieldDescription>
                Each shortcut sends one of the links below to the Sheet, and Siri runs it when you say its name. Put
                them on the home or lock screen with a Shortcuts widget, or on the Action button, too.
              </FieldDescription>
              <SiriSteps unit={unit} />
            </Field>
          )}
          {!ios && (
            <Field>
              <FieldTitle>Android</FieldTitle>
              <FieldDescription>
                Press and hold the app's icon for <strong>Start or stop a feed</strong>, <strong>Wet diaper</strong> and
                more. Drag one onto the home screen for a one-tap button. They open the app and work offline.
              </FieldDescription>
              <FieldDescription>
                For buttons that don't open the app, install the free <strong>HTTP Shortcuts</strong> app. Make a
                shortcut with a link below, set the method to <strong>POST</strong> and the response to{" "}
                <strong>show as a toast</strong>, then add it to the home screen as a shortcut or widget.
              </FieldDescription>
            </Field>
          )}
          {linkGroups(unit, !android).map((group) => (
            <div key={group.title} className="grid gap-1">
              <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{group.title}</div>
              {group.links.map(({ action, label, hint, extra }, i) => (
                <div key={action}>
                  {i > 0 && <Separator className="mb-1" />}
                  <div className="flex items-center justify-between gap-3 py-1">
                    <div className="min-w-0 text-sm">
                      <div className="font-medium">{label}</div>
                      {hint && <div className="text-muted-foreground text-xs">{hint}</div>}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`Copy the ${label} link`}
                      onClick={() => copy(quickLink(api, code, action, extra), label)}
                    >
                      <Copy /> Copy link
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ))}
          <FieldDescription>
            Each link holds your personal code, so anyone who has it can log entries as you. Keep them to yourself.
            The links need the Sheet's script from November 2026 or later (SETUP.md, section 9), and a connection.
            Amounts are in {unit}, as set above; copy the bottle links again after changing it.
          </FieldDescription>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
