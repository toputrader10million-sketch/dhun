import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureNewTables } from '@/lib/db-bootstrap'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Day 37 — anonymous aggregate reaction ("like") analytics.
 * POST: one fire-and-forget row per like. No user id, no IP, no cookies —
 * this endpoint never identifies anyone. GET: aggregated community loves.
 */

const MAX_BODY = 512
const ALLOWED_SOURCES = new Set(['yt', 'au', 'jm'])

function clean(v: unknown, cap: number): string {
  return typeof v === 'string' ? v.trim().slice(0, cap) : ''
}

// POST /api/reactions { trackId, source?, title?, artist?, artwork?, region? }
export async function POST(req: NextRequest) {
  try {
    if (!(await ensureNewTables())) {
      return NextResponse.json({ ok: false }, { status: 503 })
    }
    const raw = await req.text()
    if (raw.length > MAX_BODY) {
      return NextResponse.json({ ok: false, error: 'Payload too large' }, { status: 413 })
    }
    let body: Record<string, unknown> = {}
    try {
      body = JSON.parse(raw)
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
    }
    const trackId = clean(body.trackId, 64)
    if (!trackId) {
      return NextResponse.json({ ok: false, error: 'trackId required' }, { status: 400 })
    }
    const source = ALLOWED_SOURCES.has(String(body.source)) ? String(body.source) : 'yt'
    const region = clean(body.region, 8).toUpperCase() || 'GLOBAL'
    await db.reaction.create({
      data: {
        trackId,
        source,
        region,
        title: clean(body.title, 140),
        artist: clean(body.artist, 120),
        artwork: clean(body.artwork, 300) || null,
      },
    })
    return NextResponse.json({ ok: true })
  } catch {
    // reactions are anonymous and best-effort — never surface errors to the user
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}

// GET /api/reactions → community loves (last 30 days, top 24)
export async function GET() {
  try {
    if (!(await ensureNewTables())) {
      return NextResponse.json({ top: [], unavailable: true })
    }
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const rows = await db.reaction.groupBy({
      by: ['trackId', 'source', 'title', 'artist', 'artwork'],
      where: { createdAt: { gte: since }, title: { not: '' } },
      _count: { _all: true },
      orderBy: { _count: { trackId: 'desc' } },
      take: 24,
    })
    const top = rows
      .filter((r) => r._count._all > 0)
      .map((r) => ({
        trackId: r.trackId,
        source: r.source,
        title: r.title,
        artist: r.artist,
        artwork: r.artwork,
        likes: r._count._all,
      }))
    return NextResponse.json({ top, since: since.toISOString() })
  } catch {
    return NextResponse.json({ top: [], unavailable: true })
  }
}
