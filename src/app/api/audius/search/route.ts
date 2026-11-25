import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api'
import { searchTracks } from '@/lib/audius'
import type { MusicItem } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (!q) {
    return apiError('Missing "q" parameter', { status: 400 })
  }
  const limitParam = parseInt(req.nextUrl.searchParams.get('limit') ?? '24', 10)
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 50) : 24
  try {
    const items: MusicItem[] = await searchTracks(q, limit)
    return NextResponse.json({ items })
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Audius search failed', {
      status: 502,
      items: [] as MusicItem[],
    })
  }
}
