import { NextRequest, NextResponse } from 'next/server'
import { ytRelated, ytMusicSearch, ytWebSearch } from '@/lib/ytmusic'
import { trendingTracks } from '@/lib/audius'
import { db } from '@/lib/db'
import { ensureNewTables } from '@/lib/db-bootstrap'
import { cacheGet, cacheSet } from '@/lib/piped'
import type { MusicItem } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Day 38 — Discovery feed for Explore (shown before any search is typed).
 * Three independent sections; each degrades separately and the route always
 * answers (empty sections filtered out) so the UI stays honest.
 *
 *  - related: YouTube "next" radio around the user's most recent play
 *  - loved:   anonymous community reactions (last 30 days)
 *  - fresh:   Audius trending, genre rotates daily so the feed varies
 */

const TTL = 30 * 60 * 1000

const FRESH_GENRES = ['Electronic', 'Hip-Hop/Rap', 'Pop', 'Rock', 'Lo-Fi']

function clamp(items: MusicItem[]): MusicItem[] {
  return items
    .filter((it) => it.id && (it.duration === 0 || (it.duration >= 60 && it.duration <= 900)))
    .slice(0, 18)
}

export async function GET(req: NextRequest) {
  const seed = (req.nextUrl.searchParams.get('seed') ?? '').slice(0, 64)
  const artist = (req.nextUrl.searchParams.get('artist') ?? '').slice(0, 120)

  const cacheKey = `discover:${seed || 'noseed'}:${artist}`
  const cached = cacheGet<Record<string, unknown>>(cacheKey)
  if (cached) return NextResponse.json(cached)

  /* Section 1 — related radio around the last played track */
  let related: { title: string; items: MusicItem[] } | null = null
  if (seed) {
    try {
      const items = clamp(await ytRelated(seed))
      if (items.length > 0) {
        related = { title: `Because you played ${artist || 'recently'}`, items }
      }
    } catch {
      /* related is optional */
    }
  }

  /* Section 2 — community loves (anonymous aggregate) */
  let loved: { title: string; items: MusicItem[] } | null = null
  try {
    if (await ensureNewTables()) {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const rows = await db.reaction.groupBy({
        by: ['trackId', 'source', 'title', 'artist', 'artwork'],
        where: { createdAt: { gte: since }, title: { not: '' } },
        _count: { _all: true },
        orderBy: { _count: { trackId: 'desc' } },
        take: 18,
      })
      const items: MusicItem[] = rows.map((r) => ({
        id: r.trackId,
        title: r.title,
        artist: r.artist,
        artwork: r.artwork || '',
        duration: 0,
        source: (r.source === 'au' ? 'au' : 'yt') as MusicItem['source'],
      }))
      if (items.length > 0) {
        loved = { title: 'Loved by the community', items }
      }
    }
  } catch {
    /* reactions are optional */
  }

  /* Section 3 — fresh Audius finds, genre rotates by day-of-week */
  let fresh: { title: string; items: MusicItem[] } | null = null
  try {
    const genre = FRESH_GENRES[new Date().getUTCDay() % FRESH_GENRES.length]
    const items = await trendingTracks(18, genre)
    if (items.length > 0) {
      fresh = { title: `Fresh finds on Audius — ${genre.toLowerCase()}`, items }
    }
  } catch {
    /* audius is optional */
  }

  /* Fallback discovery seed when nothing is known about the user */
  if (!related && !loved) {
    try {
      const items = clamp(
        (await ytMusicSearch('popular songs this week').catch(() => [])) ||
          (await ytWebSearch('popular songs this week').then((r) => r.items).catch(() => []))
      )
      if (items.length > 0) {
        related = { title: 'Popular this week', items }
      }
    } catch {
      /* nothing worked — the feed stays empty and the UI says so */
    }
  }

  const out = { related, loved, fresh }
  cacheSet(cacheKey, out, TTL)
  return NextResponse.json(out)
}
