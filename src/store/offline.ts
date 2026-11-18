'use client'
/* Dhun — Zustand store for offline downloads (UI-facing).
 * Wraps src/lib/offline.ts: tracks download progress, hydrated registry, toasts.
 */
import { create } from 'zustand'
import { toast } from 'sonner'
import {
  addOffline,
  clearAllOffline,
  listOffline,
  removeOffline,
  type OfflineTrack,
} from '@/lib/offline'
import { clientResolveAudio } from '@/lib/client-resolve'
import { findSmartMatches } from '@/lib/smart-match'
import { useKeys } from '@/store/keys'
import type { TrackSource } from '@/lib/types'

interface DownloadItem {
  id: string
  title: string
  artist: string
  artwork?: string | null
  duration?: number
}

interface OfflineStore {
  items: OfflineTrack[]
  progress: Record<string, { loaded: number; total: number | null }>
  hydrated: boolean
  hydrate: () => Promise<void>
  refresh: () => Promise<void>
  download: (item: DownloadItem, source?: TrackSource) => Promise<boolean>
  remove: (trackId: string) => Promise<void>
  clearAll: () => Promise<void>
  isDownloaded: (trackId: string) => boolean
  isDownloading: (trackId: string) => boolean
  urlFor: (trackId: string) => string | null
  totalSize: () => number
}

export const useOffline = create<OfflineStore>((set, get) => ({
  items: [],
  progress: {},
  hydrated: false,

  /** Load the offline registry once (call from app root / on mount). */
  hydrate: async () => {
    const items = await listOffline()
    set({ items, hydrated: true })
  },

  /** Re-read the registry (after a download/remove completes). */
  refresh: async () => {
    const items = await listOffline()
    set({ items })
  },

  download: async (item, source) => {
    const trackId = item.id
    if (get().isDownloading(trackId)) return false
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast.error('You are offline', { description: 'Connect to the internet to download new tracks.' })
      return false
    }
    set((s) => ({ progress: { ...s.progress, [trackId]: { loaded: 0, total: null } } }))
    try {
      const src: TrackSource = source ?? 'yt'
      const jamendoKey = useKeys.getState().jamendoKey

      // Resolve the same-origin URL the SW will cache:
      //  - yt: client-assisted Piped resolve first (server IPs are blocked in
      //    2025); when that fails, Smart Match finds the same song on Jamendo/
      //    Audius and caches that legal alternative under the original id.
      //  - jm: our proxy with the BYO key, preferring the legal download file.
      //  - au: the server proxy already works as-is.
      let urlOverride: string | undefined
      let matchedVia: 'audius' | 'jamendo' | undefined
      // Ranked alternatives for the Smart-Match retry chain (dead tracks happen).
      let fallbackMatches: Awaited<ReturnType<typeof findSmartMatches>> = []
      if (src === 'yt') {
        const resolved = await clientResolveAudio(trackId)
        if (resolved) {
          urlOverride = `/api/audio/${trackId}?upstream=${encodeURIComponent(resolved.upstreamUrl)}&ct=${encodeURIComponent(resolved.mimeType)}`
        } else {
          fallbackMatches = await findSmartMatches(item.title, item.artist, item.duration)
          const alt = fallbackMatches[0]
          if (alt) {
            urlOverride = alt.url
            matchedVia = alt.via
          }
        }
      } else if (src === 'jm') {
        const qs = new URLSearchParams(jamendoKey ? { key: jamendoKey } : {})
        qs.set('download', '1')
        urlOverride = `/api/jamendo/stream/${trackId}?${qs.toString()}`
      }

      const result = await addOffline(item, src, (loaded, total) => {
        set((s) => ({ progress: { ...s.progress, [trackId]: { loaded, total } } }))
      }, urlOverride, matchedVia)
      if (result.ok) {
        await get().refresh()
        if (matchedVia) {
          toast.success('Saved offline (matched version)', {
            description: `${item.title.slice(0, 44)} — YouTube audio was blocked, so the same song was cached from ${matchedVia === 'jamendo' ? 'Jamendo' : 'Audius'}.`,
          })
        } else {
          toast.success('Available offline', { description: item.title.slice(0, 50) })
        }
        return true
      }

      // Smart-Match retry chain: walk the ranked alternatives when the first
      // source is dead (502/upstream/dead-stream failures are retryable).
      const retryable =
        result.error === 'youtube-download-blocked' ||
        result.error === '502' ||
        result.error.startsWith('upstream') ||
        result.error.startsWith('jamendo-') ||
        result.error === 'download-failed' ||
        result.error === 'no-stream'
      if (retryable && fallbackMatches.length > 0) {
        for (let i = 0; i < fallbackMatches.length; i++) {
          if (matchedVia !== undefined && i === 0) continue // first match already tried
          const alt = fallbackMatches[i]
          set((s) => ({ progress: { ...s.progress, [trackId]: { loaded: 0, total: null } } }))
          const retry = await addOffline(item, src, (loaded, total) => {
            set((s) => ({ progress: { ...s.progress, [trackId]: { loaded, total } } }))
          }, alt.url, alt.via)
          if (retry.ok) {
            await get().refresh()
            toast.success('Saved offline (matched version)', {
              description: `${item.title.slice(0, 44)} — YouTube audio was blocked, so the same song was cached from ${alt.via === 'jamendo' ? 'Jamendo' : 'Audius'}.`,
            })
            return true
          }
        }
      }

      toast.error('Offline download failed', {
        description:
          result.error === 'no-sw'
            ? 'Service worker is not active yet — reload the app and try again.'
            : result.error === 'too-large'
              ? 'Track is too large to cache (150MB limit).'
              : result.error === 'timeout'
                ? 'Download timed out. Check your connection.'
                : result.error === 'youtube-download-blocked' || result.error === 'no-stream'
                  ? 'YouTube blocked it and no confident match was found on Jamendo/Audius. Add a free Jamendo key in Explore for legal downloads.'
                  : `Reason: ${result.error}`,
      })
      return false
    } catch {
      toast.error('Offline download failed', { description: 'Unexpected error while caching.' })
      return false
    } finally {
      set((s) => {
        const progress = { ...s.progress }
        delete progress[trackId]
        return { progress }
      })
    }
  },

  remove: async (trackId) => {
    await removeOffline(trackId)
    await get().refresh()
  },

  clearAll: async () => {
    await clearAllOffline()
    set({ items: [] })
  },

  isDownloaded: (trackId) => get().items.some((t) => t.trackId === trackId),
  isDownloading: (trackId) => Boolean(get().progress[trackId]),
  urlFor: (trackId) => get().items.find((t) => t.trackId === trackId)?.url ?? null,
  totalSize: () => get().items.reduce((sum, t) => sum + (t.size || 0), 0),
}))
