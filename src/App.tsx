import { useEffect, useMemo, useState } from "react"
import { CloudOff, History as HistoryIcon, House, Loader2, Settings as SettingsIcon } from "lucide-react"

import { Dashboard } from "@/components/dashboard"
import { EntrySheet, type Draft } from "@/components/entry-sheet"
import { History } from "@/components/history"
import { SettingsView, type Theme } from "@/components/settings-view"
import { SetupScreen } from "@/components/setup-screen"
import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/sonner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLocalState } from "@/hooks/use-local-state"
import { useTracker } from "@/hooks/use-tracker"
import { loadConnection, saveConnection, type Connection } from "@/lib/api"
import { deriveStatus } from "@/lib/derive"
import type { Unit } from "@/lib/units"

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
    const apply = () =>
      document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && media.matches))
    apply()
    media.addEventListener("change", apply)
    return () => media.removeEventListener("change", apply)
  }, [theme])
}

export default function App() {
  const [conn, setConn] = useState<Connection | null>(() => {
    const fromHash = connectionFromHash()
    if (fromHash) saveConnection(fromHash)
    return fromHash ?? loadConnection()
  })
  const [theme, setTheme] = useLocalState<Theme>("ct.theme", "system")
  useTheme(theme)

  const connect = (c: Connection | null) => {
    saveConnection(c)
    setConn(c)
  }

  return (
    <>
      {conn ? <Tracker conn={conn} onSignOut={() => connect(null)} theme={theme} onTheme={setTheme} /> : <SetupScreen onConnect={connect} />}
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
  const [unit, setUnit] = useLocalState<Unit>("ct.unit", "ml")
  const [tab, setTab] = useLocalState("ct.tab", "now")
  const [draft, setDraft] = useState<Draft | null>(null)
  const status = useMemo(() => deriveStatus(tracker.events, tracker.settings), [tracker.events, tracker.settings])

  if (tracker.sessionError) {
    return (
      <div className="mx-auto grid min-h-dvh max-w-md content-center gap-4 p-6 text-center">
        <CloudOff className="text-muted-foreground mx-auto size-10" />
        <h1 className="text-xl font-semibold">Couldn't sign in</h1>
        <p className="text-muted-foreground text-sm">{tracker.sessionError}</p>
        <Button onClick={() => location.reload()}>Try again</Button>
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
          {tracker.loading && <Loader2 className="size-3.5 animate-spin" />}
          {tracker.error && !tracker.loading && (
            <button className="text-destructive flex items-center gap-1" onClick={tracker.refresh}>
              <CloudOff className="size-3.5" /> Offline, tap to retry
            </button>
          )}
          {tracker.user && <span>{tracker.user}</span>}
        </div>
      </header>

      <main className="px-4 pb-28">
        <TabsContent value="now">
          <Dashboard
            status={status}
            user={tracker.user}
            unit={unit}
            onOpen={setDraft}
            onSave={tracker.save}
            onRemove={tracker.remove}
          />
        </TabsContent>
        <TabsContent value="history">
          <History events={tracker.events} unit={unit} days={tracker.days} onOpen={setDraft} onLoadMore={tracker.loadMore} />
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
          />
        </TabsContent>
      </main>

      <nav className="bg-background/90 fixed inset-x-0 bottom-0 z-20 border-t backdrop-blur">
        <TabsList className="mx-auto flex h-auto w-full max-w-lg justify-around rounded-none bg-transparent p-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <NavItem value="now" icon={<House />} label="Now" />
          <NavItem value="history" icon={<HistoryIcon />} label="History" />
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
