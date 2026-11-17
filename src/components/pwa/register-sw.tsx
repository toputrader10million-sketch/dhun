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

/** Registers the service worker and captures the PWA install prompt. */
export default function RegisterSW() {
  useEffect(() => {
    // The SW serves dev hosts network-first (IS_DEV_HOST check in sw.js), so
    // registering in dev is safe — needed for offline-audio testing.
    if ('serviceWorker' in navigator) {
      const register = () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {})
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
