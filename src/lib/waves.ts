/**
 * Day 36 — Dhun "Waves": curated editorial sections.
 * Single source of truth shared by /api/waves (track resolution) and the
 * WavesStrip UI (meta cards). All catalogs are free YouTube Music searches.
 */

export interface WaveMeta {
  id: string
  title: string
  tagline: string
  /** Tailwind gradient stops for the editorial card */
  gradient: string
  /** Lucide icon name hint (kept as string so this file stays server-safe) */
  icon: 'waves' | 'film' | 'drum' | 'globe'
}

export interface WaveTrackResponse extends WaveMeta {
  items: import('@/lib/types').MusicItem[]
}

export const WAVES: WaveMeta[] = [
  {
    id: 'bangla',
    title: 'Bangla Horizon',
    tagline: 'Dhaka nights to diaspora mornings — Bangla gems',
    gradient: 'from-emerald-600 via-emerald-500 to-lime-400',
    icon: 'waves',
  },
  {
    id: 'bollywood',
    title: 'Bollywood Beats',
    tagline: 'Masala for your ears — dance, romance, classics',
    gradient: 'from-rose-600 via-rose-500 to-orange-400',
    icon: 'film',
  },
  {
    id: 'punjabi',
    title: 'Punjab Pulse',
    tagline: 'Bhangra energy and desi hip-hop, all day',
    gradient: 'from-amber-500 via-orange-500 to-rose-500',
    icon: 'drum',
  },
  {
    id: 'global',
    title: 'Global Currents',
    tagline: 'What the planet is playing right now',
    gradient: 'from-fuchsia-600 via-fuchsia-500 to-rose-400',
    icon: 'globe',
  },
]

/** Three curated queries per wave — merged and de-duplicated server-side. */
export const WAVE_QUERIES: Record<string, string[]> = {
  bangla: ['bangla new hit song', 'bangla romantic best songs', 'bangla folk popular song'],
  bollywood: ['bollywood new hits', 'bollywood dance hits', 'bollywood evergreen classics'],
  punjabi: ['punjabi top songs new', 'desi hip hop hits', 'punjabi romantic songs'],
  global: ['top songs worldwide this week', 'viral songs right now', 'pop hits this week'],
}
