import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { db } from '@/lib/db'
import { getOrCreateUser } from '@/lib/user'
import { ensureNewTables } from '@/lib/db-bootstrap'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Day 34 — public read-only share links.
// POST → mint (or return the existing) share token for an OWN playlist. Idempotent:
// one active token per playlist, so repeated POSTs return the same link.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    if (!(await ensureNewTables())) {
      return NextResponse.json(
        { error: 'Public links are not available right now — try again later' },
        { status: 503 }
      )
    }
    const user = await getOrCreateUser()
    const playlist = await db.playlist.findFirst({ where: { id, userId: user.id } })
    if (!playlist) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 })
    }

    const existing = await db.playlistShare.findFirst({
      where: { playlistId: playlist.id },
      orderBy: { createdAt: 'desc' },
    })
    if (existing) {
      return NextResponse.json({ token: existing.token, views: existing.views, created: false })
    }

    const token = randomBytes(9).toString('base64url') // 12 chars, url-safe
    const share = await db.playlistShare.create({
      data: { token, playlistId: playlist.id },
    })
    return NextResponse.json({ token: share.token, views: share.views, created: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create share link' },
      { status: 500 }
    )
  }
}

// DELETE → revoke the active token (the old URL stops working immediately)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    if (!(await ensureNewTables())) {
      return NextResponse.json(
        { error: 'Public links are not available right now — try again later' },
        { status: 503 }
      )
    }
    const user = await getOrCreateUser()
    const playlist = await db.playlist.findFirst({ where: { id, userId: user.id } })
    if (!playlist) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 })
    }
    const removed = await db.playlistShare.deleteMany({ where: { playlistId: playlist.id } })
    return NextResponse.json({ ok: true, removed: removed.count })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to revoke share link' },
      { status: 500 }
    )
  }
}
