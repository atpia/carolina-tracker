import { Component, type ReactNode } from "react"
import { CircleAlert, RefreshCw } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { claimAutoReload, isChunkLoadError } from "@/lib/chunk"

/**
 * Shows a Reload button instead of a blank screen when something below it fails to render. A part of the
 * app that's missing after a deploy reloads the page once on its own.
 */
export class ErrorBoundary extends Component<
  { title: string; description: string; className?: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    if (isChunkLoadError(error) && claimAutoReload()) location.reload()
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className={this.props.className ?? "grid gap-4"}>
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>{this.props.title}</AlertTitle>
          <AlertDescription>{this.props.description}</AlertDescription>
        </Alert>
        <Button onClick={() => location.reload()}>
          <RefreshCw /> Reload
        </Button>
      </div>
    )
  }
}
