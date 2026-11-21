import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrCreateUser } from '@/lib/user'
import type { LibraryTrack } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET → current user's favorites ordered by addedAt desc
export async function GET() {
  try {
    const user = await getOrCreateUser()
    const rows = await db.favorite.findMany({
      where: { userId: user.id },
      orderBy: { addedAt: 'desc' },
    })
    const items: LibraryTrack[] = rows.map((r) => ({
      id: r.id,
      trackId: r.trackId,
      title: r.title,
      artist: r.artist,
      artwork: r.artwork,
      duration: r.duration,
      addedAt: r.addedAt.toISOString(),
      source: r.source as LibraryTrack['source'],
    }))
    return NextResponse.json({ items })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load favorites', items: [] },
      { status: 500 }
    )
  }
}

// POST → upsert favorite on the (source, trackId) unique — re-adding refreshes metadata
export async function POST(req: NextRequest) {
  try {
    const user = await getOrCreateUser()
    const body = (await req.json()) as {
      id?: string
      trackId?: string
      title?: string
      artist?: string
      artwork?: string | null
      duration?: number
      source?: string
    }
    const trackId = body.id ?? body.trackId
    const title = body.title
    const artist = body.artist
    const source = body.source ?? 'yt'
    if (!trackId || !title || !artist) {
      return NextResponse.json({ error: 'id, title and artist are required' }, { status: 400 })
    }
    const data = {
      title,
      artist,
      artwork: body.artwork ?? null,
      duration: typeof body.duration === 'number' ? body.duration : 0,
    }
    await db.favorite.upsert({
      where: { source_trackId: { source, trackId } },
      update: data,
      create: { userId: user.id, source, trackId, ...data },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save favorite' },
      { status: 500 }
    )
  }
}

// DELETE ?trackId=&source= → remove favorite(s) of the current user.
// D58 fix — when the caller omits `source`, delete across ALL sources
// (the old 'yt' default made Audius favorites impossible to remove: the
// deleteMany matched 0 rows and still returned ok → ghost favorites).
export async function DELETE(req: NextRequest) {
  try {
    const user = await getOrCreateUser()
    const trackId = req.nextUrl.searchParams.get('trackId')
    if (!trackId) {
      return NextResponse.json({ error: 'Missing "trackId" parameter' }, { status: 400 })
    }
    const source = req.nextUrl.searchParams.get('source')
    const removed = await db.favorite.deleteMany({
      where: { userId: user.id, trackId, ...(source ? { source } : {}) },
    })
    return NextResponse.json({ ok: true, removed: removed.count })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete favorite' },
      { status: 500 }
    )
  }
}
