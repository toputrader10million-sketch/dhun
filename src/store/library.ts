'use client'
import { create } from 'zustand'
import { toast } from 'sonner'
import type { LibraryTrack, MusicItem, PlaylistDetail, PlaylistSummary } from '@/lib/types'
import { useSettings } from './settings'
import { useOffline } from './offline'

interface LibraryState {
  favorites: LibraryTrack[]
  playlists: PlaylistSummary[]
  history: LibraryTrack[]
  loaded: boolean
  loadAll: () => Promise<void>
  loadHistory: () => Promise<void>
  isFavorite: (trackId: string) => boolean
  toggleFavorite: (item: MusicItem) => Promise<void>
  refreshPlaylists: () => Promise<void>
  createPlaylist: (name: string, description?: string) => Promise<string | null>
  deletePlaylist: (id: string) => Promise<void>
  addToPlaylist: (playlistId: string, playlistName: string, item: MusicItem) => Promise<void>
  removeFromPlaylist: (playlistId: string, itemId: string) => Promise<void>
  getPlaylistDetail: (id: string) => Promise<PlaylistDetail | null>
  clearHistory: () => Promise<void>
}

function itemToTrack(item: MusicItem): Omit<LibraryTrack, 'id'> & { trackId: string } {
  return {
    trackId: item.id,
    title: item.title,
    artist: item.artist,
    artwork: item.artwork,
    duration: item.duration || 0,
    source: item.source === 'au' ? 'au' : 'yt',
  }
}

/* Day 37 — anonymous aggregate reactions: every new favorite pings the
 * community chart once per track per session. No ids beyond the track itself. */
const reactedTracks = new Set<string>()
function sendReaction(item: MusicItem) {
  if (reactedTracks.has(item.id)) return
  reactedTracks.add(item.id)
  void fetch('/api/reactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      trackId: item.id,
      source: item.source === 'au' ? 'au' : 'yt',
      title: item.title,
      artist: item.artist,
      artwork: item.artwork || undefined,
      region: useSettings.getState().region,
    }),
  }).catch(() => {})
}

export const useLibrary = create<LibraryState>((set, get) => ({
  favorites: [],
  playlists: [],
  history: [],
  loaded: false,

  loadAll: async () => {
    try {
      const [fRes, pRes] = await Promise.all([fetch('/api/favorites'), fetch('/api/playlists')])
      const favorites = fRes.ok ? (await fRes.json()).items || [] : []
      const playlists = pRes.ok ? (await pRes.json()).playlists || [] : []
      set({ favorites, playlists, loaded: true })
      get().loadHistory()
    } catch {
      set({ loaded: true })
    }
  },

  loadHistory: async () => {
    try {
      const res = await fetch('/api/history?limit=30')
      if (res.ok) set({ history: (await res.json()).items || [] })
    } catch {}
  },

  isFavorite: (trackId) => get().favorites.some((f) => f.trackId === trackId),

  toggleFavorite: async (item) => {
    const fav = get().isFavorite(item.id)
    if (fav) {
      set((s) => ({ favorites: s.favorites.filter((f) => f.trackId !== item.id) }))
      await fetch(`/api/favorites?trackId=${item.id}`, { method: 'DELETE' }).catch(() => {})
      toast('Removed from Favorites', { description: item.title.slice(0, 48) })
    } else {
      const optimistic: LibraryTrack = {
        id: `tmp-${item.id}`,
        ...itemToTrack(item),
        addedAt: new Date().toISOString(),
      }
      set((s) => ({ favorites: [optimistic, ...s.favorites] }))
      const res = await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemToTrack(item)),
      }).catch(() => null)
      if (!res || !res.ok) {
        set((s) => ({ favorites: s.favorites.filter((f) => f.id !== optimistic.id) }))
        toast.error('Could not save favorite')
      } else {
        toast.success('Saved to Favorites', { description: item.title.slice(0, 48) })
        // Day 37 — anonymous community "loved" counter (fire-and-forget)
        sendReaction(item)
        // Auto-cache for offline when enabled in Settings
        if (useSettings.getState().autoOfflineFavorites && !useOffline.getState().isDownloaded(item.id)) {
          useOffline
            .getState()
            .download(item, item.source === 'au' ? 'au' : 'yt')
            .catch(() => {})
        }
      }
    }
  },

  refreshPlaylists: async () => {
    try {
      const res = await fetch('/api/playlists')
      if (res.ok) set({ playlists: (await res.json()).playlists || [] })
    } catch {}
  },

  createPlaylist: async (name, description) => {
    try {
      const res = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      toast.success(`Playlist "${name}" created`)
      get().refreshPlaylists()
      return data.id || null
    } catch {
      toast.error('Could not create playlist')
      return null
    }
  },

  deletePlaylist: async (id) => {
    set((s) => ({ playlists: s.playlists.filter((p) => p.id !== id) }))
    await fetch(`/api/playlists?id=${id}`, { method: 'DELETE' }).catch(() => {})
    get().refreshPlaylists()
    toast('Playlist deleted')
  },

  addToPlaylist: async (playlistId, playlistName, item) => {
    try {
      const res = await fetch(`/api/playlists/${playlistId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemToTrack(item)),
      })
      if (!res.ok) throw new Error()
      toast.success(`Added to "${playlistName}"`, { description: item.title.slice(0, 48) })
      get().refreshPlaylists()
    } catch {
      toast.error('Could not add to playlist')
    }
  },

  removeFromPlaylist: async (playlistId, itemId) => {
    await fetch(`/api/playlists/${playlistId}/items?itemId=${itemId}`, { method: 'DELETE' }).catch(() => {})
    toast('Removed from playlist')
  },

  getPlaylistDetail: async (id) => {
    try {
      const res = await fetch(`/api/playlists/${id}`)
      if (!res.ok) return null
      return (await res.json()) as PlaylistDetail
    } catch {
      return null
    }
  },

  clearHistory: async () => {
    await fetch('/api/history', { method: 'DELETE' }).catch(() => {})
    set({ history: [] })
    toast('History cleared')
  },
}))
