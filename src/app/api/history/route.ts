import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrCreateUser } from '@/lib/user'
import type { LibraryTrack } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HISTORY_CAP = 200

// GET ?limit= → current user's recent history (playedAt desc)
export async function GET(req: NextRequest) {
  try {
    const user = await getOrCreateUser()
    const limitParam = parseInt(req.nextUrl.searchParams.get('limit') ?? '20', 10)
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 20
    const rows = await db.historyEntry.findMany({
      where: { userId: user.id },
      orderBy: { playedAt: 'desc' },
      take: limit,
    })
    const items: LibraryTrack[] = rows.map((r) => ({
      id: r.id,
      trackId: r.trackId,
      title: r.title,
      artist: r.artist,
      artwork: r.artwork,
      duration: r.duration,
      playedAt: r.playedAt.toISOString(),
      source: r.source as LibraryTrack['source'],
    }))
    return NextResponse.json({ items })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load history', items: [] },
      { status: 500 }
    )
  }
}

// POST → record play for current user. HistoryEntry has no unique key, so any
// previous entry for the same (source, trackId) is deleted before creating.
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
    // dedupe: replace any earlier entry of the same track for this user
    await db.historyEntry.deleteMany({
      where: { userId: user.id, source, trackId },
    })
    await db.historyEntry.create({ data: { userId: user.id, source, trackId, ...data } })

    // keep only newest 200 entries for this user
    const old = await db.historyEntry.findMany({
      where: { userId: user.id },
      orderBy: { playedAt: 'desc' },
      skip: HISTORY_CAP,
      select: { id: true },
    })
    if (old.length > 0) {
      await db.historyEntry.deleteMany({ where: { id: { in: old.map((o) => o.id) } } })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to record history' },
      { status: 500 }
    )
  }
}

// DELETE → clear current user's history
export async function DELETE() {
  try {
    const user = await getOrCreateUser()
    await db.historyEntry.deleteMany({ where: { userId: user.id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to clear history' },
      { status: 500 }
    )
  }
}
