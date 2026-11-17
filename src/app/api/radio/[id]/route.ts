import { NextRequest, NextResponse } from 'next/server'
import { fetchPiped, parseStreamItem, cleanTitle, cacheGet, cacheSet } from '@/lib/piped'
import { ytRelated, ytMusicSearch } from '@/lib/ytmusic'
import type { MusicItem } from '@/lib/types'

export const runtime = 'nodejs'

const TTL = 15 * 60 * 1000
const YT_VIDEO_ID_RE = /^[\w-]{11}$/

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const title = (req.nextUrl.searchParams.get('title') ?? '').trim()
  const artist = (req.nextUrl.searchParams.get('artist') ?? '').trim()

  if (!id && !title) {
    return NextResponse.json({ error: 'Missing id or title' }, { status: 400 })
  }

  const query = artist ? `${artist} songs` : cleanTitle(title || id)
  const cacheKey = `radio:${id}:${query.toLowerCase()}`
  const cached = cacheGet<{ items: MusicItem[] }>(cacheKey)
  if (cached) return NextResponse.json(cached)

  let items: MusicItem[] = []

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
