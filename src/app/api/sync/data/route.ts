import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrCreateUser, getUserCounts, serializeUser } from '@/lib/user'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET → full export of the current user's library
export async function GET() {
  try {
    const user = await getOrCreateUser()
    const [favorites, playlists, history] = await Promise.all([
      db.favorite.findMany({ where: { userId: user.id }, orderBy: { addedAt: 'desc' } }),
      db.playlist.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
        include: { items: { orderBy: [{ position: 'asc' }, { addedAt: 'asc' }] } },
      }),
      db.historyEntry.findMany({ where: { userId: user.id }, orderBy: { playedAt: 'desc' } }),
    ])
    return NextResponse.json({
      user: serializeUser(user),
      favorites: favorites.map((f) => ({
        trackId: f.trackId,
        source: f.source,
        title: f.title,
        artist: f.artist,
        artwork: f.artwork,
        duration: f.duration,
        addedAt: f.addedAt.toISOString(),
      })),
      playlists: playlists.map((p) => ({
        playlist: {
          name: p.name,
          description: p.description,
          cover: p.cover,
          createdAt: p.createdAt.toISOString(),
        },
        items: p.items.map((it) => ({
          trackId: it.trackId,
          source: it.source,
          title: it.title,
          artist: it.artist,
          artwork: it.artwork,
          duration: it.duration,
          position: it.position,
        })),
      })),
      history: history.map((h) => ({
        trackId: h.trackId,
        source: h.source,
        title: h.title,
        artist: h.artist,
        artwork: h.artwork,
        duration: h.duration,
        playedAt: h.playedAt.toISOString(),
      })),
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to export data' },
      { status: 500 }
    )
  }
}

// POST → import/merge an export (best-effort): upsert favorites on (source,trackId),
// create playlists not sharing name with an existing one, append their items,
// upsert history deduped on (source,trackId).
export async function POST(req: NextRequest) {
  try {
    const user = await getOrCreateUser()
    const body = (await req.json()) as {
      favorites?: Array<{
        trackId?: string
        source?: string
        title?: string
        artist?: string
        artwork?: string | null
        duration?: number
        addedAt?: string
      }>
      playlists?: Array<{
        playlist?: { name?: string; description?: string | null; cover?: string | null }
        items?: Array<{
          trackId?: string
          source?: string
          title?: string
          artist?: string
          artwork?: string | null
          duration?: number
          position?: number
        }>
      }>
      history?: Array<{
        trackId?: string
        source?: string
        title?: string
        artist?: string
        artwork?: string | null
        duration?: number
        playedAt?: string
      }>
    }

    let favCount = 0
    for (const f of body.favorites ?? []) {
      if (!f.trackId || !f.title || !f.artist) continue
      const source = f.source ?? 'yt'
      const data = {
        title: f.title,
        artist: f.artist,
        artwork: f.artwork ?? null,
        duration: typeof f.duration === 'number' ? f.duration : 0,
      }
      await db.favorite.upsert({
        where: { source_trackId: { source, trackId: f.trackId } },
        update: data,
        create: { userId: user.id, source, trackId: f.trackId, ...data },
      })
      favCount++
    }

    let plCount = 0
    let itemCount = 0
    const existingNames = new Set(
      (
        await db.playlist.findMany({ where: { userId: user.id }, select: { name: true } })
      ).map((p) => p.name)
    )
    for (const p of body.playlists ?? []) {
      const name = (p.playlist?.name ?? '').trim()
      if (!name || existingNames.has(name)) continue
      const created = await db.playlist.create({
        data: {
          userId: user.id,
          name,
          description: p.playlist?.description?.trim() || null,
          cover: p.playlist?.cover || null,
        },
      })
      existingNames.add(name)
      plCount++

      let position = 0
      for (const it of p.items ?? []) {
        if (!it.trackId || !it.title || !it.artist) continue
        await db.playlistItem.create({
          data: {
            playlistId: created.id,
            source: it.source ?? 'yt',
            trackId: it.trackId,
            title: it.title,
            artist: it.artist,
            artwork: it.artwork ?? null,
            duration: typeof it.duration === 'number' ? it.duration : 0,
            position: typeof it.position === 'number' ? it.position : position,
          },
        })
        itemCount++
        position++
      }
      await db.playlist.update({ where: { id: created.id }, data: { updatedAt: new Date() } })
    }

    let histCount = 0
    for (const h of body.history ?? []) {
      if (!h.trackId || !h.title || !h.artist) continue
      const source = h.source ?? 'yt'
      const data = {
        title: h.title,
        artist: h.artist,
        artwork: h.artwork ?? null,
        duration: typeof h.duration === 'number' ? h.duration : 0,
        playedAt: h.playedAt ? new Date(h.playedAt) : new Date(),
      }
      await db.historyEntry.deleteMany({
        where: { userId: user.id, source, trackId: h.trackId },
      })
      await db.historyEntry.create({
        data: { userId: user.id, source, trackId: h.trackId, ...data },
      })
      histCount++
    }

    return NextResponse.json({
      ok: true,
      imported: { favorites: favCount, playlists: plCount, items: itemCount, history: histCount },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to import data' },
      { status: 500 }
    )
  }
}
