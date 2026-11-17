import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrCreateUser } from '@/lib/user'
import { ytMusicSearch } from '@/lib/ytmusic'
import { cacheGet, cacheSet } from '@/lib/piped'
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
    cacheSet(cacheKey, out, TTL)
    return NextResponse.json(out)
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Failed to build recommendations',
        sections: [],
      },
      { status: 500 }
    )
  }
}
