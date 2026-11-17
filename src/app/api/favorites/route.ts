import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { LibraryTrack } from '@/lib/types'

export const runtime = 'nodejs'

// GET → favorites ordered by addedAt desc
export async function GET() {
  try {
    const rows = await db.favorite.findMany({ orderBy: { addedAt: 'desc' } })
    const items: LibraryTrack[] = rows.map((r) => ({
      id: r.id,
      trackId: r.trackId,
      title: r.title,
      artist: r.artist,
      artwork: r.artwork,
      duration: r.duration,
      addedAt: r.addedAt.toISOString(),
    }))
    return NextResponse.json({ items })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load favorites', items: [] },
      { status: 500 }
    )
  }
}

// POST → upsert favorite by trackId
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      id?: string
      trackId?: string
      title?: string
      artist?: string
      artwork?: string | null
      duration?: number
    }
    const trackId = body.id ?? body.trackId
    const title = body.title
    const artist = body.artist
    if (!trackId || !title || !artist) {
      return NextResponse.json({ error: 'id, title and artist are required' }, { status: 400 })
    }
    await db.favorite.upsert({
      where: { trackId },
      update: {
        title,
        artist,
        artwork: body.artwork ?? null,
        duration: typeof body.duration === 'number' ? body.duration : 0,
      },
      create: {
        trackId,
        title,
        artist,
        artwork: body.artwork ?? null,
        duration: typeof body.duration === 'number' ? body.duration : 0,
      },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save favorite' },
      { status: 500 }
    )
  }
}

// DELETE ?trackId= → remove favorite(s)
export async function DELETE(req: NextRequest) {
  try {
    const trackId = req.nextUrl.searchParams.get('trackId')
    if (!trackId) {
      return NextResponse.json({ error: 'Missing "trackId" parameter' }, { status: 400 })
    }
    await db.favorite.deleteMany({ where: { trackId } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete favorite' },
      { status: 500 }
    )
  }
}
