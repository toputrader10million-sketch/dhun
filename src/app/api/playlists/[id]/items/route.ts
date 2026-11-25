import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api'
import { db } from '@/lib/db'
import { getOrCreateUser } from '@/lib/user'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST → add item to own playlist; position = current item count
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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
      return apiError('id, title and artist are required', { status: 400 })
    }
    const playlist = await db.playlist.findFirst({ where: { id, userId: user.id } })
    if (!playlist) {
      return apiError('Playlist not found', { status: 404 })
    }
    const count = await db.playlistItem.count({ where: { playlistId: id } })
    const item = await db.playlistItem.create({
      data: {
        playlistId: id,
        source,
        trackId,
        title,
        artist,
        artwork: body.artwork ?? null,
        duration: typeof body.duration === 'number' ? body.duration : 0,
        position: count,
      },
    })
    await db.playlist.update({ where: { id }, data: { updatedAt: new Date() } })
    return NextResponse.json({ ok: true, itemId: item.id, added: 1, position: count })
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to add item', {
      status: 500,
    })
  }
}

// DELETE ?itemId= → remove item from own playlist
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const user = await getOrCreateUser()
    const itemId = req.nextUrl.searchParams.get('itemId')
    if (!itemId) {
      return apiError('Missing "itemId" parameter', { status: 400 })
    }
    const playlist = await db.playlist.findFirst({ where: { id, userId: user.id } })
    if (!playlist) {
      return apiError('Playlist not found', { status: 404 })
    }
    // Q1.2 — the D58 ghost-favorites lesson: a delete that removed nothing
    // must never answer 200 as if it succeeded.
    const removed = await db.playlistItem.deleteMany({ where: { id: itemId, playlistId: id } })
    if (removed.count === 0) {
      return apiError('Item not found in playlist', { status: 404, removed: 0 })
    }
    await db.playlist.update({ where: { id }, data: { updatedAt: new Date() } })
    return NextResponse.json({ ok: true, removed: removed.count })
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to remove item', {
      status: 500,
    })
  }
}
