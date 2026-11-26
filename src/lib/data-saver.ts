'use client'
/* Dhun — Data saver (Q2.9).
 *
 * One switch that meaningfully reduces data use:
 *   - stream cap: YouTube Hi-Fi streams + offline downloads resolve ≤128 kbps
 *   - artwork tiers: feeds load mqdefault instead of hqdefault; the hi-res
 *     iTunes artwork upgrade is skipped
 *   - the blurred Now Playing backdrop loads the small tier
 *
 * Activation = manual toggle OR (follow-OS AND the browser reports saveData).
 * Safari/Firefox do not expose saveData — follow-OS then honestly does
 * nothing there (the Settings card says so).
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { useSettings } from '@/store/settings'
import { getNetworkServerSnapshot, getNetworkSnapshot, subscribeNetwork, getConnection } from '@/lib/network'

/** Non-reactive read for engine/store code (player, offline, SW bridge). */
export function isDataSaverActive(): boolean {
  const s = useSettings.getState()
  if (s.dataSaver) return true
  if (!s.dataSaverFollowOs) return false
  return Boolean(getConnection()?.saveData)
}

/**
 * Effective kbps cap for stream resolution and offline downloads.
 * Manual maxBitrate (Settings) always applies; data saver tightens it to 128.
 */
export function effectiveMaxBitrate(): number {
  const s = useSettings.getState()
  const manual = s.maxBitrate > 0 ? s.maxBitrate : 0
  if (isDataSaverActive()) return manual > 0 ? Math.min(manual, 128) : 128
  return manual
}

/** React hook — re-renders when the manual toggle, follow-OS flag, or the
 *  browser-reported saveData flag changes. */
export function useDataSaver(): boolean {
  const manual = useSettings((s) => s.dataSaver)
  const followOs = useSettings((s) => s.dataSaverFollowOs)
  const net = useSyncExternalStore(subscribeNetwork, getNetworkSnapshot, getNetworkServerSnapshot)
  if (manual) return true
  if (!followOs) return false
  return net.saveData
}

/** One-time toast: when the OS Data Saver turns the mode on by itself. */
export function useDataSaverOsAnnounce(): void {
  const manual = useSettings((s) => s.dataSaver)
  const followOs = useSettings((s) => s.dataSaverFollowOs)
  const net = useSyncExternalStore(subscribeNetwork, getNetworkSnapshot, getNetworkServerSnapshot)
  const [announced, setAnnounced] = useState(false)
  useEffect(() => {
    if (announced || manual || !followOs || !net.saveData) return
    setAnnounced(true)
    import('sonner').then(({ toast }) => {
      toast('Data saver is active', {
        description: 'Your device asked apps to save data — streams are capped at 128 kbps and feeds load smaller artwork. Turn it off in Settings → Data saver.',
        duration: 6000,
      })
    })
  }, [announced, manual, followOs, net.saveData])
}

/** Smaller artwork tier for a stored URL (YouTube thumbnails, iTunes 1000px). */
export function lowTierArt(url: string | null | undefined): string | null {
  if (!url) return null
  if (/i\.ytimg\.com\/vi\/[\w-]+\/hqdefault\.jpg/.test(url)) return url.replace('hqdefault', 'mqdefault')
  if (/(\d+x\d+bb)\.jpg/.test(url)) return url.replace(/\d+x\d+bb/, '200x200')
  return url
}
