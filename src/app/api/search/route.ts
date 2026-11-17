import { NextRequest, NextResponse } from 'next/server'
import { fetchPiped, parseStreamItem, cacheGet, cacheSet } from '@/lib/piped'
import type { SearchResponse, SearchFilter } from '@/lib/types'

export const runtime = 'nodejs'

const VALID_FILTERS: SearchFilter[] = ['music_songs', 'videos', 'albums', 'artists', 'playlists']
const SEARCH_TTL = 10 * 60 * 1000

export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
    if (q.length < 1) {
      return NextResponse.json({ error: 'Missing or empty "q" parameter' }, { status: 400 })
    }
    const filterParam = req.nextUrl.searchParams.get('filter') ?? 'music_songs'
    const filter: SearchFilter = VALID_FILTERS.includes(filterParam as SearchFilter)
      ? (filterParam as SearchFilter)
      : 'music_songs'
    const page = req.nextUrl.searchParams.get('page') ?? ''

    const cacheKey = `search:${q}:${filter}:${page}`
    const cached = cacheGet<SearchResponse>(cacheKey)
    if (cached) return NextResponse.json(cached)

    let path = `/search?q=${encodeURIComponent(q)}&filter=${filter}`
    if (page) path += `&nextpage=${encodeURIComponent(page)}`

    const data = await fetchPiped<{
      items?: Array<Record<string, unknown>>
      nextpage?: string
    }>(path)

    const items = (data.items ?? []).map(parseStreamItem)
    const out: SearchResponse = {
      items,
      nextPage: typeof data.nextpage === 'string' && data.nextpage ? data.nextpage : undefined,
      filter,
    }
    cacheSet(cacheKey, out, SEARCH_TTL)
    return NextResponse.json(out)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed'
    return NextResponse.json({ error: message, items: [], filter: 'music_songs' }, { status: 502 })
  }
}
