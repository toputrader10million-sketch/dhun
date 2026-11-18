'use client'
/* Dhun — Smart Match (YouTube download repair, Days 2-10 batch).
 *
 * 2025 reality: YouTube blocks direct audio extraction from server IPs, and
 * public Piped instances return no streams. When a YouTube-track download
 * fails, Smart Match finds the SAME song on free, legal sources and caches
 * that audio under the original track id — the user's library/offline flow
 * keeps working with the metadata they know.
 *
 * Sources (in preference order for ties):
 *   1. Jamendo (CC-licensed, full-track legal download) — when the user added
 *      their free BYO key (src/store/keys.ts)
 *   2. Audius (independent artists, free API)
 *
 * Confidence: normalized token-overlap on title (must pass) plus artist
 * overlap (or a very strong title). Duration must be plausible.
 */
import { useKeys } from '@/store/keys'

export interface SmartMatch {
  via: 'audius' | 'jamendo'
  trackId: string
  url: string // same-origin proxy URL the SW can cache
  title: string
  artist: string
}

interface Candidate {
  via: 'audius' | 'jamendo'
  trackId: string
  url: string
  title: string
  artist: string
  duration: number
  score: number
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\((?:[^()]*(?:official|video|audio|lyric|lyrics|hd|hq|mv|visualizer|remix|full)[^()]*)\)/gi, '')
    .replace(/\[[^\[\]]*\]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenOverlap(a: string, b: string): number {
  const at = normalize(a).split(' ').filter(Boolean)
  const bt = new Set(normalize(b).split(' ').filter(Boolean))
  if (at.length === 0 || bt.size === 0) return 0
  let hit = 0
  for (const t of new Set(at)) if (bt.has(t)) hit++
  return hit / Math.max(new Set(at).size, bt.size)
}

function plausibleDuration(a: number | undefined, b: number | undefined): boolean {
  if (!a || !b) return true // unknown durations don't disqualify
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  return hi === 0 || hi / lo <= 1.8
}

async function searchAudius(q: string): Promise<{ id: string; title: string; artist: string; duration: number }[]> {
  try {
    const res = await fetch(`/api/audius/search?q=${encodeURIComponent(q)}`, { cache: 'no-store' })
    if (!res.ok) return []
    const data = (await res.json()) as { items?: { id: string; title: string; artist: string; duration?: number }[] }
    return (data.items ?? []).map((it) => ({ id: it.id, title: it.title, artist: it.artist, duration: it.duration ?? 0 }))
  } catch {
    return []
  }
}

async function searchJamendo(q: string, key: string): Promise<{ id: string; title: string; artist: string; duration: number }[]> {
  if (!key) return []
  try {
    const res = await fetch(`/api/jamendo/search?q=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`, {
      cache: 'no-store',
    })
    if (!res.ok) return []
    const data = (await res.json()) as { items?: { id: string; title: string; artist: string; duration?: number }[] }
    return (data.items ?? []).map((it) => ({ id: it.id, title: it.title, artist: it.artist, duration: it.duration ?? 0 }))
  } catch {
    return []
  }
}
/**
 * Find a confident alternative version of `title` by `artist`.
 * Returns null when nothing clears the confidence bar (honest failure).
 */
export async function findSmartMatch(
  title: string,
  artist: string,
  duration?: number
): Promise<SmartMatch | null> {
  const key = useKeys.getState().jamendoKey
  const normTitle = normalize(title)
  const queryFull = `${normalize(artist)} ${normTitle}`.trim() || normTitle
  if (!queryFull) return null

  // Search with BOTH the artist-qualified query and the bare title — the
  // qualified query surfaces same-artist covers, the bare title surfaces
  // same-name tracks by other artists (the confidence gate decides).
  const [audiusA, audiusB, jamendoA, jamendoB] = await Promise.all([
    searchAudius(queryFull),
    normTitle !== queryFull ? searchAudius(normTitle) : Promise.resolve([]),
    searchJamendo(queryFull, key),
    normTitle !== queryFull ? searchJamendo(normTitle, key) : Promise.resolve([]),
  ])
  const audiusRows = [...audiusA, ...audiusB]
  const jamendoRows = [...jamendoA, ...jamendoB]

  const candidates: Candidate[] = []
  for (const via of ['jamendo', 'audius'] as const) {
    const rows = via === 'jamendo' ? jamendoRows : audiusRows
    for (const row of rows) {
      // Dead-source guard: Audius exposes streamability — skip known-dead tracks.
      if (row.streamable === false) continue
      const tSim = tokenOverlap(title, row.title)
      const aSim = tokenOverlap(artist, row.artist)
      if (!plausibleDuration(duration, row.duration)) continue
      // Confidence gate: title must clearly match; artist seals it or the
      // title must be a near-exact hit.
      if (tSim < 0.5) continue
      if (aSim < 0.3 && tSim < 0.8) continue
      const score = tSim * 2 + aSim + (via === 'jamendo' ? 0.15 : 0) // slight legal-download preference
      candidates.push({
        via,
        trackId: row.id,
        url:
          via === 'jamendo'
            ? `/api/jamendo/stream/${row.id}?key=${encodeURIComponent(key)}&download=1`
            : `/api/audius/stream/${row.id}`,
        title: row.title,
        artist: row.artist,
        duration: row.duration,
        score,
      })
    }
  }

  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.score - a.score)
  const best = candidates[0]
  return { via: best.via, trackId: best.trackId, url: best.url, title: best.title, artist: best.artist }
}

/**
 * Ranked alternative sources (best first) — the download flow walks this list
 * with a retry chain so one dead track doesn't kill the whole attempt.
 */
export async function findSmartMatches(
  title: string,
  artist: string,
  duration?: number,
  max = 4
): Promise<SmartMatch[]> {
  const key = useKeys.getState().jamendoKey
  const normTitle = normalize(title)
  const queryFull = `${normalize(artist)} ${normTitle}`.trim() || normTitle
  if (!queryFull) return []

  const [audiusA, audiusB, jamendoA, jamendoB] = await Promise.all([
    searchAudius(queryFull),
    normTitle !== queryFull ? searchAudius(normTitle) : Promise.resolve([]),
    searchJamendo(queryFull, key),
    normTitle !== queryFull ? searchJamendo(normTitle, key) : Promise.resolve([]),
  ])
  const audiusRows = [...audiusA, ...audiusB]
  const jamendoRows = [...jamendoA, ...jamendoB]

  const candidates: Candidate[] = []
  for (const via of ['jamendo', 'audius'] as const) {
    const rows = via === 'jamendo' ? jamendoRows : audiusRows
    for (const row of rows) {
      if (row.streamable === false) continue
      const tSim = tokenOverlap(title, row.title)
      const aSim = tokenOverlap(artist, row.artist)
      if (!plausibleDuration(duration, row.duration)) continue
      if (tSim < 0.5) continue
      if (aSim < 0.3 && tSim < 0.8) continue
      const score = tSim * 2 + aSim + (via === 'jamendo' ? 0.15 : 0)
      candidates.push({
        via,
        trackId: row.id,
        url:
          via === 'jamendo'
            ? `/api/jamendo/stream/${row.id}?key=${encodeURIComponent(key)}&download=1`
            : `/api/audius/stream/${row.id}`,
        title: row.title,
        artist: row.artist,
        duration: row.duration,
        score,
      })
    }
  }
  candidates.sort((a, b) => b.score - a.score)
  // Dedupe by trackId+via (bare-title and qualified queries can overlap)
  const seen = new Set<string>()
  const ranked: SmartMatch[] = []
  for (const c of candidates) {
    const k = `${c.via}:${c.trackId}`
    if (seen.has(k)) continue
    seen.add(k)
    ranked.push({ via: c.via, trackId: c.trackId, url: c.url, title: c.title, artist: c.artist })
    if (ranked.length >= max) break
  }
  return ranked
}
