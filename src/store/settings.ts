'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AccentColor = 'rose' | 'amber' | 'violet' | 'emerald' | 'gold'
export type PlaybackMode = 'iframe' | 'hifi'
export type EqPreset =
  | 'flat'
  | 'bass'
  | 'treble'
  | 'vocal'
  | 'electronic'
  | 'acoustic'
  | 'custom'

export const EQ_PRESETS: Record<Exclude<EqPreset, 'custom'>, number[]> = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass: [7, 6, 5, 2.5, 0, 0, 0, 0, 1, 1.5],
  treble: [-1, -1, 0, 0, 0, 1.5, 3.5, 5.5, 7, 8],
  vocal: [-2.5, -2, 0, 2.5, 4.5, 4, 2.5, 0, -1, -2],
  electronic: [6, 5.5, 1.5, 0, -1.5, 1, 2.5, 4.5, 6, 6.5],
  acoustic: [4, 3.5, 2, 1.5, 1, 2, 3, 3.5, 2.5, 1.5],
}

interface SettingsState {
  accent: AccentColor
  region: string
  playbackMode: PlaybackMode
  volume: number
  eqPreset: EqPreset
  eqGains: number[]
  autoplayRadio: boolean
  gaplessPlayback: boolean
  autoOfflineFavorites: boolean
  maxBitrate: number // 0 = no cap
  showMiniArt: boolean
  premium: boolean
  setPremium: (v: boolean) => void
  setAccent: (a: AccentColor) => void
  setRegion: (r: string) => void
  setPlaybackMode: (m: PlaybackMode) => void
  setVolume: (v: number) => void
  setEqPreset: (p: EqPreset) => void
  setEqGain: (index: number, value: number) => void
  setAutoplayRadio: (v: boolean) => void
  setGaplessPlayback: (v: boolean) => void
  setAutoOfflineFavorites: (v: boolean) => void
  setMaxBitrate: (v: number) => void
  setShowMiniArt: (v: boolean) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      accent: 'rose',
      region: 'IN',
      playbackMode: 'iframe',
      volume: 80,
      eqPreset: 'flat',
      eqGains: EQ_PRESETS.flat,
      autoplayRadio: true,
      gaplessPlayback: true,
      autoOfflineFavorites: false,
      maxBitrate: 0,
      showMiniArt: true,
      premium: false,
      // Activating premium switches to the gold theme; deactivating reverts gold → rose.
      setPremium: (premium) =>
        set((s) => ({
          premium,
          accent: premium ? 'gold' : s.accent === 'gold' ? 'rose' : s.accent,
        })),
      setAccent: (accent) => set({ accent }),
      setRegion: (region) => set({ region }),
      setPlaybackMode: (playbackMode) => set({ playbackMode }),
      setVolume: (volume) => set({ volume: Math.max(0, Math.min(100, volume)) }),
      setEqPreset: (p) =>
        set((s) => ({ eqPreset: p, eqGains: p === 'custom' ? s.eqGains : EQ_PRESETS[p] })),
      setEqGain: (index, value) =>
        set((s) => {
          const gains = [...s.eqGains]
          gains[index] = Math.max(-12, Math.min(12, value))
          return { eqPreset: 'custom', eqGains: gains }
        }),
      setAutoplayRadio: (autoplayRadio) => set({ autoplayRadio }),
      setGaplessPlayback: (gaplessPlayback) => set({ gaplessPlayback }),
      setAutoOfflineFavorites: (autoOfflineFavorites) => set({ autoOfflineFavorites }),
      setMaxBitrate: (maxBitrate) => set({ maxBitrate }),
      setShowMiniArt: (showMiniArt) => set({ showMiniArt }),
    }),
    { name: 'dhun-settings' }
  )
)

/** Apply accent color to <html data-accent> — call on app mount and on change */
export function applyAccent(accent: AccentColor) {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.accent = accent
  }
}
