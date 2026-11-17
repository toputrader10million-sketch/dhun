import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrCreateUser } from '@/lib/user'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_KEPT = 5 // prune older handoffs, keep the most recent 5
const MAX_ITEMS = 500 // sanity cap on queue length

interface HandoffItem {
  id: string
  source?: string
  title: string
  artist: string
  artwork?: string
  duration?: number
}

// POST — publish a queue snapshot ("send my queue to my other devices").
// Body: { fromDevice, index, position, shuffle, repeat, items }
export async function POST(req: NextRequest) {
  try {
    const user = await getOrCreateUser()
    const body = (await req.json()) as {
      fromDevice?: string
      index?: number
      position?: number
      shuffle?: boolean
      repeat?: string
      items?: HandoffItem[]
    }
    const items = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : []
    if (items.length === 0) {
      return NextResponse.json({ error: 'Queue is empty — nothing to hand off' }, { status: 400 })
    }
    const index = Math.max(0, Math.min(items.length - 1, Math.round(body.index ?? 0)))
    const position = Math.max(0, Math.round(body.position ?? 0))
    const created = await db.queueHandoff.create({
      data: {
        userId: user.id,
        fromDevice: (body.fromDevice || 'Unknown device').slice(0, 60),
        trackIndex: index,
        position,
        shuffle: Boolean(body.shuffle),
        repeat: ['off', 'all', 'one'].includes(body.repeat ?? '') ? (body.repeat as string) : 'off',
        items: JSON.stringify(items),
      },
    })
    // Prune: keep only the newest MAX_KEPT handoffs for this user.
    try {
      const old = await db.queueHandoff.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        skip: MAX_KEPT,
        select: { id: true },
      })
      if (old.length > 0) {
        await db.queueHandoff.deleteMany({ where: { id: { in: old.map((h) => h.id) } } })
      }
    } catch {
      /* pruning is best-effort */
    }
    return NextResponse.json({ id: created.id, createdAt: created.createdAt.toISOString() })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to publish handoff' },
      { status: 500 }
    )
  }
}

// GET — recent handoffs (summary; full items only via /api/sync/queue/[id]).
export async function GET() {
  try {
    const user = await getOrCreateUser()
    const rows = await db.queueHandoff.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: MAX_KEPT,
    })
    const handoffs = rows.map((r) => {
      let items: HandoffItem[] = []
      try {
        items = JSON.parse(r.items) as HandoffItem[]
      } catch {}
      const current = items[r.trackIndex] ?? items[0]
      return {
        id: r.id,
        fromDevice: r.fromDevice,
        trackIndex: r.trackIndex,
        position: r.position,
        shuffle: r.shuffle,
        repeat: r.repeat,
        trackCount: items.length,
        track: current
          ? { id: current.id, source: current.source ?? 'yt', title: current.title, artist: current.artist }
          : null,
        createdAt: r.createdAt.toISOString(),
      }
    })
    return NextResponse.json({ handoffs })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list handoffs' },
      { status: 500 }
    )
  }
}
