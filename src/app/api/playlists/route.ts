import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrCreateUser } from '@/lib/user'
import type { PlaylistSummary } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET → current user's playlists with item counts
export async function GET() {
  try {
    const user = await getOrCreateUser()
    const rows = await db.playlist.findMany({
      where: { userId: user.id },
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

// POST → create playlist owned by the current user
export async function POST(req: NextRequest) {
  try {
    const user = await getOrCreateUser()
    const body = (await req.json()) as { name?: string; description?: string }
    const name = (body.name ?? '').trim()
    if (!name) {
      return NextResponse.json({ error: 'Playlist name is required' }, { status: 400 })
    }
    const created = await db.playlist.create({
      data: {
        userId: user.id,
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

// DELETE ?id= → delete own playlist (items cascade)
export async function DELETE(req: NextRequest) {
  try {
    const user = await getOrCreateUser()
    const id = req.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Missing "id" parameter' }, { status: 400 })
    }
    const playlist = await db.playlist.findFirst({ where: { id, userId: user.id } })
    if (!playlist) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 })
    }
    await db.playlist.delete({ where: { id: playlist.id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete playlist' },
      { status: 500 }
    )
  }
}
