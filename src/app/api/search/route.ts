import { NextRequest, NextResponse } from 'next/server'
import { fetchPiped, parseStreamItem, cacheGet, cacheSet } from '@/lib/piped'
import { ytWebSearch, ytMusicSearch, SEARCH_SP } from '@/lib/ytmusic'
import type { SearchResponse, SearchFilter, MusicItem } from '@/lib/types'

export const runtime = 'nodejs'

const VALID_FILTERS: SearchFilter[] = ['music_songs', 'videos', 'albums', 'artists', 'playlists']
const SEARCH_TTL = 10 * 60 * 1000

async function innertubeSearch(q: string, filter: SearchFilter, page?: string): Promise<{ items: MusicItem[]; nextPage?: string }> {
  switch (filter) {
    case 'music_songs': {
      const items = await ytMusicSearch(q)
      return { items } // music search has no cheap pagination — plenty of results per query
    }
    case 'videos':
      return await ytWebSearch(q, { sp: SEARCH_SP.videos, continuation: page || undefined })
    case 'playlists':
      return await ytWebSearch(q, { sp: SEARCH_SP.playlists, continuation: page || undefined })
    case 'artists':
      return await ytWebSearch(q, { sp: SEARCH_SP.channels, continuation: page || undefined })
    case 'albums':
    default: {
      // albums have no dedicated WEB sp param — unfiltered search surfaces them
      return await ytWebSearch(q, { continuation: page || undefined })
    }
  }
}

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

    let items: MusicItem[] = []
    let nextPage: string | undefined

    // Primary: InnerTube (works from datacenter IPs; Piped is dead on Vercel)
    try {
      const r = await innertubeSearch(q, filter, page)
      items = r.items
      nextPage = r.nextPage
    } catch {
      // Fallback: legacy Piped path (works on self-hosted setups with clean IPs)
      let path = `/search?q=${encodeURIComponent(q)}&filter=${filter}`
      if (page) path += `&nextpage=${encodeURIComponent(page)}`
      const data = await fetchPiped<{ items?: Array<Record<string, unknown>>; nextpage?: string }>(path)
      items = (data.items ?? []).map(parseStreamItem)
      nextPage = typeof data.nextpage === 'string' && data.nextpage ? data.nextpage : undefined
    }

    const out: SearchResponse = { items, nextPage, filter }
    cacheSet(cacheKey, out, SEARCH_TTL)
    return NextResponse.json(out)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed'
    return NextResponse.json({ error: message, items: [], filter: 'music_songs' }, { status: 502 })
  }
}
