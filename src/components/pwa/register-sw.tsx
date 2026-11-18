'use client'
import { useEffect } from 'react'
import { create } from 'zustand'

interface InstallState {
  canInstall: boolean
  promptEvent: any
  setPromptEvent: (e: any) => void
  clearPrompt: () => void
}

export const useInstall = create<InstallState>((set) => ({
  canInstall: false,
  promptEvent: null,
  setPromptEvent: (promptEvent) => set({ promptEvent, canInstall: !!promptEvent }),
  clearPrompt: () => set({ promptEvent: null, canInstall: false }),
}))

/**
 * Stable device identity: the dhun_uid cookie can be lost (parallel first-load
 * race in dev, HMR reloads, cookie purges), which silently creates a new user
 * and orphans favorites/history. Mirror the id into localStorage and restore
 * the cookie from it before any API call — identity survives cookie churn.
 */
function healUserIdentity() {
  const KEY = 'dhun_uid'
  const COOKIE = 'dhun_uid'
  const match = document.cookie.match(/(?:^|;\s*)dhun_uid=([^;]+)/)
  const cookieId = match?.[1]
  const stored = localStorage.getItem(KEY)
  const valid = (v: string | undefined | null): v is string =>
    !!v && /^c[a-z0-9]{20,}$/i.test(v)

  // The persisted identity wins: it is the long-lived owner of this device's
  // favorites/history. A differing cookie means identity churn happened.
  if (valid(stored) && cookieId !== stored) {
    document.cookie = `${COOKIE}=${stored}; path=/; max-age=31536000; samesite=lax`
    return
  }
  if (valid(cookieId) && !stored) {
    localStorage.setItem(KEY, cookieId)
  }
}

/** Registers the service worker and captures the PWA install prompt. */
export default function RegisterSW() {
  useEffect(() => {
    healUserIdentity()

    // The SW serves dev hosts network-first (IS_DEV_HOST check in sw.js), so
    // registering in dev is safe — needed for offline-audio testing.
    if ('serviceWorker' in navigator) {
      const register = () => {
        // Never swallow registration errors — a broken sw.js silently kills
        // offline downloads (no 'no-sw'-surfacing without this log).
        navigator.serviceWorker.register('/sw.js').catch((err) => {
          console.error('[Dhun] Service worker registration failed:', err)
        })
      }
      if (document.readyState === 'complete') register()
      else window.addEventListener('load', register, { once: true })
    }

    const onPrompt = (e: Event) => {
      e.preventDefault()
      useInstall.getState().setPromptEvent(e)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)

    const onInstalled = () => {
      useInstall.getState().clearPrompt()
    }
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  return null
}

/** Call from any button to trigger the native install flow. */
export async function triggerInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const { promptEvent, clearPrompt } = useInstall.getState()
  if (!promptEvent) return 'unavailable'
  promptEvent.prompt()
  const choice = await promptEvent.userChoice
  clearPrompt()
  return choice.outcome === 'accepted' ? 'accepted' : 'dismissed'
}
