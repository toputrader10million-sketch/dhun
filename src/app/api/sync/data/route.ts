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

// POST → import/merge an export (best-effort).
//
// Day 28 — sync conflict rules (strategy param):
//   'merge'  (default) — favorites: imported wins (upsert update);
//            playlists: skip when a same-name playlist exists (never duplicate);
//            history: imported entry wins (latest play).
//   'local'  — same as merge, but same-name playlists get missing tracks APPENDED
//            instead of skipped.
//   'cloud'  — server wins: favorites/history rows that already exist are left
//            untouched; same-name playlists are skipped.
// Caps: favorites ≤ 5000, playlist items ≤ 500/playlist, history ≤ 5000.
export async function POST(req: NextRequest) {
  try {
    const user = await getOrCreateUser()
    const body = (await req.json()) as {
      strategy?: string
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
    const strategy = body.strategy === 'local' || body.strategy === 'cloud' ? body.strategy : 'merge'
    const FAV_CAP = 5000
    const ITEM_CAP = 500
    const HIST_CAP = 5000

    let favCount = 0
    let favUpdated = 0
    let favSkipped = 0
    for (const f of (body.favorites ?? []).slice(0, FAV_CAP)) {
      if (!f.trackId || !f.title || !f.artist) continue
      const source = f.source ?? 'yt'
      const data = {
        title: f.title,
        artist: f.artist,
        artwork: f.artwork ?? null,
        duration: typeof f.duration === 'number' ? f.duration : 0,
      }
      const existing = await db.favorite.findUnique({
        where: { source_trackId: { source, trackId: f.trackId } },
        select: { id: true },
      })
      if (existing && strategy === 'cloud') {
        favSkipped++
        continue // server wins — keep what's already here
      }
      await db.favorite.upsert({
        where: { source_trackId: { source, trackId: f.trackId } },
        update: data,
        create: { userId: user.id, source, trackId: f.trackId, ...data },
      })
      favCount++
      if (existing) favUpdated++
    }

    let plCount = 0
    let itemCount = 0
    let plMerged = 0
    let plSkipped = 0
    const existingPlaylists = await db.playlist.findMany({
      where: { userId: user.id },
      select: { id: true, name: true },
    })
    const byName = new Map(existingPlaylists.map((p) => [p.name, p.id]))
    for (const p of (body.playlists ?? []).slice(0, 200)) {
      const name = (p.playlist?.name ?? '').trim()
      if (!name) continue
      const items = (p.items ?? []).slice(0, ITEM_CAP)
      const existingId = byName.get(name)
      if (existingId) {
        if (strategy === 'merge') {
          plSkipped++ // never duplicate a playlist silently
          continue
        }
        if (strategy === 'cloud') {
          plSkipped++
          continue
        }
        // 'local' — append missing tracks to the same-name playlist
        const have = new Set(
          (
            await db.playlistItem.findMany({
              where: { playlistId: existingId },
              select: { source: true, trackId: true },
            })
          ).map((r) => `${r.source}:${r.trackId}`)
        )
        let position = await db.playlistItem.count({ where: { playlistId: existingId } })
        for (const it of items) {
          if (!it.trackId || !it.title || !it.artist) continue
          const source = it.source ?? 'yt'
          if (have.has(`${source}:${it.trackId}`)) continue
          await db.playlistItem.create({
            data: {
              playlistId: existingId,
              source,
              trackId: it.trackId,
              title: it.title,
              artist: it.artist,
              artwork: it.artwork ?? null,
              duration: typeof it.duration === 'number' ? it.duration : 0,
              position: position++,
            },
          })
          itemCount++
        }
        await db.playlist.update({ where: { id: existingId }, data: { updatedAt: new Date() } })
        plMerged++
        continue
      }
      const created = await db.playlist.create({
        data: {
          userId: user.id,
          name,
          description: p.playlist?.description?.trim() || null,
          cover: p.playlist?.cover || null,
        },
      })
      byName.set(name, created.id)
      plCount++

      let position = 0
      for (const it of items) {
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
    let histSkipped = 0
    for (const h of (body.history ?? []).slice(0, HIST_CAP)) {
      if (!h.trackId || !h.title || !h.artist) continue
      const source = h.source ?? 'yt'
      const data = {
        title: h.title,
        artist: h.artist,
        artwork: h.artwork ?? null,
        duration: typeof h.duration === 'number' ? h.duration : 0,
        playedAt: h.playedAt ? new Date(h.playedAt) : new Date(),
      }
      const existing = await db.historyEntry.findFirst({
        where: { userId: user.id, source, trackId: h.trackId },
        select: { id: true },
      })
      if (existing && strategy === 'cloud') {
        histSkipped++
        continue
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
      strategy,
      imported: { favorites: favCount, playlists: plCount, items: itemCount, history: histCount },
      resolved: {
        favoritesUpdated: favUpdated,
        favoritesKept: favSkipped,
        playlistsAppended: plMerged,
        playlistsKept: plSkipped,
        historyKept: histSkipped,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to import data' },
      { status: 500 }
    )
  }
}
