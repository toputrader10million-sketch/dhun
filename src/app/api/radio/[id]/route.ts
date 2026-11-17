import { NextRequest, NextResponse } from 'next/server'
import { fetchPiped, parseStreamItem, cleanTitle, cacheGet, cacheSet } from '@/lib/piped'
import type { MusicItem } from '@/lib/types'

export const runtime = 'nodejs'

const TTL = 15 * 60 * 1000

// Next 16: params is a Promise
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const title = (req.nextUrl.searchParams.get('title') ?? '').trim()
  const artist = (req.nextUrl.searchParams.get('artist') ?? '').trim()

  if (!id && !title) {
    return NextResponse.json({ error: 'Missing id or title' }, { status: 400 })
  }

  const query = artist ? `${artist} songs` : cleanTitle(title || id)
  const cacheKey = `radio:${query.toLowerCase()}`
  const cached = cacheGet<{ items: MusicItem[] }>(cacheKey)
  if (cached) return NextResponse.json(cached)

  try {
    const data = await fetchPiped<{ items?: Array<Record<string, unknown>> }>(
      `/search?q=${encodeURIComponent(query)}&filter=music_songs`
    )
    const items = (data.items ?? [])
      .map(parseStreamItem)
      .filter((it) => it.id && it.id !== id)
      .slice(0, 15)
    const out = { items }
    cacheSet(cacheKey, out, TTL)
    return NextResponse.json(out)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Radio search failed'
    return NextResponse.json({ error: message, items: [] }, { status: 502 })
  }
}
