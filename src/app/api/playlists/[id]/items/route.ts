import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// POST → add item to playlist; position = current item count
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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
    const playlist = await db.playlist.findUnique({ where: { id } })
    if (!playlist) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 })
    }
    const count = await db.playlistItem.count({ where: { playlistId: id } })
    const item = await db.playlistItem.create({
      data: {
        playlistId: id,
        trackId,
        title,
        artist,
        artwork: body.artwork ?? null,
        duration: typeof body.duration === 'number' ? body.duration : 0,
        position: count,
      },
    })
    await db.playlist.update({ where: { id }, data: { updatedAt: new Date() } })
    return NextResponse.json({ ok: true, itemId: item.id })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to add item' },
      { status: 500 }
    )
  }
}

// DELETE ?itemId= → remove item from playlist
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const itemId = req.nextUrl.searchParams.get('itemId')
    if (!itemId) {
      return NextResponse.json({ error: 'Missing "itemId" parameter' }, { status: 400 })
    }
    await db.playlistItem.deleteMany({ where: { id: itemId, playlistId: id } })
    await db.playlist.update({ where: { id }, data: { updatedAt: new Date() } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to remove item' },
      { status: 500 }
    )
  }
}
