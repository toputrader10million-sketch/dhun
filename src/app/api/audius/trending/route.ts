import { NextRequest, NextResponse } from 'next/server'
import { trendingTracks } from '@/lib/audius'
import type { MusicItem } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const limitParam = parseInt(req.nextUrl.searchParams.get('limit') ?? '24', 10)
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 24
  const genre = req.nextUrl.searchParams.get('genre') ?? undefined
  try {
    const items: MusicItem[] = await trendingTracks(limit, genre || undefined)
    return NextResponse.json({ items })
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Audius trending failed',
        items: [] as MusicItem[],
      },
      { status: 502 }
    )
  }
}
