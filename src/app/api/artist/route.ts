import { NextRequest, NextResponse } from 'next/server'
import { cacheGet, cacheSet } from '@/lib/piped'
import { ytMusicSearch } from '@/lib/ytmusic'
import { searchTracks } from '@/lib/audius'
import type { MusicItem } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* Day 29+30 — Artist page data: iTunes enrichment for real albums/singles
 * + playable top tracks from YouTube Music + Audius catalog overlap.
 *
 * iTunes gives us structured discography (collectionName groups) and clean
 * artist artwork — things the YouTube search alone can't provide.
 * Everything is cached for 30 min; every upstream failure degrades
 * independently so the page is never empty while one source is down.
 */

const TTL = 30 * 60 * 1000

export interface ArtistAlbum {
  name: string
  artwork: string | null
  year: string | null
  trackCount: number
  kind: 'album' | 'single' | 'ep' | 'compilation'
}

export interface ArtistResponse {
  name: string
  image: string | null
  genre: string | null
  itunesFound: boolean
  albums: ArtistAlbum[]
  /** Grouped discography: collectionName → its songs (max 8 albums, 12 songs each) */
  albumTracks: Record<string, MusicItem[]>
  top: MusicItem[]
  audius: MusicItem[]
}

interface ItunesSong {
  wrapperType?: string
  kind?: string
  trackId?: number
  trackName?: string
  artistName?: string
  collectionName?: string
  artworkUrl100?: string
  releaseDate?: string
  trackTimeMillis?: number
  primaryGenreName?: string
  collectionType?: string
}

function upscaleArt(url?: string): string | null {
  if (!url) return null
  return url.replace(/\/100x100\b/, '/600x600')
}

function mapItunesSong(s: ItunesSong): MusicItem | null {
  if (!s.trackName || !s.artistName) return null
  return {
    id: `it:${s.trackId ?? 0}:${s.trackName}`,
    title: s.trackName,
    artist: s.artistName,
    artwork: upscaleArt(s.artworkUrl100) ?? '',
    duration: s.trackTimeMillis ? Math.round(s.trackTimeMillis / 1000) : 0,
    album: s.collectionName ?? undefined,
    year: s.releaseDate?.slice(0, 4),
  }
}

async function itunesLookup(name: string): Promise<{
  found: boolean
  image: string | null
  genre: string | null
  albums: ArtistAlbum[]
  albumTracks: Record<string, MusicItem[]>
} | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    // 1) find the artist id
    const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=musicArtist&limit=1`
    const sRes = await fetch(searchUrl, { signal: ctrl.signal, cache: 'no-store' })
    if (!sRes.ok) return null
    const sData = (await sRes.json()) as { results?: Array<{ artistId?: number; artistName?: string }> }
    const artist = sData.results?.[0]
    if (!artist?.artistId) return null

    // 2) songs grouped by collection
    const lookUrl = `https://itunes.apple.com/lookup?id=${artist.artistId}&entity=song&limit=100`
    const lRes = await fetch(lookUrl, { signal: ctrl.signal, cache: 'no-store' })
    if (!lRes.ok) return null
    const lData = (await lRes.json()) as { results?: ItunesSong[] }
    const songs = (lData.results ?? []).filter((r) => r.wrapperType === 'track' && r.kind === 'song')

    const groups = new Map<string, { artwork: string | null; year: string | null; count: number; tracks: MusicItem[] }>()
    for (const s of songs) {
      const coll = (s.collectionName ?? '').trim()
      if (!coll) continue
      const g = groups.get(coll) ?? {
        artwork: upscaleArt(s.artworkUrl100),
        year: s.releaseDate?.slice(0, 4) ?? null,
        count: 0,
        tracks: [],
      }
      g.count++
      if (g.tracks.length < 12) {
        const mapped = mapItunesSong(s)
        if (mapped) g.tracks.push(mapped)
      }
      groups.set(coll, g)
    }

    // Classify albums vs singles/EPs by track count
    const albums: ArtistAlbum[] = [...groups.entries()]
      .sort((a, b) => (b[1].year ?? '').localeCompare(a[1].year ?? ''))
      .slice(0, 12)
      .map(([n, g]) => ({
        name: n,
        artwork: g.artwork,
        year: g.year,
        trackCount: g.count,
        kind:
          g.count >= 7
            ? 'album'
            : /- (EP|Single)$/i.test(n)
              ? /EP$/i.test(n)
                ? 'ep'
                : 'single'
              : g.count <= 2
                ? 'single'
                : 'ep',
      }))

    const albumTracks: Record<string, MusicItem[]> = {}
    for (const [n, g] of groups) albumTracks[n] = g.tracks

    return {
      found: true,
      image: upscaleArt(songs[0]?.artworkUrl100),
      genre: songs[0]?.primaryGenreName ?? null,
      albums,
      albumTracks,
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function GET(req: NextRequest) {
  const name = (req.nextUrl.searchParams.get('name') ?? '').trim()
  if (!name) {
    return NextResponse.json({ error: 'Missing "name"' }, { status: 400 })
  }
  const key = `artist:${name.toLowerCase()}`
  const cached = cacheGet<ArtistResponse>(key)
  if (cached) return NextResponse.json(cached)

  // Independent sources — each failure degrades on its own
  const [itunes, yt, au] = await Promise.allSettled([
    itunesLookup(name),
    ytMusicSearch(`${name} songs`),
    searchTracks(name, 12),
  ])

  const it = itunes.status === 'fulfilled' ? itunes.value : null
  const ytItems = yt.status === 'fulfilled' ? yt.value.filter((x) => x.duration === 0 || x.duration <= 900) : []
  const auItems =
    au.status === 'fulfilled'
      ? au.value.filter((x) => x.artist.toLowerCase() === name.toLowerCase() || x.title.toLowerCase().includes(name.toLowerCase()))
      : []

  // Top tracks must be PLAYABLE — only YouTube Music results are real video ids.
  // (iTunes rows are catalog metadata used for the discography grouping above.)
  const top = ytItems.slice(0, 15)

  const out: ArtistResponse = {
    name,
    image: it?.image ?? ytItems[0]?.artwork ?? null,
    genre: it?.genre ?? null,
    itunesFound: Boolean(it?.found),
    albums: it?.albums ?? [],
    albumTracks: it?.albumTracks ?? {},
    top,
    audius: auItems.slice(0, 12),
  }
  cacheSet(key, out, TTL)
  return NextResponse.json(out)
}
