'use client'
/* Dhun — Smart downloads (Day 23).
 *
 * Keeps the user's favorite tracks cached on-device automatically:
 *   - sweeps the favorites list and downloads whatever is missing
 *     (respecting the cap + network rules from Settings)
 *   - runs on app start, when the browser comes back online, and when
 *     favorites change — throttled so it never hammers the network
 *
 * HONEST NETWORK NOTE (documented in Settings too): browsers do not expose
 * the real Wi-Fi/Ethernet interface in a reliable cross-browser way. We use
 * the Network Information API when available:
 *   type 'wifi' | 'ethernet' | 'none'  → unmetered, downloads allowed
 *   effectiveType 'slow-2g'|'2g'|'3g'  → treated as metered, skipped
 *   saveData: true                     → always skipped (user opted into saving)
 * When the API is unavailable (Safari/Firefox) a strict Wi-Fi-only setting
 * cannot be honored — the sweep reports that instead of pretending.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useSettings } from '@/store/settings'
import { useOffline } from '@/store/offline'
import { useLibrary } from '@/store/library'

export interface NetworkKind {
  online: boolean
  saveData: boolean
  /** 'wifi-like' = unmetered per Network Info API; 'metered' = cellular/slow; 'unknown' = API missing */
  kind: 'wifi-like' | 'metered' | 'unknown'
  /** Raw connection info for the settings UI ("4g", "wifi"…) */
  detail: string
}

export function readNetwork(): NetworkKind {
  if (typeof navigator === 'undefined') {
    return { online: true, saveData: false, kind: 'unknown', detail: '' }
  }
  const conn = (navigator as Navigator & {
    connection?: { type?: string; effectiveType?: string; saveData?: boolean }
  }).connection
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

export type SweepSkipReason =
  | 'disabled'
  | 'offline'
  | 'save-data'
  | 'metered'
  | 'network-unknown'
  | 'throttled'
  | 'busy'
  | 'up-to-date'
  | 'limit-reached'

interface SmartDownloadsState {
  running: boolean
  /** Progress of the active sweep */
  progress: { done: number; failed: number; total: number }
  /** Last completed sweep result (null = never ran) */
  lastResult: { at: number; downloaded: number; failed: number; skipped: SweepSkipReason | null } | null
  /** Sweep the favorites list if conditions allow. Resolves the skip reason when nothing ran. */
  sweep: (reason?: string, opts?: { force?: boolean }) => Promise<SweepSkipReason | 'ran'>
  /** Force a sweep from the Settings button (ignores the throttle, keeps network rules unless forceAll). */
  sweepNow: (opts?: { ignoreWifiRule?: boolean }) => Promise<void>
}

const MIN_INTERVAL_MS = 5 * 60 * 1000 // at most one automatic sweep per 5 minutes
const GAP_MS = 600 // breathing room between sequential downloads

export const useSmartDownloads = create<SmartDownloadsState>()(
  persist(
    (set, get) => {
      let sweepToken = 0

      async function runSweep(force: boolean, ignoreWifiRule: boolean): Promise<SweepSkipReason | 'ran'> {
        const st = get()
        if (st.running) return 'busy'
        const settings = useSettings.getState()
        if (!settings.smartDownloads) return 'disabled'

        const net = readNetwork()
        if (!net.online) return 'offline'
        if (net.saveData) return 'save-data'
        if (!ignoreWifiRule && settings.smartWifiOnly && net.kind !== 'wifi-like') {
          return net.kind === 'unknown' ? 'network-unknown' : 'metered'
        }
        // Throttle automatic sweeps (force sweeps from Settings skip this).
        if (!force && st.lastResult && Date.now() - st.lastResult.at < MIN_INTERVAL_MS) {
          return 'throttled'
        }

        const offline = useOffline.getState()
        if (!offline.hydrated) await offline.hydrate()
        const library = useLibrary.getState()
        if (!library.loaded) {
          try {
            await library.loadAll()
          } catch {
            /* offline — favorites unknown */
          }
        }

        const favorites = useLibrary.getState().favorites
        if (favorites.length === 0) {
          set({ lastResult: { at: Date.now(), downloaded: 0, failed: 0, skipped: 'up-to-date' } })
          return 'ran'
        }

        const downloadedIds = new Set(useOffline.getState().items.map((t) => t.trackId))
        const inFlight = new Set(Object.keys(useOffline.getState().progress))
        const cap = Math.max(0, settings.smartLimit - useOffline.getState().items.length)
        if (cap === 0) {
          set({ lastResult: { at: Date.now(), downloaded: 0, failed: 0, skipped: 'limit-reached' } })
          return 'ran'
        }

        const missing = favorites
          .filter((f) => !downloadedIds.has(f.trackId) && !inFlight.has(f.trackId))
          .slice(0, Math.min(cap, 10)) // gentle: at most 10 tracks per sweep

        if (missing.length === 0) {
          set({ lastResult: { at: Date.now(), downloaded: 0, failed: 0, skipped: 'up-to-date' } })
          return 'ran'
        }

        const token = ++sweepToken
        set({ running: true, progress: { done: 0, failed: 0, total: missing.length } })
        let done = 0
        let failed = 0
        for (const f of missing) {
          if (token !== sweepToken) break // superseded
          if (!navigator.onLine) break
          const item = {
            id: f.trackId,
            title: f.title,
            artist: f.artist,
            artwork: f.artwork,
            duration: f.duration,
            source: f.source,
          }
          const ok = await useOffline
            .getState()
            .download(item, f.source === 'au' ? 'au' : 'yt')
            .catch(() => false)
          if (ok) done++
          else failed++
          set({ progress: { done, failed, total: missing.length } })
          await new Promise((r) => setTimeout(r, GAP_MS))
        }
        set({
          running: false,
          lastResult: { at: Date.now(), downloaded: done, failed, skipped: null },
        })
        if (done > 0) {
          const { toast } = await import('sonner')
          toast.success(`Smart downloads: ${done} favorite${done > 1 ? 's' : ''} saved offline`, {
            description: failed > 0 ? `${failed} could not be cached — will retry later.` : 'Ready for offline playback.',
          })
        }
        return 'ran'
      }

      return {
        running: false,
        progress: { done: 0, failed: 0, total: 0 },
        lastResult: null,

        sweep: (_reason, opts) => runSweep(Boolean(opts?.force), false),

        sweepNow: async (opts) => {
          const res = await runSweep(true, Boolean(opts?.ignoreWifiRule))
          if (res !== 'ran') {
            const { toast } = await import('sonner')
            const why: Record<Exclude<SweepSkipReason, 'busy'>, string> = {
              disabled: 'Smart downloads is off — enable it above first.',
              offline: 'You are offline right now.',
              'save-data': "Your browser's Data Saver is on, so downloads stay paused.",
              metered: 'This looks like a metered/cellular connection. Use "Run now (any network)" to override.',
              'network-unknown':
                'This browser does not expose network type, so Wi-Fi-only mode cannot confirm the connection. Override with "Run now (any network)".',
              throttled: 'Checked a moment ago — everything is fresh.',
              'up-to-date': 'Favorites are already cached within your limit.',
              'limit-reached': 'Download limit reached — raise the cap or clear some downloads.',
            }
            if (res !== 'busy') toast.info('Smart downloads', { description: why[res as Exclude<SweepSkipReason, 'busy'>] })
          }
        },
      }
    },
    {
      name: 'dhun-smart-downloads',
      partialize: (s) => ({ lastResult: s.lastResult }),
    }
  )
)
