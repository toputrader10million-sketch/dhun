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

/* Day 39 — Bengali-script detection for special Bangla handling */
const BENGALI_RE = /[\u0980-\u09FF]/
const hasBengali = (s: string) => BENGALI_RE.test(s)

/** Strip YouTube junk words that break lyrics matching (incl. Bangla variants) */
function deepClean(s: string): string {
  return s
    .replace(/\(([^)]*(official|video|audio|lyric|lyrics|full song|hq|hd|4k)[^)]*)\)/gi, '')
    .replace(/\[[^\]]*(official|video|audio|lyric|lyrics|full song|hq|hd|4k)[^\]]*\]/gi, '')
    .replace(/\b(official|music)?\s*(video|audio|lyric[s]?|full song|song)\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
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

/* Day 39 — ChartLyrics free fallback (plain text, no key needed).
 * Old ASMX endpoint; XML parsed minimally and fully degrading. */
async function chartLyricsLookup(artist: string, song: string, timeoutMs = 7000): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const url =
      `https://api.chartlyrics.com/apiv1.asmx/SearchLyricDirect` +
      `?artist=${encodeURIComponent(artist)}&song=${encodeURIComponent(song)}`
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' })
    if (!res.ok) return null
    const xml = await res.text()
    const lyric = /<Lyric>([\s\S]*?)<\/Lyric>/i.exec(xml)?.[1]?.trim()
    if (!lyric || lyric.length < 40 || /not found/i.test(lyric.slice(0, 40))) return null
    return lyric
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
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
  const deep = deepClean(clean) || clean
  const bangla = hasBengali(clean) || hasBengali(artist)
  let best: LrcLibTrack | null = null

  // 1) exact get — cleaned title + artist (with duration when known)
  try {
    const getPath =
      `/get?track_name=${encodeURIComponent(deep)}&artist_name=${encodeURIComponent(artist || deep)}` +
      (duration ? `&duration=${duration}` : '')
    const data = (await lrcFetch(getPath)) as LrcLibTrack | Record<string, never>
    if (data && typeof data === 'object' && 'trackName' in data) best = data as LrcLibTrack
  } catch {
    /* fall through */
  }

  // 2) parametric search (track_name/artist_name beat free-text q)
  if (!best) {
    try {
      const data = (await lrcFetch(
        `/search?track_name=${encodeURIComponent(deep)}&artist_name=${encodeURIComponent(artist || deep)}`
      )) as LrcLibTrack[]
      if (Array.isArray(data)) best = pickBest(data, duration)
    } catch {
      /* fall through */
    }
  }

  // 3) free-text search "title artist"
  if (!best) {
    try {
      const data = (await lrcFetch(
        `/search?q=${encodeURIComponent(`${deep} ${artist}`.trim())}`
      )) as LrcLibTrack[]
      if (Array.isArray(data)) best = pickBest(data, duration)
    } catch {
      /* fall through */
    }
  }

  // 4) title-only search — Bangla tracks are frequently indexed under a
  //    different artist spelling; dropping the artist often finds them.
  if (!best) {
    try {
      const data = (await lrcFetch(`/search?q=${encodeURIComponent(deep)}`)) as LrcLibTrack[]
      if (Array.isArray(data)) best = pickBest(data, duration)
    } catch {
      /* fall through */
    }
  }

  // 5) Bangla care: strip the parentheticals entirely and try again, plus a
  //    shortened title prefix (e.g. "আমার ভিন্ন রঙের ..." uploads get long).
  if (!best && bangla) {
    const short = deep.split(/[–—:|,]/)[0].trim()
    if (short && short !== deep) {
      try {
        const data = (await lrcFetch(`/search?q=${encodeURIComponent(short)}`)) as LrcLibTrack[]
        if (Array.isArray(data)) best = pickBest(data, duration)
      } catch {
        /* fall through */
      }
    }
    if (!best) {
      // Also try the raw (uncleaned) title — some uploads index the junk itself
      try {
        const data = (await lrcFetch(`/search?q=${encodeURIComponent(title)}`)) as LrcLibTrack[]
        if (Array.isArray(data)) best = pickBest(data, duration)
      } catch {
        /* fall through */
      }
    }
  }

  if (best) {
    const out: LyricsResponse = {
      synced: best.syncedLyrics?.trim() || undefined,
      plain: best.plainLyrics?.trim() || undefined,
      source: 'lrclib',
    }
    cacheSet(cacheKey, out, TTL)
    return NextResponse.json(out)
  }

  // 6) second source — ChartLyrics plain-text fallback (free, keyless)
  if (artist) {
    const plain = await chartLyricsLookup(artist, deep)
    if (plain) {
      const out: LyricsResponse = { plain, source: 'chartlyrics' }
      cacheSet(cacheKey, out, TTL)
      return NextResponse.json(out)
    }
  }

  const out: LyricsResponse = { source: 'none' }
  cacheSet(cacheKey, out, TTL)
  return NextResponse.json(out)
}
