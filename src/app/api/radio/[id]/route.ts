import { NextRequest, NextResponse } from 'next/server'
import { fetchPiped, parseStreamItem, cleanTitle, cacheGet, cacheSet } from '@/lib/piped'
import { ytRelated, ytMusicSearch } from '@/lib/ytmusic'
import type { MusicItem } from '@/lib/types'

export const runtime = 'nodejs'

const TTL = 15 * 60 * 1000
const YT_VIDEO_ID_RE = /^[\w-]{11}$/

/* Day 17 — smart radio: mood/era-based queries on top of seed-track affinity. */
const MOOD_QUERIES: Record<string, string> = {
  chill: 'chill relaxing songs mix',
  workout: 'workout energy gym songs',
  romantic: 'romantic love songs',
  focus: 'focus study instrumental music',
  party: 'party dance hits',
  sad: 'sad emotional songs',
  drive: 'road trip driving songs',
  bangla: 'bangla best songs',
  punjabi: 'punjabi hit songs',
  lofi: 'lofi chill beats',
}

const ERA_QUERIES: Record<string, string> = {
  '80s': '80s classic hits songs',
  '90s': '90s hits songs',
  '2000s': '2000s hit songs',
  '2010s': '2010s biggest hits',
  latest: 'new hits this week',
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const title = (req.nextUrl.searchParams.get('title') ?? '').trim()
  const artist = (req.nextUrl.searchParams.get('artist') ?? '').trim()
  const mood = (req.nextUrl.searchParams.get('mood') ?? '').toLowerCase()
  const era = (req.nextUrl.searchParams.get('era') ?? '').toLowerCase()

  if (!id && !title) {
    return NextResponse.json({ error: 'Missing id or title' }, { status: 400 })
  }

  const query = artist ? `${artist} songs` : cleanTitle(title || id)
  const cacheKey = `radio:${id}:${query.toLowerCase()}:${mood}:${era}`
  const cached = cacheGet<{ items: MusicItem[] }>(cacheKey)
  if (cached) return NextResponse.json(cached)

  let items: MusicItem[] = []

  // Smart mode: mood/era queries drive the queue (seed affinity is secondary)
  if (mood || era) {
    const qParts: string[] = []
    if (era && ERA_QUERIES[era]) qParts.push(ERA_QUERIES[era])
    if (mood && MOOD_QUERIES[mood]) qParts.push(MOOD_QUERIES[mood])
    if (qParts.length === 0) qParts.push(mood || era) // pass-through for unknown tags
    const smartQuery = qParts.join(' ')
    try {
      items = (await ytMusicSearch(smartQuery)).filter((it) => it.id && it.id !== id).slice(0, 15)
    } catch {
      /* fall through */
    }
    // Blend with the seed's own vibe for a better start
    if (items.length > 0 && YT_VIDEO_ID_RE.test(id)) {
      try {
        const related = await ytRelated(id)
        const blend = related.filter((it) => it.id !== id).slice(0, 6)
        items = [...items.slice(0, 9), ...blend, ...items.slice(9)]
      } catch {
        /* seed blend optional */
      }
    }
    if (items.length > 0) {
      const out = { items: items.slice(0, 18), mood, era }
      cacheSet(cacheKey, out, TTL)
      return NextResponse.json(out)
    }
  }

  // Primary 1: InnerTube /next — true "related videos" radio when we have a video id
  if (YT_VIDEO_ID_RE.test(id) && items.length === 0) {
    try {
      const related = await ytRelated(id)
      if (related.length > 0) {
        items = related.filter((it) => it.id !== id).slice(0, 15)
      }
    } catch {
      /* fall through */
    }
  }

  // Primary 2: InnerTube music search by artist/title
  if (items.length === 0) {
    try {
      items = (await ytMusicSearch(query)).filter((it) => it.id !== id).slice(0, 15)
    } catch {
      /* fall through */
    }
  }

  // Fallback: legacy Piped search
  if (items.length === 0) {
    try {
      const data = await fetchPiped<{ items?: Array<Record<string, unknown>> }>(
        `/search?q=${encodeURIComponent(query)}&filter=music_songs`
      )
      items = (data.items ?? [])
        .map(parseStreamItem)
        .filter((it) => it.id && it.id !== id)
        .slice(0, 15)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Radio search failed'
      return NextResponse.json({ error: message, items: [] }, { status: 502 })
    }
  }

  const out = { items }
  cacheSet(cacheKey, out, TTL)
  return NextResponse.json(out)
}
