import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api'
import { cacheGet, cacheSet } from '@/lib/piped'
import { ytMusicSearch } from '@/lib/ytmusic'
import type { MusicItem } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* Day 30 — Album/singles grouping: resolve an iTunes catalog album into
 * PLAYABLE tracks. The iTunes listing (cached by /api/artist) gives the real
 * track names; each song is resolved against YouTube Music with bounded
 * concurrency so every row the user taps actually plays. Falls back to one
 * broad album search when the track list is unavailable. Cached 1h. */
const TTL = 60 * 60 * 1000

interface ArtistCacheShape {
  albumTracks?: Record<string, Array<{ title: string }>>
}

async function resolveSong(artist: string, song: string, seen: Set<string>): Promise<MusicItem | null> {
  try {
    const results = await ytMusicSearch(`${artist} ${song}`, 8000)
    const usable = results.filter(
      (x) =>
        x.duration === 0 ||
        (x.duration >= 30 && x.duration <= 900)
    )
    const hit =
      usable.find((x) => !seen.has(x.id) && x.title.toLowerCase().includes(song.toLowerCase().slice(0, 12))) ??
      usable[0]
    if (hit && !seen.has(hit.id)) {
      seen.add(hit.id)
      return hit
    }
  } catch {
    /* one song failing must not kill the album */
  }
  return null
}

export async function GET(req: NextRequest) {
  const artist = (req.nextUrl.searchParams.get('artist') ?? '').trim()
  const album = (req.nextUrl.searchParams.get('album') ?? '').trim()
  if (!artist || !album) {
    return apiError('Missing "artist" or "album"', { status: 400 })
  }

  const key = `album:${artist.toLowerCase()}:${album.toLowerCase()}`
  const cached = cacheGet<{ items: MusicItem[] }>(key)
  if (cached) return NextResponse.json(cached)

  // Album name often carries "- Single"/"- EP" suffixes — strip them for search.
  const cleanAlbum = album.replace(/\s*[-–]\s*(single|ep)$/i, '').trim()

  // Preferred path: resolve the album's own track list (iTunes enrichment).
  const artistCached = cacheGet<ArtistCacheShape>(`artist:${artist.toLowerCase()}`)
  const trackNames = artistCached?.albumTracks?.[album]?.map((t) => t.title).filter(Boolean) ?? []

  const items: MusicItem[] = []
  const seen = new Set<string>()

  if (trackNames.length >= 3) {
    // Bounded concurrency: 4 at a time, max 14 songs.
    const queue = trackNames.slice(0, 14)
    const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
      for (;;) {
        const song = queue.shift()
        if (!song) break
        const hit = await resolveSong(artist, song, seen)
        if (hit) items.push(hit)
      }
    })
    await Promise.all(workers)
    // Keep the album's original order as much as possible: sort items by the
    // position of their matching track name.
    items.sort((a, b) => {
      const ia = trackNames.findIndex((t) => a.title.toLowerCase().includes(t.toLowerCase().slice(0, 12)))
      const ib = trackNames.findIndex((t) => b.title.toLowerCase().includes(t.toLowerCase().slice(0, 12)))
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })
  }

  if (items.length < 3) {
    // Broad album search fallback.
    try {
      const broad = await ytMusicSearch(`${artist} ${cleanAlbum}`, 9000)
      const usable = broad.filter((x) => x.duration === 0 || x.duration <= 900)
      for (const x of usable) {
        if (!seen.has(x.id)) {
          items.push(x)
          seen.add(x.id)
        }
      }
    } catch {
      /* keep whatever we have */
    }
  }

  items.slice(0, 25)
  cacheSet(key, { items }, TTL)
  return NextResponse.json({ items, album: cleanAlbum, artist })
}
