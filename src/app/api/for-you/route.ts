import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api'
import { db } from '@/lib/db'
import { getOrCreateUser } from '@/lib/user'
import { ytMusicSearch } from '@/lib/ytmusic'
import { cacheGet, cacheSet, cacheGetStale } from '@/lib/piped'
import { openBreaker, degradedNotice, UPSTREAM_LABELS } from '@/lib/resilient'
import type { MusicItem } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TTL = 30 * 60 * 1000

interface ForYouSection {
  title: string
  items: MusicItem[]
}

/**
 * GET → personalised sections built from the user's real listening data:
 * recent history + favorites → top artists → fresh YouTube Music search per
 * artist ("Because you listen to …"). Fully server-computed, cached 30 min.
 */
export async function GET() {
  try {
    const user = await getOrCreateUser()

    const cacheKey = `for-you:${user.id}`
    const cached = cacheGet<{ sections: ForYouSection[] }>(cacheKey)
    if (cached) return NextResponse.json(cached)

    const [history, favorites] = await Promise.all([
      db.historyEntry.findMany({
        where: { userId: user.id },
        orderBy: { playedAt: 'desc' },
        take: 50,
        select: { artist: true },
      }),
      db.favorite.findMany({
        where: { userId: user.id },
        orderBy: { addedAt: 'desc' },
        take: 100,
        select: { artist: true },
      }),
    ])

    // Weight artists: history (recent = stronger) + favorites
    const weight = new Map<string, number>()
    history.forEach((h, i) => {
      const a = h.artist?.trim()
      if (!a || /^unknown/i.test(a)) return
      weight.set(a, (weight.get(a) ?? 0) + Math.max(1, 20 - i) / 20)
    })
    for (const f of favorites) {
      const a = f.artist?.trim()
      if (!a || /^unknown/i.test(a)) continue
      weight.set(a, (weight.get(a) ?? 0) + 2)
    }

    const topArtists = [...weight.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([a]) => a)

    if (topArtists.length === 0) {
      const out = { sections: [] as ForYouSection[] }
      return NextResponse.json(out)
    }

    const results = await Promise.allSettled(
      topArtists.map(async (artist) => {
        const items = await ytMusicSearch(`${artist} songs`)
        return {
          title: `Because you listen to ${artist}`,
          items: items.filter((it) => it.id).slice(0, 12),
        }
      })
    )

    const sections = results
      .filter(
        (r): r is PromiseFulfilledResult<ForYouSection> =>
          r.status === 'fulfilled' && r.value.items.length > 0
      )
      .map((r) => r.value)

    const out = { sections }
    // Q1.3 — empty result + open breaker → stale cache with honest banner.
    if (sections.length === 0) {
      const open = openBreaker(['ytmusic', 'piped'])
      if (open) {
        const stale = cacheGetStale<{ sections: ForYouSection[] }>(cacheKey)
        const degraded = degradedNotice(UPSTREAM_LABELS[open] ?? open)
        if (stale) return NextResponse.json({ ...stale, degraded })
        return NextResponse.json({ ...out, degraded })
      }
    }
    cacheSet(cacheKey, out, TTL)
    return NextResponse.json(out)
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to build recommendations', {
      status: 500,
      sections: [],
    })
  }
}
