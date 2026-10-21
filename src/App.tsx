import { lazy, Suspense, useEffect, useMemo, useState } from "react"
import {
  CalendarDays,
  ChartColumn,
  CloudOff,
  CloudUpload,
  History as HistoryIcon,
  House,
  RefreshCw,
  Settings as SettingsIcon,
  UserRound,
} from "lucide-react"
import { toast } from "sonner"

import { Appointments } from "@/components/appointments"
import { Dashboard } from "@/components/dashboard"
import { EntrySheet, type Draft } from "@/components/entry-sheet"
import { ErrorBoundary } from "@/components/error-boundary"
import type { ReportRange } from "@/components/reports"
import { History } from "@/components/history"
import { SettingsView, type Theme } from "@/components/settings-view"
import { SetupScreen } from "@/components/setup-screen"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Toaster } from "@/components/ui/sonner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAppointments } from "@/hooks/use-appointments"
import { useLocalState } from "@/hooks/use-local-state"
import { useNow } from "@/hooks/use-now"
import { useTracker } from "@/hooks/use-tracker"
import { loadConnection, saveConnection, type Connection } from "@/lib/api"
import { clearAutoReload } from "@/lib/chunk"
import { deriveStatus } from "@/lib/derive"
import type { Unit } from "@/lib/units"

// Reports pulls in the chart library, the bulk of the app's size, so it loads only when opened.
const loadReports = () =>
  import("@/components/reports").then((m) => {
    clearAutoReload()
    return m
  })
const Reports = lazy(() => loadReports().then((m) => ({ default: m.Reports })))

/** Fetch the Reports code once the app is idle, so the service worker has it cached for offline use. */
function useWarmReports() {
  useEffect(() => {
    const warm = () => loadReports().catch(() => {})
    if ("requestIdleCallback" in window) {
      const id = requestIdleCallback(warm, { timeout: 10_000 })
      return () => cancelIdleCallback(id)
    }
    const id = setTimeout(warm, 3000)
    return () => clearTimeout(id)
  }, [])
}

/** A setup link looks like …/#api=<script url>&code=<personal code>. */
function connectionFromHash(): Connection | null {
  const params = new URLSearchParams(window.location.hash.slice(1))
  const api = params.get("api")
  const code = params.get("code")
  if (!api || !code) return null
  history.replaceState(null, "", window.location.pathname + window.location.search)
  return { api, code }
}

function useTheme(theme: Theme) {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const apply = () => {
      // An embedding page can force a theme with data-theme on <html>.
      const forced = document.documentElement.dataset.theme
      const dark = theme === "system" ? (forced ? forced === "dark" : media.matches) : theme === "dark"
      document.documentElement.classList.toggle("dark", dark)
    }
    apply()
    media.addEventListener("change", apply)
    return () => media.removeEventListener("change", apply)
  }, [theme])
}

export default function App() {
  const [conn, setConn] = useState<Connection | null>(() => {
    const fromHash = connectionFromHash()
    if (fromHash) saveConnection(fromHash)
    return fromHash ?? loadConnection() ?? (import.meta.env.VITE_DEMO ? { api: "demo", code: "demo" } : null)
  })
  const [theme, setTheme] = useLocalState<Theme>("ct.theme", "system")
  useTheme(theme)

  const connect = (c: Connection | null) => {
    saveConnection(c)
    setConn(c)
  }

  return (
    <>
      {conn ? (
        <Tracker conn={conn} onSignOut={() => connect(null)} theme={theme} onTheme={setTheme} />
      ) : (
        <SetupScreen onConnect={connect} />
      )}
      <Toaster position="top-center" richColors closeButton />
    </>
  )
}

function Tracker({
  conn,
  onSignOut,
  theme,
  onTheme,
}: {
  conn: Connection
  onSignOut: () => void
  theme: Theme
  onTheme: (t: Theme) => void
}) {
  const tracker = useTracker(conn)
  const appointments = useAppointments(conn)
  const [unit, setUnit] = useLocalState<Unit>("ct.unit", "ml")
  const [tab, setTab] = useLocalState("ct.tab", "now")
  const [draft, setDraft] = useState<Draft | null>(null)
  const [reportRange, setReportRange] = useState<ReportRange>({ preset: "7d" })
  useWarmReports()
  // A one-minute tick keeps "today", forgotten timers and 24-hour med counts current even when no new data arrives.
  const minute = useNow(60_000)
  const status = useMemo(
    () => deriveStatus(tracker.events, tracker.settings, minute),
    [tracker.events, tracker.settings, minute],
  )

  if (tracker.sessionError) {
    return (
      <div className="mx-auto grid min-h-dvh max-w-md content-center gap-4 p-6">
        <Alert variant="destructive">
          <CloudOff />
          <AlertTitle>Couldn't sign in</AlertTitle>
          <AlertDescription>
            <p>{tracker.sessionError}</p>
            {tracker.queued > 0 && (
              <p>
                {tracker.queued === 1 ? "1 entry" : `${tracker.queued} entries`} on this phone{" "}
                {tracker.queued === 1 ? "hasn't" : "haven't"} synced. They'll sync if you sign back in with the same
                code.
              </p>
            )}
          </AlertDescription>
        </Alert>
        <Button onClick={() => location.reload()}>
          <RefreshCw /> Try again
        </Button>
        <Button variant="ghost" onClick={onSignOut}>
          Use a different code
        </Button>
      </div>
    )
  }

  return (
    <Tabs value={tab} onValueChange={setTab} className="mx-auto min-h-dvh max-w-lg gap-0">
      <header className="bg-background/85 sticky top-0 z-10 flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur">
        <h1 className="text-xl font-semibold">{tracker.settings.babyName}</h1>
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          {tracker.loading && <Spinner className="size-3.5" />}
          {tracker.queued > 0 && (
            <span className="flex items-center gap-1" title="Saved on this phone, waiting for a connection">
              <CloudUpload className="size-3.5" /> {tracker.queued} to sync
            </span>
          )}
          {tracker.error && !tracker.loading && (
            <button
              className="text-destructive flex items-center gap-1"
              onClick={() => {
                if (tracker.error?.kind === "server") toast.error(tracker.error.message)
                tracker.refresh()
              }}
            >
              <CloudOff className="size-3.5" />{" "}
              {tracker.error.kind === "network" ? "Offline, tap to retry" : "Sync problem, tap to retry"}
            </button>
          )}
          {tracker.user && (
            <span className="flex items-center gap-1">
              <UserRound className="size-3.5" /> {tracker.user}
            </span>
          )}
        </div>
      </header>

      <main className="px-4 pb-28">
        <TabsContent value="now">
          {tracker.loading && tracker.events.length === 0 ? (
            <div className="grid gap-4">
              <Skeleton className="h-56 rounded-xl" />
              <Skeleton className="h-52 rounded-xl" />
              <Skeleton className="h-60 rounded-xl" />
            </div>
          ) : (
            <Dashboard
              status={status}
              user={tracker.user}
              babyName={tracker.settings.babyName}
              unit={unit}
              onOpen={setDraft}
              onSave={tracker.save}
              onRemove={tracker.remove}
            />
          )}
        </TabsContent>
        <TabsContent value="history">
          <History
            events={tracker.events}
            unit={unit}
            days={tracker.days}
            loadedDays={tracker.loadedDays}
            failed={tracker.error !== null}
            onOpen={setDraft}
            onLoadMore={tracker.loadMore}
          />
        </TabsContent>
        <TabsContent value="reports" className="min-w-0">
          <ErrorBoundary
            title="Reports couldn't load"
            description="This usually happens right after an update, or when the phone is offline. Reload to try again."
          >
            <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
              <Reports
                events={tracker.events}
                unit={unit}
                babyName={tracker.settings.babyName}
                loadedDays={tracker.loadedDays}
                onEnsureDays={tracker.ensureDays}
                selected={reportRange}
                onSelect={setReportRange}
              />
            </Suspense>
          </ErrorBoundary>
        </TabsContent>
        <TabsContent value="calendar">
          <Appointments state={appointments} user={tracker.user} demo={conn.api === "demo"} />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsView
            user={tracker.user}
            users={tracker.users}
            settings={tracker.settings}
            demo={conn.api === "demo"}
            unit={unit}
            onUnit={setUnit}
            theme={theme}
            onTheme={onTheme}
            onSignOut={onSignOut}
            queued={tracker.queued}
          />
        </TabsContent>
      </main>

      <nav className="bg-background/90 fixed inset-x-0 bottom-0 z-20 border-t backdrop-blur">
        <TabsList className="mx-auto flex h-auto w-full max-w-lg justify-around rounded-none bg-transparent p-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <NavItem value="now" icon={<House />} label="Now" />
          <NavItem value="history" icon={<HistoryIcon />} label="History" />
          <NavItem value="reports" icon={<ChartColumn />} label="Reports" />
          <NavItem value="calendar" icon={<CalendarDays />} label="Calendar" />
          <NavItem value="settings" icon={<SettingsIcon />} label="Settings" />
        </TabsList>
      </nav>

      <EntrySheet
        draft={draft}
        onClose={() => setDraft(null)}
        onSave={tracker.save}
        onDelete={tracker.remove}
        user={tracker.user}
        unit={unit}
        demo={conn.api === "demo"}
      />
    </Tabs>
  )
}

function NavItem({ value, icon, label }: { value: string; icon: React.ReactNode; label: string }) {
  return (
    <TabsTrigger
      value={value}
      className="data-[state=active]:text-primary h-auto focus-visible:ring-0 focus-visible:outline-none focus-visible:border-transparent flex-col gap-0.5 py-1.5 text-xs data-[state=active]:bg-transparent data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent dark:data-[state=active]:border-transparent [&_svg:not([class*='size-'])]:size-5"
    >
      {icon}
      {label}
    </TabsTrigger>
  )
}
