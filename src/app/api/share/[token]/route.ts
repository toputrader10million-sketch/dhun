import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureNewTables } from '@/lib/db-bootstrap'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Day 34 — public read endpoint for a share token. No auth, no owner info:
// returns the playlist name/description and its tracks (sanitized snapshot).
const MAX_ITEMS = 200

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token || token.length > 64) {
    return NextResponse.json({ error: 'Invalid link' }, { status: 400 })
  }
  try {
    if (!(await ensureNewTables())) {
      return NextResponse.json(
        { error: 'Shared playlists are not available right now — try again later' },
        { status: 503 }
      )
    }
    const share = await db.playlistShare.findUnique({
      where: { token },
      include: {
        playlist: {
          include: {
            items: { orderBy: [{ position: 'asc' }, { addedAt: 'asc' }], take: MAX_ITEMS },
            _count: { select: { items: true } },
          },
        },
      },
    })
    if (!share) {
      return NextResponse.json({ error: 'This link is invalid or was revoked' }, { status: 404 })
    }

    // Fire-and-forget view counter (never blocks or fails the read)
    void db.playlistShare
      .update({ where: { id: share.id }, data: { views: { increment: 1 } } })
      .catch(() => {})

    const p = share.playlist
    return NextResponse.json({
      name: p.name,
      description: p.description,
      count: p._count.items,
      updatedAt: p.updatedAt.toISOString(),
      truncated: p._count.items > MAX_ITEMS,
      items: p.items.map((it) => ({
        trackId: it.trackId,
        title: it.title,
        artist: it.artist,
        artwork: it.artwork,
        duration: it.duration,
        source: it.source,
        position: it.position,
      })),
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load shared playlist' },
      { status: 500 }
    )
  }
}
