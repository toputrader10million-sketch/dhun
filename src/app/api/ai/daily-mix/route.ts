import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrCreateUser } from '@/lib/user'
import { ytMusicSearch } from '@/lib/ytmusic'
import { trendingTracks } from '@/lib/audius'
import { cacheGet, cacheSet } from '@/lib/piped'
import type { MusicItem } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TTL = 60 * 60 * 1000 // refresh hourly — a "daily" mix you can come back to

export interface DailyMix {
  title: string
  description: string
  items: MusicItem[]
  builtFrom: string[]
}

/**
 * AI DJ foundation (Day 15): compose ONE personalised "Daily Mix" from the
 * user's real listening data.
 *
 * Recipe:
 *   1. Weight recent history (recency-weighted) + favorites → top artists.
 *   2. Two seeds per artist: their own songs + a "similar songs" discovery query.
 *   3. Interleave, dedupe, shuffle → a 25–30 track mix that feels personal but
 *      still surfaces new music.
 *   4. No listening data yet → fall back to cross-source trending so the
 *      feature is never empty.
 */
export async function GET() {
  try {
    const user = await getOrCreateUser()

    const cacheKey = `daily-mix:${user.id}`
    const cached = cacheGet<{ mix: DailyMix | null }>(cacheKey)
    if (cached) return NextResponse.json(cached)

    const [history, favorites] = await Promise.all([
      db.historyEntry.findMany({
        where: { userId: user.id },
        orderBy: { playedAt: 'desc' },
        take: 60,
        select: { artist: true, title: true },
      }),
      db.favorite.findMany({
        where: { userId: user.id },
        orderBy: { addedAt: 'desc' },
        take: 100,
        select: { artist: true },
      }),
    ])

    const weight = new Map<string, number>()
    history.forEach((h, i) => {
      const a = h.artist?.trim()
      if (!a || /^unknown/i.test(a)) return
      weight.set(a, (weight.get(a) ?? 0) + Math.max(1, 30 - i) / 30)
    })
    for (const f of favorites) {
      const a = f.artist?.trim()
      if (!a || /^unknown/i.test(a)) continue
      weight.set(a, (weight.get(a) ?? 0) + 2)
    }

    const topArtists = [...weight.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([a]) => a)

    let items: MusicItem[] = []
    const builtFrom: string[] = []

    if (topArtists.length > 0) {
      builtFrom.push(...topArtists)
      const results = await Promise.allSettled(
        topArtists.flatMap((artist) => [
          ytMusicSearch(`${artist} songs`),
          ytMusicSearch(`${artist} similar songs artists`),
        ])
      )
      const pools: MusicItem[][] = results.map((r) =>
        r.status === 'fulfilled' ? r.value.filter((it) => it.id && it.duration <= 900) : []
      )
      // Interleave artist pools so the mix alternates artists instead of
      // dumping one artist's 16 tracks in a row.
      const maxLen = Math.max(...pools.map((p) => p.length), 0)
      for (let i = 0; i < maxLen && items.length < 34; i++) {
        for (const pool of pools) {
          const it = pool[i]
          if (it && items.length < 34) items.push(it)
        }
      }
    }

    // Not enough personal data (or every artist search failed) → trending mix.
    if (items.length < 8) {
      builtFrom.push('trending')
      const [ytTrend, auTrend] = await Promise.allSettled([
        ytMusicSearch('top hits this week'),
        trendingTracks(15),
      ])
      if (ytTrend.status === 'fulfilled') items.push(...ytTrend.value)
      if (auTrend.status === 'fulfilled') {
        const au = auTrend.value.map((x) => ({ ...x, source: 'au' as const }))
        items.push(...au)
      }
    }

    // Dedupe by id+source, drop the worst outliers (talk shows, megamixes)
    const seen = new Set<string>()
    const unique = items.filter((it) => {
      const k = `${it.source ?? 'yt'}:${it.id}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    const usable = unique.filter((it) => it.duration === 0 || (it.duration >= 90 && it.duration <= 900))

    // Fisher–Yates shuffle for the "surprise me" feel
    const mix = [...usable]
    for (let i = mix.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[mix[i], mix[j]] = [mix[j], mix[i]]
    }
    const finalItems = mix.slice(0, 28)

    const out = {
      mix:
        finalItems.length >= 5
          ? {
              title: 'Daily Mix',
              description:
                topArtists.length > 0
                  ? `Personal mix from your listening — refreshed hourly`
                  : 'Trending picks to get you started — the more you listen, the smarter it gets',
              items: finalItems,
              builtFrom,
            }
          : null,
    }
    cacheSet(cacheKey, out, TTL)
    return NextResponse.json(out)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to build daily mix', mix: null },
      { status: 500 }
    )
  }
}
