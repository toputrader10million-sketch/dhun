import { NextRequest, NextResponse } from 'next/server'
import { cleanTitle, cacheGet, cacheSet } from '@/lib/piped'
import type { LyricsResponse } from '@/lib/types'

export const runtime = 'nodejs'

const TTL = 60 * 60 * 1000
const LRCLIB = 'https://lrclib.net/api'

interface LrcLibTrack {
  trackName?: string
  artistName?: string
  duration?: number
  plainLyrics?: string | null
  syncedLyrics?: string | null
  instrumental?: boolean
}

async function lrcFetch(path: string, timeoutMs = 8000): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${LRCLIB}${path}`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
      cache: 'no-store',
      redirect: 'follow',
    })
    if (!res.ok) throw new Error(`LRCLIB HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

function pickBest(candidates: LrcLibTrack[], duration?: number): LrcLibTrack | null {
  const valid = candidates.filter(
    (c) => (c.syncedLyrics && c.syncedLyrics.trim()) || (c.plainLyrics && c.plainLyrics.trim())
  )
  if (valid.length === 0) return null
  const scored = valid.map((c) => {
    let score = 0
    if (c.syncedLyrics && c.syncedLyrics.trim()) score += 10
    if (typeof duration === 'number' && duration > 0 && typeof c.duration === 'number') {
      const diff = Math.abs(c.duration - duration)
      if (diff <= 5) score += 10
      else if (diff <= 15) score += 3
      else score -= 5
    }
    return { c, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored[0].c
}

export async function GET(req: NextRequest) {
  const title = (req.nextUrl.searchParams.get('title') ?? '').trim()
  const artist = (req.nextUrl.searchParams.get('artist') ?? '').trim()
  const durationParam = parseFloat(req.nextUrl.searchParams.get('duration') ?? '')
  const duration = Number.isFinite(durationParam) && durationParam > 0 ? Math.round(durationParam) : undefined

  if (!title) {
    return NextResponse.json({ error: 'Missing "title" parameter' }, { status: 400 })
  }

  const cacheKey = `lyrics:${title.toLowerCase()}|${artist.toLowerCase()}|${duration ?? ''}`
  const cached = cacheGet<LyricsResponse>(cacheKey)
  if (cached) return NextResponse.json(cached)

  const clean = cleanTitle(title)
  let best: LrcLibTrack | null = null

  // 1) exact get — without duration first, then with duration
  try {
    const getPath =
      `/get?track_name=${encodeURIComponent(clean)}&artist_name=${encodeURIComponent(artist || clean)}` +
      (duration ? `&duration=${duration}` : '')
    const data = (await lrcFetch(getPath)) as LrcLibTrack | Record<string, never>
    if (data && typeof data === 'object' && 'trackName' in data) best = data as LrcLibTrack
  } catch {
    /* fall through */
  }

  // 2) search fallback
  if (!best) {
    try {
      const data = (await lrcFetch(
        `/search?q=${encodeURIComponent(`${clean} ${artist}`.trim())}`
      )) as LrcLibTrack[]
      if (Array.isArray(data)) best = pickBest(data, duration)
    } catch {
      /* fall through */
    }
  }

  if (!best) {
    const out: LyricsResponse = { source: 'none' }
    cacheSet(cacheKey, out, TTL)
    return NextResponse.json(out)
  }

  const out: LyricsResponse = {
    synced: best.syncedLyrics?.trim() || undefined,
    plain: best.plainLyrics?.trim() || undefined,
    source: 'lrclib',
  }
  cacheSet(cacheKey, out, TTL)
  return NextResponse.json(out)
}
