'use client'
import { create } from 'zustand'

export type ViewId = 'home' | 'explore' | 'library' | 'settings'

interface UiState {
  view: ViewId
  nowPlayingOpen: boolean
  queueOpen: boolean
  searchSeed: string // prefill search from elsewhere
  setView: (v: ViewId) => void
  openNowPlaying: () => void
  closeNowPlaying: () => void
  toggleQueue: () => void
  closeQueue: () => void
  goSearch: (seed?: string) => void
  clearSearchSeed: () => void
}

export const useUi = create<UiState>((set) => ({
  view: 'home',
  nowPlayingOpen: false,
  queueOpen: false,
  searchSeed: '',
  setView: (view) => set({ view }),
  openNowPlaying: () => set({ nowPlayingOpen: true }),
  closeNowPlaying: () => set({ nowPlayingOpen: false }),
  toggleQueue: () => set((s) => ({ queueOpen: !s.queueOpen })),
  closeQueue: () => set({ queueOpen: false }),
  goSearch: (seed = '') => set({ view: 'explore', searchSeed: seed }),
  clearSearchSeed: () => set({ searchSeed: '' }),
}))
