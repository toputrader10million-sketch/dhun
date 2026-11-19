'use client'
import { create } from 'zustand'

export type ViewId =
  | 'home'
  | 'explore'
  | 'charts'
  | 'library'
  | 'network'
  | 'settings'
  | 'artist'
  | 'shared'

interface UiState {
  view: ViewId
  nowPlayingOpen: boolean
  queueOpen: boolean
  searchSeed: string // prefill search from elsewhere
  /** Day 29: artist page — the artist name currently open (null = none) */
  artistName: string | null
  /** Day 34: public share-link viewer — the token being viewed (null = none) */
  shareToken: string | null
  setView: (v: ViewId) => void
  openNowPlaying: () => void
  closeNowPlaying: () => void
  toggleQueue: () => void
  closeQueue: () => void
  goSearch: (seed?: string) => void
  clearSearchSeed: () => void
  /** Open the artist page (with a fresh load each time) */
  openArtist: (name: string) => void
  /** Leave the artist page — remembers where you were (library keeps its own back stack) */
  closeArtist: () => void
  /** Remember the tab to return to when leaving the artist page */
  returnView: ViewId | null
  /** Day 34: open the public share-link viewer for a token */
  openShared: (token: string) => void
  /** Leave the shared viewer (strip the ?p= param from the URL too) */
  closeShared: () => void
}

export const useUi = create<UiState>((set, get) => ({
  view: 'home',
  nowPlayingOpen: false,
  queueOpen: false,
  searchSeed: '',
  artistName: null,
  shareToken: null,
  returnView: null,
  setView: (view) => set((s) => ({ view, returnView: view === 'artist' ? s.returnView : null })),
  openNowPlaying: () => set({ nowPlayingOpen: true }),
  closeNowPlaying: () => set({ nowPlayingOpen: false }),
  toggleQueue: () => set((s) => ({ queueOpen: !s.queueOpen })),
  closeQueue: () => set({ queueOpen: false }),
  goSearch: (seed = '') => set({ view: 'explore', searchSeed: seed, artistName: null }),
  clearSearchSeed: () => set({ searchSeed: '' }),
  openArtist: (name) =>
    set((s) => ({ artistName: name, view: 'artist', returnView: s.view === 'artist' ? s.returnView : s.view })),
  closeArtist: () =>
    set({ view: get().returnView ?? 'home', artistName: null, returnView: null }),
  openShared: (token) => set({ shareToken: token, view: 'shared' }),
  closeShared: () => {
    // Clean the deep-link param so a reload doesn't reopen the viewer
    try {
      const url = new URL(window.location.href)
      if (url.searchParams.has('p')) {
        url.searchParams.delete('p')
        window.history.replaceState(null, '', url.pathname + url.search)
      }
    } catch {
      /* noop */
    }
    set({ shareToken: null, view: get().returnView ?? 'home' })
  },
}))
