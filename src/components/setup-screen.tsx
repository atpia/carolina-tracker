import { useState } from "react"
import { Baby } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createBackend, type Connection } from "@/lib/api"

/** Accepts a full personal setup link pasted into the first field. */
function parseSetupLink(text: string): Connection | null {
  const hash = text.trim().split("#")[1]
  if (!hash) return null
  const params = new URLSearchParams(hash)
  const api = params.get("api")
  const code = params.get("code")
  return api && code ? { api, code } : null
}

export function SetupScreen({ initial, onConnect }: { initial?: Partial<Connection>; onConnect: (c: Connection) => void }) {
  const [api, setApi] = useState(initial?.api ?? "")
  const [code, setCode] = useState(initial?.code ?? "")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function connect() {
    const conn = parseSetupLink(api) ?? { api: api.trim(), code: code.trim() }
    setBusy(true)
    setError("")
    try {
      await createBackend(conn).session()
      onConnect(conn)
    } catch (e) {
      setError((e as Error).message === "Failed to fetch" ? "Couldn't reach the tracker. Check the link." : (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto grid min-h-dvh max-w-md content-center gap-6 p-4">
      <div className="grid justify-items-center gap-2 text-center">
        <span className="bg-feed/15 text-feed flex size-14 items-center justify-center rounded-full">
          <Baby className="size-7" />
        </span>
        <h1 className="text-2xl font-semibold">Baby tracker</h1>
        <p className="text-muted-foreground text-sm">Feedings, diapers and mom's medication, shared between caregivers.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Connect this phone</CardTitle>
          <CardDescription>
            Paste the personal setup link you were sent. You can also paste the tracker link and type your code separately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              connect()
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="api">Setup link</Label>
              <Input id="api" value={api} onChange={(e) => setApi(e.target.value)} placeholder="https://atpia.github.io/carolina-tracker/#api=…" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="code">Personal code (not needed with a setup link)</Label>
              <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button size="lg" type="submit" disabled={busy || !api || (!code && !parseSetupLink(api))}>
              {busy ? "Connecting…" : "Connect"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => onConnect({ api: "demo", code: "demo" })}>
              Try it first with demo data on this phone
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
