import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { PlaylistDetail, PlaylistItemData } from '@/lib/types'

export const runtime = 'nodejs'

// GET → playlist detail with items (position asc, addedAt asc)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const row = await db.playlist.findUnique({
      where: { id },
      include: {
        items: { orderBy: [{ position: 'asc' }, { addedAt: 'asc' }] },
        _count: { select: { items: true } },
      },
    })
    if (!row) return NextResponse.json(null)
    const items: PlaylistItemData[] = row.items.map((it) => ({
      id: it.id,
      trackId: it.trackId,
      title: it.title,
      artist: it.artist,
      artwork: it.artwork,
      duration: it.duration,
      position: it.position,
    }))
    const detail: PlaylistDetail = {
      id: row.id,
      name: row.name,
      description: row.description,
      cover: row.cover,
      count: row._count.items,
      createdAt: row.createdAt.toISOString(),
      items,
    }
    return NextResponse.json(detail)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load playlist' },
      { status: 500 }
    )
  }
}

// PATCH → rename / update description / cover
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const body = (await req.json()) as { name?: string; description?: string; cover?: string }
    const data: { name?: string; description?: string | null; cover?: string | null } = {}
    if (body.name !== undefined) {
      const name = body.name.trim()
      if (!name) {
        return NextResponse.json({ error: 'Playlist name cannot be empty' }, { status: 400 })
      }
      data.name = name
    }
    if (body.description !== undefined) data.description = body.description.trim() || null
    if (body.cover !== undefined) data.cover = body.cover || null

    await db.playlist.update({ where: { id }, data })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update playlist' },
      { status: 500 }
    )
  }
}

// DELETE → delete playlist (items cascade via schema)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    await db.playlist.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete playlist' },
      { status: 500 }
    )
  }
}
