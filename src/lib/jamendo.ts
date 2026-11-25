// Jamendo discovery layer — server-only helpers (mirrors audius.ts patterns).
// Jamendo serves 500,000+ Creative-Commons full-length tracks; with the user's
// free client id (BYO key from src/store/keys.ts) every track is legally
// streamable AND downloadable (audiodownload field) — the guaranteed offline
// source YouTube can never offer.
import { type MusicItem } from '@/lib/types'
import { withBreaker } from '@/lib/circuit-breaker'

const API_BASE = 'https://api.jamendo.com/v3.0'
const FETCH_TIMEOUT_MS = 8000

export interface JamendoTrack {
  id: string
  name: string
  artist_name?: string
  album_name?: string
  album_image?: string
  image?: string
  audio?: string
  audiodownload?: string
  audiodownload_allowed?: boolean
  duration?: number
}

interface JamendoResponse {
  headers: { status: string; code: number; error_message?: string }
  results: JamendoTrack[]
}

function mapTrack(t: JamendoTrack): MusicItem {
  return {
    id: String(t.id),
    title: t.name || 'Unknown',
    artist: t.artist_name || 'Unknown artist',
    artwork: t.album_image || t.image || '',
    duration: typeof t.duration === 'number' ? t.duration : 0,
    album: t.album_name || undefined,
    source: 'jm',
  }
}

/** Call the Jamendo API with the user's BYO key. Throws on invalid key / network. */
export async function jamendoFetch(
  path: string,
  params: Record<string, string>,
  clientKey: string
): Promise<JamendoTrack[]> {
  if (!clientKey) throw new Error('jamendo-key-required')
  const qs = new URLSearchParams({
    client_id: clientKey,
    format: 'json',
    ...params,
  })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    // Q1.3 — only the network round-trip sits behind the "jamendo" breaker;
    // key errors (client misconfig) are parsed OUTSIDE so they never trip it.
    const res = await withBreaker('jamendo', async () => {
      const r = await fetch(`${API_BASE}${path}?${qs.toString()}`, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
        cache: 'no-store',
      })
      if (!r.ok) throw new Error(`Jamendo HTTP ${r.status}`)
      return (await r.json()) as JamendoResponse
    })
    if (res.headers?.status === 'failed') {
      const msg = res.headers.error_message || 'Jamendo request failed'
      throw new Error(res.headers.code === 5 ? 'jamendo-key-invalid' : msg)
    }
    return Array.isArray(res.results) ? res.results : []
  } finally {
    clearTimeout(timer)
  }
}

export async function jamendoSearch(q: string, limit = 24, clientKey: string): Promise<MusicItem[]> {
  const rows = await jamendoFetch(
    '/tracks/',
    { search: q, limit: String(limit), include: 'musicinfo+licenses' },
    clientKey
  )
  return rows.map(mapTrack)
}

/** Resolve the direct audio (or legal download) URL for a Jamendo track id. */
export async function resolveJamendoStreamUrl(
  trackId: string,
  clientKey: string,
  preferDownload = false
): Promise<{ url: string; downloadAllowed: boolean }> {
  const rows = await jamendoFetch(
    '/tracks/',
    { id: trackId, limit: '1' },
    clientKey
  )
  const t = rows[0]
  if (!t) throw new Error('jamendo-track-not-found')
  if (preferDownload && t.audiodownload_allowed && t.audiodownload) {
    return { url: t.audiodownload, downloadAllowed: true }
  }
  if (t.audio) return { url: t.audio, downloadAllowed: !!t.audiodownload_allowed }
  throw new Error('jamendo-no-audio')
}
