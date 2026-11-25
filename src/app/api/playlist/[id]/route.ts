import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api'
import { fetchPiped, parseStreamItem, cacheGet, cacheSet } from '@/lib/piped'
import type { MusicItem } from '@/lib/types'

export const runtime = 'nodejs'

const TTL = 15 * 60 * 1000

// Next 16: params is a Promise
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!id) return apiError('Missing playlist id', { status: 400 })

  const cacheKey = `playlist:${id}`
  const cached = cacheGet<{
    name: string
    description?: string
    cover?: string
    items: MusicItem[]
  }>(cacheKey)
  if (cached) return NextResponse.json(cached)

  try {
    const data = await fetchPiped<{
      name?: string
      description?: string
      thumbnailUrl?: string
      relatedStreams?: Array<Record<string, unknown>>
    }>(`/playlists/${encodeURIComponent(id)}`)

    const items = (data.relatedStreams ?? [])
      .map(parseStreamItem)
      .filter((it) => it.id)
      .slice(0, 100)

    const out = {
      name: data.name ?? 'Playlist',
      description: data.description || undefined,
      cover: data.thumbnailUrl || undefined,
      items,
    }
    cacheSet(cacheKey, out, TTL)
    return NextResponse.json(out)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Playlist fetch failed'
    return apiError(message, { status: 503, code: 'upstream-unavailable', retryable: true })
  }
}
