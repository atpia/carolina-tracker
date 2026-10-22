import { isIos, isStandalone } from "./push"

/** Chrome's install event. Not in TypeScript's DOM types yet. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

/**
 * Chrome fires this once, early, when the app can be installed. main.tsx calls this before React renders so
 * the Settings tab can offer an Install button later.
 */
export function listenForInstall() {
  window.addEventListener("beforeinstallprompt", (e) => {
    // Keep Chrome's own mini-bar from popping up over the app; Settings offers the button instead.
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener("appinstalled", () => {
    deferred = null
    notify()
  })
}

export function subscribeInstall(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * How this copy of the app can get onto the home screen: "installed" when it's open from there, "prompt" when
 * Chrome can show its install dialog, "ios" for Safari's Share menu, "manual" for a browser's own menu.
 */
export type InstallState = "installed" | "prompt" | "ios" | "manual"

export function installState(): InstallState {
  if (isStandalone()) return "installed"
  if (deferred) return "prompt"
  if (isIos()) return "ios"
  return "manual"
}

/** Shows Chrome's install dialog. True if it was installed. */
export async function promptInstall() {
  const e = deferred
  if (!e) return false
  // The event can only be used once.
  deferred = null
  notify()
  await e.prompt()
  return (await e.userChoice).outcome === "accepted"
}
