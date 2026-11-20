'use client'
/* Dhun — Premium tier design (Day 51) + feature-flag system (Day 52).
 *
 * THE TIER CONTRACT (Day 51 design):
 *   Everything that makes Dhun a music player stays FREE, forever:
 *   playback (YouTube embed + Hi-Fi direct streams), search, charts,
 *   library/favorites/playlists, lyrics, offline downloads, cloud sync,
 *   sleep timer, karaoke, cast, PWA, Bangla UI. No paywall ever touches it.
 *
 *   Dhun Pro is the comfort layer, free-for-now (no payment exists):
 *     • Theme engine extras   — curated themes beyond the two free ones
 *     • AI DJ                 — Daily Mix + AI playlist builder
 *     • EQ Pro                — per-source EQ profiles + custom band gains
 *     • Visualizer Pro        — Wave + Ring modes (Bars stays free)
 *     • Cloud extras          — public playlist share-links
 *
 * Every gated control opens the honest upsell sheet (pro-sheet.tsx) where
 * Pro can be activated instantly, free, or earned via loyalty/feedback
 * codes (Day 53). The flag system below is the single source of truth —
 * no component may hard-code `settings.premium` checks.
 */
import { useSettings } from '@/store/settings'

/** Stable ids for every Pro-gated capability. */
export type ProFeatureId =
  | 'theme-engine'
  | 'ai-dj'
  | 'ai-playlist'
  | 'eq-pro'
  | 'visualizer-pro'
  | 'cloud-share'
  | 'accent-designer'

export interface ProFeature {
  id: ProFeatureId
  name: string
  blurb: string
  /** Where in the app this lives (shown in the upsell sheet + Pro panel). */
  location: string
}

/** The Pro catalog — shown in the upsell sheet, Pro panel and About page. */
export const PRO_FEATURES: ProFeature[] = [
  {
    id: 'theme-engine',
    name: 'Theme engine',
    blurb: 'Aurora, Sunset, Forest, Neon Night + Imperial Gold — curated dark-tuned looks.',
    location: 'Settings → Themes',
  },
  {
    id: 'ai-dj',
    name: 'AI DJ · Daily Mix',
    blurb: 'A personal 28-track mix composed from your history + favorites, refreshed hourly.',
    location: 'Home → Made for you',
  },
  {
    id: 'ai-playlist',
    name: 'AI playlist builder',
    blurb: 'Describe a vibe in Bangla or English — get a playable 25-track playlist.',
    location: 'Library → AI playlist',
  },
  {
    id: 'eq-pro',
    name: 'EQ Pro',
    blurb: 'Per-source equalizer (YouTube / Audius / Jamendo) with custom band gains.',
    location: 'Settings → Equalizer',
  },
  {
    id: 'visualizer-pro',
    name: 'Visualizer Pro',
    blurb: 'Wave and Ring audio-reactive art (Bars stays free for everyone).',
    location: 'Settings → Playback',
  },
  {
    id: 'cloud-share',
    name: 'Public share-links',
    blurb: 'Publish any playlist with a read-only link + view counter.',
    location: 'Library → playlist ⋮ menu',
  },
  {
    id: 'accent-designer',
    name: 'Accent designer',
    blurb: 'Custom hex accents + two-tone gradients across the whole UI.',
    location: 'Settings → Accent color',
  },
]

/**
 * Feature flags (Day 52). Gates ship dark by default and can be flipped
 * without touching UI code — e.g. giving everyone a feature for a promo
 * weekend, or removing a gate. `true` = gated behind Pro.
 */
export const PRO_FLAGS: Record<ProFeatureId, boolean> = {
  'theme-engine': true,
  'ai-dj': true,
  'ai-playlist': true,
  'eq-pro': true,
  'visualizer-pro': true,
  'cloud-share': true,
  'accent-designer': true,
}

/** Is a capability currently gated behind Pro? */
export function isGated(id: ProFeatureId): boolean {
  return PRO_FLAGS[id]
}

/** Reactive Pro state — re-renders the caller when premium flips. */
export function usePro() {
  const premium = useSettings((s) => s.premium)
  return { pro: premium, gated: isGated }
}

/** Non-reactive check for imperative code (event handlers outside React). */
export function isProUnlocked(): boolean {
  return useSettings.getState().premium
}
