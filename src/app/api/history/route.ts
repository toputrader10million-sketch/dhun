import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { LibraryTrack } from '@/lib/types'

export const runtime = 'nodejs'

const HISTORY_CAP = 200

// GET ?limit= → recent history
export async function GET(req: NextRequest) {
  try {
    const limitParam = parseInt(req.nextUrl.searchParams.get('limit') ?? '20', 10)
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 20
    const rows = await db.historyEntry.findMany({ orderBy: { playedAt: 'desc' }, take: limit })
    const items: LibraryTrack[] = rows.map((r) => ({
      id: r.id,
      trackId: r.trackId,
      title: r.title,
      artist: r.artist,
      artwork: r.artwork,
      duration: r.duration,
      playedAt: r.playedAt.toISOString(),
    }))
    return NextResponse.json({ items })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load history', items: [] },
      { status: 500 }
    )
  }
}

// POST → record play (upsert by trackId, refresh playedAt), keep newest 200
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
    const existing = await db.historyEntry.findFirst({ where: { trackId } })
    if (existing) {
      await db.historyEntry.update({
        where: { id: existing.id },
        data: {
          title,
          artist,
          artwork: body.artwork ?? null,
          duration: typeof body.duration === 'number' ? body.duration : 0,
          playedAt: new Date(),
        },
      })
    } else {
      await db.historyEntry.create({
        data: {
          trackId,
          title,
          artist,
          artwork: body.artwork ?? null,
          duration: typeof body.duration === 'number' ? body.duration : 0,
        },
      })
    }
    // keep only newest 200 entries
    const old = await db.historyEntry.findMany({
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

// DELETE → clear all history
export async function DELETE() {
  try {
    await db.historyEntry.deleteMany({})
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to clear history' },
      { status: 500 }
    )
  }
}
