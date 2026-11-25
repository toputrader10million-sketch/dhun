import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api'
import { db } from '@/lib/db'
import { getOrCreateUser } from '@/lib/user'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface HandoffItem {
  id: string
  source?: string
  title: string
  artist: string
  artwork?: string
  duration?: number
}

// GET /api/sync/queue/[id] — full handoff snapshot (queue items + position).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await getOrCreateUser()
    const row = await db.queueHandoff.findUnique({ where: { id } })
    if (!row || row.userId !== user.id) {
      return apiError('Handoff not found', { status: 404 })
    }
    let items: HandoffItem[] = []
    try {
      items = JSON.parse(row.items) as HandoffItem[]
    } catch {}
    return NextResponse.json({
      id: row.id,
      fromDevice: row.fromDevice,
      trackIndex: row.trackIndex,
      position: row.position,
      shuffle: row.shuffle,
      repeat: row.repeat,
      items,
      createdAt: row.createdAt.toISOString(),
    })
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to load handoff', {
      status: 500,
    })
  }
}

// DELETE /api/sync/queue/[id] — dismiss a handoff from the list.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await getOrCreateUser()
    const row = await db.queueHandoff.findUnique({ where: { id } })
    if (!row || row.userId !== user.id) {
      return apiError('Handoff not found', { status: 404 })
    }
    await db.queueHandoff.delete({ where: { id } })
    return NextResponse.json({ ok: true, removed: 1 })
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to delete handoff', {
      status: 500,
    })
  }
}
