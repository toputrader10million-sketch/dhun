import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api'
import { ytMusicSearch, ytWebSearch } from '@/lib/ytmusic'
import { cacheGet, cacheSet } from '@/lib/piped'
import { emptyResultFallback } from '@/lib/resilient'
import { WAVES, WAVE_QUERIES, type WaveTrackResponse } from '@/lib/waves'
import type { MusicItem } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TTL = 60 * 60 * 1000

function clampItems(items: MusicItem[], min = 60, max = 900): MusicItem[] {
  return items.filter(
    (it) => it.id && (it.duration === 0 || (it.duration >= min && it.duration <= max))
  )
}

async function ytSafe(query: string): Promise<MusicItem[]> {
  try {
    return await ytMusicSearch(query)
  } catch {
    try {
      const web = await ytWebSearch(query)
      return web.items
    } catch {
      return []
    }
  }
}

// GET /api/waves            → wave metadata (for the editorial strip)
// GET /api/waves?id=bangla  → resolved, merged track list for one wave
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')

  if (!id) {
    return NextResponse.json({ waves: WAVES })
  }

  const meta = WAVES.find((w) => w.id === id)
  const queries = WAVE_QUERIES[id]
  if (!meta || !queries) {
    return apiError('Unknown wave', { status: 400 })
  }

  const cacheKey = `wave:${id}`
  const cached = cacheGet<{ wave: WaveTrackResponse }>(cacheKey)
  if (cached) return NextResponse.json(cached)

  const batches = await Promise.all(queries.map((q) => ytSafe(q)))
  // Interleave batches so the mix feels curated, then de-duplicate by id.
  const seen = new Set<string>()
  const merged: MusicItem[] = []
  const maxLen = Math.max(...batches.map((b) => b.length), 0)
  for (let i = 0; i < maxLen; i++) {
    for (const batch of batches) {
      const item = batch[i]
      if (!item || seen.has(item.id)) continue
      seen.add(item.id)
      merged.push(item)
    }
  }
  const items = clampItems(merged).slice(0, 18)

  const wave: WaveTrackResponse = { ...meta, items }
  const out = { wave }
  // Q1.3 — empty wave + open breaker → stale cache with honest banner.
  const fallback = emptyResultFallback({
    cacheKey,
    out,
    isEmpty: (v) => v.wave.items.length === 0,
    candidates: ['ytmusic', 'piped'],
  })
  if (fallback.cacheable) cacheSet(cacheKey, fallback.data, TTL)
  const body = fallback.degraded ? { ...fallback.data, degraded: fallback.degraded } : fallback.data
  return NextResponse.json(body)
}
