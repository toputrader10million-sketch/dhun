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
  download: (item: DownloadItem, source?: 'yt' | 'au') => Promise<boolean>
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
    set((s) => ({ progress: { ...s.progress, [trackId]: { loaded: 0, total: null } } }))
    try {
      const result = await addOffline(item, source ?? 'yt', (loaded, total) => {
        set((s) => ({ progress: { ...s.progress, [trackId]: { loaded, total } } }))
      })
      if (result.ok) {
        await get().refresh()
        toast.success('Available offline', { description: item.title.slice(0, 50) })
        return true
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
                  ? 'YouTube is blocking direct downloads right now — streaming still works. Audius tracks download fine.'
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
