'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AccentColor = 'rose' | 'amber' | 'violet' | 'emerald' | 'gold'
export type PlaybackMode = 'iframe' | 'hifi'
export type LyricsFontSize = 'sm' | 'md' | 'lg' | 'xl'
/** Day 43 — UI language (English source / বাংলা) */
export type AppLanguage = 'en' | 'bn'

/** Day 26 — Now Playing visualizer styles */
export type VisualizerMode = 'off' | 'bars' | 'wave' | 'ring'

/** Day 25 — EQ profiles are stored per audio source (+ a global default) */
export type EqSourceKey = 'default' | 'yt' | 'au' | 'jm'
export const EQ_SOURCE_KEYS: EqSourceKey[] = ['default', 'yt', 'au', 'jm']
export const EQ_SOURCE_LABELS: Record<EqSourceKey, string> = {
  default: 'All audio',
  yt: 'YouTube',
  au: 'Audius',
  jm: 'Jamendo',
}
export interface EqProfile {
  preset: EqPreset
  gains: number[]
}

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

/** Resolve the active EQ gains for a track source (falls back to the default profile). */
export function eqGainsFor(profiles: Record<EqSourceKey, EqProfile>, source?: string): number[] {
  const key: EqSourceKey = source === 'au' || source === 'jm' || source === 'yt' ? source : 'default'
  const profile = profiles[key]
  const gains = (profile ?? profiles.default)?.gains
  return gains && gains.length === 10 ? gains : EQ_PRESETS.flat
}

/** Compact labels for the 10 EQ band frequencies (matches hifi EQ_FREQUENCIES). */
export const EQ_FREQUENCIES_LABELS = ['32', '64', '125', '250', '500', '1k', '2k', '4k', '8k', '16k']

/** Karaoke lyric text sizes (Day 12) */
export const LYRICS_FONT_SIZES: Record<LyricsFontSize, { label: string; line: string; active: string }> = {
  sm: { label: 'S', line: 'text-base', active: 'text-2xl' },
  md: { label: 'M', line: 'text-lg', active: 'text-3xl' },
  lg: { label: 'L', line: 'text-xl', active: 'text-4xl' },
  xl: { label: 'XL', line: 'text-2xl', active: 'text-5xl' },
}

/** Day 17 smart-radio moods (id = /api/radio mood param) */
export const RADIO_MOODS: Array<{ id: string; label: string }> = [
  { id: 'chill', label: 'Chill' },
  { id: 'workout', label: 'Workout' },
  { id: 'romantic', label: 'Romantic' },
  { id: 'focus', label: 'Focus' },
  { id: 'party', label: 'Party' },
  { id: 'drive', label: 'Drive' },
  { id: 'sad', label: 'Sad' },
  { id: 'bangla', label: 'Bangla' },
  { id: 'punjabi', label: 'Punjabi' },
  { id: 'lofi', label: 'Lo-Fi' },
]

/** Day 17 smart-radio eras */
export const RADIO_ERAS: Array<{ id: string; label: string }> = [
  { id: '80s', label: '80s' },
  { id: '90s', label: '90s' },
  { id: '2000s', label: '2000s' },
  { id: '2010s', label: '2010s' },
  { id: 'latest', label: 'Latest' },
]

/** Two-color gradient accent (accent designer presets + future custom gradients) */
export interface AccentGradient {
  from: string
  to: string
}

/** Curated app theme: id + display info + two hex colors for preview swatches */
export interface AppThemeInfo {
  id: string
  name: string
  description: string
  /** Preview swatch: surface color */
  from: string
  /** Preview swatch: accent color */
  to: string
}

/**
 * Pro theme engine (Days 8-9). All themes are dark-tuned; CSS override blocks
 * live in globals.css under `html[data-app-theme='...']`. "midnight-rose" is
 * the default and intentionally has no CSS block (inherits :root/.dark).
 * Accents (--primary/--ring) still apply on top of any theme.
 */
export const APP_THEMES: AppThemeInfo[] = [
  { id: 'midnight-rose', name: 'Midnight Rose', description: 'Zinc black with a rose glow', from: '#09090b', to: '#f43f5e' },
  { id: 'aurora', name: 'Aurora', description: 'Deep slate teal, mint light', from: '#0f1a20', to: '#2dd4bf' },
  { id: 'sunset', name: 'Sunset', description: 'Warm maroon dusk, coral amber', from: '#1f1310', to: '#fb923c' },
  { id: 'forest', name: 'Forest', description: 'Green-black canopy, moss emerald', from: '#0d1512', to: '#34d399' },
  { id: 'neon-night', name: 'Neon Night', description: 'Violet blackout, magenta neon', from: '#130d1a', to: '#e879f9' },
  { id: 'mono-pro', name: 'Mono Pro', description: 'Pure monochrome, silver contrast', from: '#0b0b0d', to: '#d4d4d8' },
]

/** Hand-picked gradient presets for the accent designer (Day 9) */
export const ACCENT_GRADIENTS: (AccentGradient & { id: string; label: string })[] = [
  { id: 'rose-amber', label: 'Rose Amber', from: '#f43f5e', to: '#fbbf24' },
  { id: 'teal-lime', label: 'Teal Lime', from: '#2dd4bf', to: '#a3e635' },
  { id: 'violet-pink', label: 'Violet Pink', from: '#8b5cf6', to: '#ec4899' },
  { id: 'orange-red', label: 'Orange Red', from: '#fb923c', to: '#ef4444' },
  { id: 'mint-cyan', label: 'Mint Cyan', from: '#34d399', to: '#22d3ee' },
  { id: 'gold-flame', label: 'Gold Flame', from: '#f59e0b', to: '#ef4444' },
]
interface SettingsState {
  accent: AccentColor
  /** Curated theme id from APP_THEMES (applied via <html data-app-theme>) */
  appTheme: string
  /** Custom accent hex from the color picker — overrides named accent when set */
  customAccent: string | null
  /** Optional two-tone gradient on top of customAccent (from is the solid base) */
  accentGradient: AccentGradient | null
  region: string
  playbackMode: PlaybackMode
  volume: number
  autoplayRadio: boolean
  gaplessPlayback: boolean
  /** Crossfade window in seconds (0 = off). Applied to the Hi-Fi engine. */
  crossfade: number
  autoOfflineFavorites: boolean
  maxBitrate: number // 0 = no cap
  showMiniArt: boolean
  premium: boolean
  /** Day 12: karaoke-style lyrics mode (big centered active line) */
  lyricsKaraoke: boolean
  /** Day 12: lyric text size */
  lyricsFontSize: LyricsFontSize
  /** Day 18: auto-extend the queue with similar tracks before it runs dry */
  autoMix: boolean
  /** Day 23: smart downloads — keep favorites cached automatically */
  smartDownloads: boolean
  /** Day 23: only run the smart-download sweep on Wi-Fi-like connections */
  smartWifiOnly: boolean
  /** Day 23: cap on auto-cached tracks (manual downloads are never removed) */
  smartLimit: number
  /** Day 25: per-source EQ profiles (Web Audio chain in Hi-Fi engine) */
  eqProfiles: Record<EqSourceKey, EqProfile>
  /** Day 26: Now Playing visualizer style */
  visualizer: VisualizerMode
  /** Day 31: floating desktop now-playing widget with mini spectrum */
  desktopWidget: boolean
  /** Day 43: UI language — English or বাংলা (instant switch, persisted) */
  language: AppLanguage
  /** Day 48: auto-evict least-played offline tracks when storage runs low */
  storageAutoEvict: boolean
  setPremium: (v: boolean) => void
  setAccent: (a: AccentColor) => void
  setAppTheme: (id: string) => void
  setCustomAccent: (hex: string | null) => void
  setAccentGradient: (g: AccentGradient | null) => void
  setRegion: (r: string) => void
  setPlaybackMode: (m: PlaybackMode) => void
  setVolume: (v: number) => void
  setAutoplayRadio: (v: boolean) => void
  setGaplessPlayback: (v: boolean) => void
  setCrossfade: (v: number) => void
  setAutoOfflineFavorites: (v: boolean) => void
  setMaxBitrate: (v: number) => void
  setShowMiniArt: (v: boolean) => void
  setLyricsKaraoke: (v: boolean) => void
  setLyricsFontSize: (v: LyricsFontSize) => void
  setAutoMix: (v: boolean) => void
  setSmartDownloads: (v: boolean) => void
  setSmartWifiOnly: (v: boolean) => void
  setSmartLimit: (v: number) => void
  setEqProfilePreset: (source: EqSourceKey, p: Exclude<EqPreset, 'custom'>) => void
  setEqProfileGain: (source: EqSourceKey, index: number, value: number) => void
  resetEqProfile: (source: EqSourceKey) => void
  setVisualizer: (v: VisualizerMode) => void
  setDesktopWidget: (v: boolean) => void
  setLanguage: (l: AppLanguage) => void
  setStorageAutoEvict: (v: boolean) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      accent: 'rose',
      appTheme: 'midnight-rose',
      customAccent: null,
      accentGradient: null,
      region: 'IN',
      playbackMode: 'iframe',
      volume: 80,
      autoplayRadio: true,
      gaplessPlayback: true,
      crossfade: 0,
      autoOfflineFavorites: false,
      maxBitrate: 0,
      showMiniArt: true,
      premium: false,
      lyricsKaraoke: false,
      lyricsFontSize: 'md',
      autoMix: true,
      smartDownloads: false,
      smartWifiOnly: true,
      smartLimit: 20,
      eqProfiles: {
        default: { preset: 'flat', gains: EQ_PRESETS.flat },
        yt: { preset: 'flat', gains: EQ_PRESETS.flat },
        au: { preset: 'flat', gains: EQ_PRESETS.flat },
        jm: { preset: 'flat', gains: EQ_PRESETS.flat },
      },
      visualizer: 'bars',
      desktopWidget: false,
      language: 'en',
      storageAutoEvict: false,
      // Activating premium switches to the gold theme; deactivating reverts gold → rose.
      setPremium: (premium) =>
        set((s) => ({
          premium,
          accent: premium ? 'gold' : s.accent === 'gold' ? 'rose' : s.accent,
          // Gold must be visible: a pending custom accent/gradient yields to it.
          ...(premium ? { customAccent: null, accentGradient: null } : {}),
        })),
      // Picking a named accent clears any custom accent/gradient.
      setAccent: (accent) => set({ accent, customAccent: null, accentGradient: null }),
      setAppTheme: (appTheme) => set({ appTheme }),
      setCustomAccent: (customAccent) => set({ customAccent, accentGradient: null }),
      setAccentGradient: (accentGradient) =>
        set((s) => ({
          accentGradient,
          // The gradient's "from" color becomes the solid base accent.
          customAccent: accentGradient ? accentGradient.from : null,
        })),
      setRegion: (region) => set({ region }),
      setPlaybackMode: (playbackMode) => set({ playbackMode }),
      setVolume: (volume) => set({ volume: Math.max(0, Math.min(100, volume)) }),
      setAutoplayRadio: (autoplayRadio) => set({ autoplayRadio }),
      setGaplessPlayback: (gaplessPlayback) => set({ gaplessPlayback }),
      setCrossfade: (crossfade) => set({ crossfade: Math.max(0, Math.min(12, crossfade)) }),
      setAutoOfflineFavorites: (autoOfflineFavorites) => set({ autoOfflineFavorites }),
      setMaxBitrate: (maxBitrate) => set({ maxBitrate }),
      setShowMiniArt: (showMiniArt) => set({ showMiniArt }),
      setLyricsKaraoke: (lyricsKaraoke) => set({ lyricsKaraoke }),
      setLyricsFontSize: (lyricsFontSize) => set({ lyricsFontSize }),
      setAutoMix: (autoMix) => set({ autoMix }),
      setSmartDownloads: (smartDownloads) => set({ smartDownloads }),
      setSmartWifiOnly: (smartWifiOnly) => set({ smartWifiOnly }),
      setSmartLimit: (smartLimit) => set({ smartLimit: Math.max(5, Math.min(60, smartLimit)) }),
      setEqProfilePreset: (source, preset) =>
        set((s) => ({
          eqProfiles: {
            ...s.eqProfiles,
            [source]: { preset, gains: EQ_PRESETS[preset] },
          },
        })),
      setEqProfileGain: (source, index, value) =>
        set((s) => {
          const current = s.eqProfiles[source] ?? { preset: 'custom' as EqPreset, gains: EQ_PRESETS.flat }
          const gains = [...current.gains]
          gains[index] = Math.max(-12, Math.min(12, value))
          return {
            eqProfiles: { ...s.eqProfiles, [source]: { preset: 'custom', gains } },
          }
        }),
      resetEqProfile: (source) =>
        set((s) => ({
          eqProfiles: { ...s.eqProfiles, [source]: { preset: 'flat', gains: EQ_PRESETS.flat } },
        })),
      setVisualizer: (visualizer) => set({ visualizer }),
      setDesktopWidget: (desktopWidget) => set({ desktopWidget }),
      setLanguage: (language) => set({ language }),
      setStorageAutoEvict: (storageAutoEvict) => set({ storageAutoEvict }),
    }),
    {
      name: 'dhun-settings',
      version: 1,
      // v0 → v1: the old global eqPreset/eqGains become the per-source "default" profile.
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Record<string, unknown>
        if (version < 1 && !p.eqProfiles) {
          const oldPreset = (p.eqPreset as EqPreset) ?? 'flat'
          const oldGains = Array.isArray(p.eqGains) && (p.eqGains as number[]).length === 10
            ? (p.eqGains as number[])
            : EQ_PRESETS.flat
          p.eqProfiles = {
            default: { preset: oldPreset, gains: oldGains },
            yt: { preset: 'flat', gains: EQ_PRESETS.flat },
            au: { preset: 'flat', gains: EQ_PRESETS.flat },
            jm: { preset: 'flat', gains: EQ_PRESETS.flat },
          }
        }
        return p as never
      },
    }
  )
)

/** Convert a #rgb / #rrggbb hex color to HSL (h 0-360, s 0-100, l 0-100) */
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  let m = hex.trim().replace('#', '')
  if (m.length === 3) m = m.split('').map((c) => c + c).join('')
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return { h: 0, s: 0, l: 60 }
  const r = parseInt(m.slice(0, 2), 16) / 255
  const g = parseInt(m.slice(2, 4), 16) / 255
  const b = parseInt(m.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) }
}

// Re-derives custom accent shades when the .dark class flips (named accents
// handle light/dark via CSS; a custom hex needs runtime shade regeneration).
let darkModeWatcher: MutationObserver | null = null
function ensureDarkModeWatcher() {
  if (typeof document === 'undefined' || darkModeWatcher) return
  darkModeWatcher = new MutationObserver(() => {
    const st = useSettings.getState()
    if (st.customAccent || st.accentGradient) {
      applyAccent(st.accent, st.customAccent, st.accentGradient)
    }
  })
  darkModeWatcher.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
}

/**
 * Apply accent color to <html data-accent> — call on app mount and on change.
 * Named accents map to CSS blocks in globals.css. When a custom hex (or a
 * gradient from the accent designer) is active, shades are derived at runtime
 * (HSL lightness adapted per light/dark theme) and applied as inline CSS
 * variables, which win over the named-accent CSS blocks.
 */
export function applyAccent(accent: AccentColor, customAccent?: string | null, accentGradient?: AccentGradient | null) {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  ensureDarkModeWatcher()
  if (customAccent) {
    const dark = el.classList.contains('dark')
    const { h, s, l } = hexToHsl(customAccent)
    // Dark themes need a lighter accent to pop; light themes a darker one.
    const primaryL = dark ? Math.max(l, 56) : Math.min(l, 52)
    const ringL = dark ? Math.max(l, 64) : Math.min(l, 60)
    let primary = `hsl(${h} ${s}% ${primaryL}%)`
    let fgL = primaryL
    if (accentGradient) {
      // Two-tone gradient: --primary becomes the oklab midpoint; the from/to
      // endpoints are exposed for the .dhun-accent-gradient utility.
      const a = hexToHsl(accentGradient.from)
      const b = hexToHsl(accentGradient.to)
      fgL = Math.round((a.l + b.l) / 2)
      el.style.setProperty('--dhun-accent-from', accentGradient.from)
      el.style.setProperty('--dhun-accent-to', accentGradient.to)
      primary = `color-mix(in oklab, ${accentGradient.from} 55%, ${accentGradient.to})`
    } else {
      el.style.removeProperty('--dhun-accent-from')
      el.style.removeProperty('--dhun-accent-to')
    }
    const fg = (dark ? fgL > 65 : fgL > 55) ? '#18181b' : '#fafafa'
    el.style.setProperty('--primary', primary)
    el.style.setProperty('--primary-foreground', fg)
    el.style.setProperty('--ring', `hsl(${h} ${Math.min(s, 90)}% ${ringL}%)`)
    el.dataset.accent = accent
  } else {
    // Named accent: clear inline overrides so the CSS blocks apply again.
    for (const prop of ['--primary', '--primary-foreground', '--ring', '--dhun-accent-from', '--dhun-accent-to']) {
      el.style.removeProperty(prop)
    }
    el.dataset.accent = accent
  }
}
