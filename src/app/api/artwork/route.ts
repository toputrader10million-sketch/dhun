import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api'
import { cleanTitle, cacheGet, cacheSet } from '@/lib/piped'
import type { ArtworkResponse } from '@/lib/types'

export const runtime = 'nodejs'

const TTL = 24 * 60 * 60 * 1000

interface ITunesResult {
  trackName?: string
  artistName?: string
  collectionName?: string
  artworkUrl100?: string
  primaryGenreName?: string
  releaseDate?: string
}

export async function GET(req: NextRequest) {
  const title = (req.nextUrl.searchParams.get('title') ?? '').trim()
  const artist = (req.nextUrl.searchParams.get('artist') ?? '').trim()

  if (!title) {
    return apiError('Missing "title" parameter', { status: 400 })
  }

  const cacheKey = `artwork:${title.toLowerCase()}|${artist.toLowerCase()}`
  const cached = cacheGet<ArtworkResponse>(cacheKey)
  if (cached) return NextResponse.json(cached)

  const term = `${cleanTitle(title)} ${artist}`.trim()
  const out: ArtworkResponse = { url: null }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=5`,
      { signal: controller.signal, cache: 'no-store', redirect: 'follow' }
    )
    clearTimeout(timer)
    if (res.ok) {
      const data = (await res.json()) as { results?: ITunesResult[] }
      const hit = (data.results ?? []).find((r) => r.artworkUrl100)
      if (hit?.artworkUrl100) {
        out.url = hit.artworkUrl100.replace('100x100bb', '1000x1000bb')
        out.album = hit.collectionName
        out.genre = hit.primaryGenreName
        out.year = hit.releaseDate?.slice(0, 4)
      }
    }
  } catch {
    /* return { url: null } on failure */
  }

  cacheSet(cacheKey, out, TTL)
  return NextResponse.json(out)
}
