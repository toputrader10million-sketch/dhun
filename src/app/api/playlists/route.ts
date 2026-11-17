import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { PlaylistSummary } from '@/lib/types'

export const runtime = 'nodejs'

// GET → all playlists with item counts
export async function GET() {
  try {
    const rows = await db.playlist.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { items: true } } },
    })
    const playlists: PlaylistSummary[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      cover: r.cover,
      count: r._count.items,
      createdAt: r.createdAt.toISOString(),
    }))
    return NextResponse.json({ playlists })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load playlists', playlists: [] },
      { status: 500 }
    )
  }
}

// POST → create playlist
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { name?: string; description?: string }
    const name = (body.name ?? '').trim()
    if (!name) {
      return NextResponse.json({ error: 'Playlist name is required' }, { status: 400 })
    }
    const created = await db.playlist.create({
      data: {
        name,
        description: body.description?.trim() || null,
      },
    })
    return NextResponse.json({ ok: true, id: created.id })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create playlist' },
      { status: 500 }
    )
  }
}

// DELETE ?id= → delete playlist (items cascade)
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Missing "id" parameter' }, { status: 400 })
    }
    await db.playlist.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete playlist' },
      { status: 500 }
    )
  }
}
