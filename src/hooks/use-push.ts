import { useCallback, useEffect, useState, useSyncExternalStore } from "react"

import type { Backend } from "@/lib/api"
import { installState, subscribeInstall } from "@/lib/install"
import { currentSubscription, disablePush, enablePush, pushEnabledHere, pushSupport, resyncPush } from "@/lib/push"

export function useInstallState() {
  return useSyncExternalStore(subscribeInstall, installState)
}

/** Notifications on this phone: whether they're on, and turning them on, off and testing them. */
export function usePush(backend: Backend, owner: string) {
  const support = pushSupport()
  const [on, setOn] = useState<boolean | null>(null)
  const [permission, setPermission] = useState(() => ("Notification" in window ? Notification.permission : "default"))

  useEffect(() => {
    if (support !== "ok") return
    let live = true
    currentSubscription()
      .then((sub) => live && setOn(!!sub && pushEnabledHere(owner)))
      .catch(() => live && setOn(false))
    return () => {
      live = false
    }
  }, [support, owner])

  const enable = useCallback(async () => {
    try {
      const result = await enablePush(backend, owner)
      setOn(true)
      return result
    } finally {
      setPermission(Notification.permission)
    }
  }, [backend, owner])

  const disable = useCallback(async () => {
    await disablePush(backend)
    setOn(false)
  }, [backend])

  const test = useCallback(async () => {
    const sub = await currentSubscription()
    if (!sub) {
      setOn(false)
      throw new Error("This phone isn't signed up any more. Turn notifications on again.")
    }
    await backend.pushTest(sub.endpoint)
  }, [backend])

  return { support, on, permission, enable, disable, test }
}

/** Keeps this phone's subscription fresh in the Sheet. Runs once when the app opens. */
export function usePushResync(backend: Backend, owner: string | null) {
  useEffect(() => {
    if (owner) resyncPush(backend, owner).catch(() => {})
  }, [backend, owner])
}

/** The number on the home screen icon: things that are due now. Cleared when nothing is. */
export function useAppBadge(count: number) {
  useEffect(() => {
    if (!("setAppBadge" in navigator)) return
    // iPhones only show it once notifications are allowed; elsewhere it may be refused. Neither matters.
    const done = count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge()
    done.catch(() => {})
  }, [count])
}
