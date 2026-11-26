'use client'
/* Dhun — Network Information helper (Q2, Phase Q2 "real-device loop").
 *
 * Single source of truth for what we can honestly know about the connection:
 *   type 'wifi' | 'ethernet' | 'none'  → unmetered
 *   effectiveType 'slow-2g'|'2g'|'3g'  → metered
 *   saveData: true                     → the OS/browser Data Saver is on
 * The Network Information API is Chromium-only; on Safari/Firefox everything
 * degrades to 'unknown' — callers must degrade honestly, never pretend.
 *
 * Extracted from smart-downloads.ts so settings/data-saver/engine code can
 * read it without importing the whole downloads store (avoids import cycles).
 */
export interface NetworkKind {
  online: boolean
  saveData: boolean
  /** 'wifi-like' = unmetered per Network Info API; 'metered' = cellular/slow; 'unknown' = API missing */
  kind: 'wifi-like' | 'metered' | 'unknown'
  /** Raw connection info for the settings UI ("4g", "wifi"…) */
  detail: string
}

type ConnectionInfo = { type?: string; effectiveType?: string; saveData?: boolean }

/** Chromium-only connection object (undefined on Safari/Firefox). */
export function getConnection(): ConnectionInfo | undefined {
  if (typeof navigator === 'undefined') return undefined
  return (navigator as Navigator & { connection?: ConnectionInfo }).connection
}

export function readNetwork(): NetworkKind {
  if (typeof navigator === 'undefined') {
    return { online: true, saveData: false, kind: 'unknown', detail: '' }
  }
  const conn = getConnection()
  const online = navigator.onLine
  const saveData = Boolean(conn?.saveData)
  const type = (conn?.type ?? '').toLowerCase()
  const eff = (conn?.effectiveType ?? '').toLowerCase()
  const detail = type || eff
  if (!online) return { online: false, saveData, kind: 'metered', detail: 'offline' }
  if (type === 'wifi' || type === 'ethernet') return { online, saveData, kind: 'wifi-like', detail: type }
  if (['slow-2g', '2g', '3g'].includes(eff)) return { online, saveData, kind: 'metered', detail: eff || 'cellular' }
  if (type === 'cellular') return { online, saveData, kind: 'metered', detail: eff || 'cellular' }
  return { online, saveData, kind: 'unknown', detail }
}

/* --- React-friendly external store for the network snapshot (no setState-in-effect) --- */
const SERVER_NET_SNAPSHOT: NetworkKind = { online: true, saveData: false, kind: 'unknown', detail: '' }
let netSnapshot: NetworkKind | null = null
const netListeners = new Set<() => void>()

function refreshNetSnapshot() {
  const next = readNetwork()
  const prev = netSnapshot
  netSnapshot = next
  if (
    prev &&
    (prev.online !== next.online ||
      prev.saveData !== next.saveData ||
      prev.kind !== next.kind ||
      prev.detail !== next.detail)
  ) {
    netListeners.forEach((l) => l())
  }
}

/** useSyncExternalStore-compatible subscribe (binds listeners once). */
export function subscribeNetwork(onChange: () => void): () => void {
  netListeners.add(onChange)
  if (netListeners.size === 1 && typeof window !== 'undefined') {
    refreshNetSnapshot()
    window.addEventListener('online', refreshNetSnapshot)
    window.addEventListener('offline', refreshNetSnapshot)
  }
  return () => {
    netListeners.delete(onChange)
  }
}

/** useSyncExternalStore-compatible snapshot (stable reference until a change). */
export function getNetworkSnapshot(): NetworkKind {
  if (typeof window === 'undefined') return SERVER_NET_SNAPSHOT
  if (!netSnapshot) refreshNetSnapshot()
  return netSnapshot!
}

export const getNetworkServerSnapshot = (): NetworkKind => SERVER_NET_SNAPSHOT

/** Detect an iPhone / iPad / iPod (lockscreen + PWA behavior differences). */
export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}
