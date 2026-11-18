// Audius discovery layer — server-only. Mirrors piped.ts patterns
// (in-memory cache via cacheGet/cacheSet, timeouts, graceful errors).
import { cacheGet, cacheSet } from '@/lib/piped'
import type { MusicItem } from '@/lib/types'

export const AUDIUS_APP_NAME = 'Dhun'

const FALLBACK_HOSTS = [
  'https://audius-discovery-1.altego.net',
  'https://discoveryprovider.audius.co',
]

const HOST_TTL_MS = 10 * 60 * 1000 // 10 min
const TRACK_TTL_MS = 7 * 60 * 1000 // 7 min (between 5 and 10)
const FETCH_TIMEOUT_MS = 6000

// ---------- host discovery ----------
async function discoverHost(): Promise<string> {
  const cached = cacheGet<string>('audius:host')
  if (cached) return cached

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch('https://api.audius.co', {
      signal: controller.signal,
      headers: { accept: 'application/json' },
      cache: 'no-store',
    })
    if (res.ok) {
      const data = (await res.json()) as { data?: string[] }
      const hosts = Array.isArray(data.data) ? data.data.filter((h) => typeof h === 'string' && h) : []
      if (hosts.length > 0) {
        const host = hosts[Math.floor(Math.random() * hosts.length)]
        cacheSet('audius:host', host, HOST_TTL_MS)
        return host
      }
    }
  } catch {
    /* fall through to fallback hosts */
  } finally {
    clearTimeout(timer)
  }
  // not cached → retried on next call
  return FALLBACK_HOSTS[Math.floor(Math.random() * FALLBACK_HOSTS.length)]
}

// ---------- mapping ----------
function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}
}

function mapTrack(t: Record<string, unknown>): MusicItem | null {
  const id = typeof t.id === 'string' ? t.id : ''
  if (!id) return null
  const user = asRecord(t.user)
  const artwork = asRecord(t.artwork)
  const art480 = typeof artwork['480x480'] === 'string' ? (artwork['480x480'] as string) : ''
  const art150 = typeof artwork['150x150'] === 'string' ? (artwork['150x150'] as string) : ''
  return {
    id,
    title: typeof t.title === 'string' && t.title ? t.title : 'Unknown',
    artist:
      (typeof user.name === 'string' && user.name) ||
      (typeof user.handle === 'string' && user.handle) ||
      'Unknown artist',
    artwork: art480 || art150,
    duration: typeof t.duration === 'number' && Number.isFinite(t.duration) ? t.duration : 0,
    views: typeof t.play_count === 'number' ? t.play_count : undefined,
    source: 'au',
    genre: typeof t.genre === 'string' && t.genre ? t.genre : undefined,
    streamable: typeof t.is_streamable === 'boolean' ? t.is_streamable : undefined,
  }
}

async function fetchTracks(path: string, cacheKey: string): Promise<MusicItem[]> {
  const cached = cacheGet<MusicItem[]>(cacheKey)
  if (cached) return cached

  const host = await discoverHost()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(`${host}${path}`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`Audius HTTP ${res.status} for ${path}`)
    const data = (await res.json()) as { data?: Record<string, unknown>[] }
    const items = (Array.isArray(data.data) ? data.data : [])
      .map(mapTrack)
      .filter((it): it is MusicItem => it !== null)
    cacheSet(cacheKey, items, TRACK_TTL_MS)
    return items
  } finally {
    clearTimeout(timer)
  }
}

// ---------- public API ----------
export async function searchTracks(q: string, limit = 24): Promise<MusicItem[]> {
  return fetchTracks(
    `/v1/tracks/search?query=${encodeURIComponent(q)}&app_name=${AUDIUS_APP_NAME}&limit=${limit}`,
    `audius:search:${q}:${limit}`
  )
}

export async function trendingTracks(limit = 24, genre?: string): Promise<MusicItem[]> {
  const genreParam = genre ? `&genre=${encodeURIComponent(genre)}` : ''
  return fetchTracks(
    `/v1/tracks/trending?app_name=${AUDIUS_APP_NAME}&limit=${limit}${genreParam}`,
    `audius:trending:${genre ?? 'all'}:${limit}`
  )
}

/** Resolve the CDN mp3 URL for a track (follows the discovery-node redirect). */
export async function resolveAudiusStreamUrl(trackId: string): Promise<string> {
  const host = await discoverHost()
  const url = `${host}/v1/tracks/${encodeURIComponent(trackId)}/stream?app_name=${AUDIUS_APP_NAME}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { redirect: 'manual', cache: 'no-store' })
    const location = res.headers.get('location')
    if (location) return location
    // some discovery nodes stream the audio directly — hand the URL over as-is
    return url
  } finally {
    clearTimeout(timer)
  }
}
