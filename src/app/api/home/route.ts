import { NextRequest, NextResponse } from 'next/server'
import { fetchPiped, parseStreamItem, cacheGet, cacheSet } from '@/lib/piped'
import type { HomeResponse, HomeSection, MusicItem } from '@/lib/types'

export const runtime = 'nodejs'

const TTL = 30 * 60 * 1000

const SECTIONS: Array<{ title: string; query: string }> = [
  { title: 'Bengali Hits', query: 'bengali latest hits songs' },
  { title: 'Bollywood Top', query: 'bollywood top hits' },
  { title: 'Global Hits', query: 'english top hits 2025' },
  { title: 'Chill Lo-fi', query: 'lofi chill songs' },
  { title: 'Punjabi Beats', query: 'punjabi hits songs' },
]

async function fetchSection(query: string): Promise<MusicItem[]> {
  try {
    const data = await fetchPiped<{ items?: Array<Record<string, unknown>> }>(
      `/search?q=${encodeURIComponent(query)}&filter=music_songs`
    )
    return (data.items ?? [])
      .map(parseStreamItem)
      .filter((it) => it.duration >= 60 && it.duration <= 600 && it.id)
      .slice(0, 20)
  } catch {
    return []
  }
}

export async function GET(req: NextRequest) {
  const region = (req.nextUrl.searchParams.get('region') ?? 'IN').trim() || 'IN'

  const cacheKey = `home:${region}`
  const cached = cacheGet<HomeResponse>(cacheKey)
  if (cached) return NextResponse.json(cached)

  const results = await Promise.allSettled(
    SECTIONS.map(async (s) => ({ title: s.title, items: await fetchSection(s.query) }))
  )
  const sections: HomeSection[] = results.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { title: SECTIONS[i].title, items: [] }
  )

  const out: HomeResponse = { sections }
  cacheSet(cacheKey, out, TTL)
  return NextResponse.json(out)
}
