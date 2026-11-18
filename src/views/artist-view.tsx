'use client'
/* Artist page (Day 29) + album/singles grouping (Day 30).
 *
 * Header with iTunes-enriched artwork + genre, Tabs:
 *   - Top tracks: playable YouTube Music results
 *   - Albums & singles: iTunes discography grouped by collection; tapping an
 *     album resolves its track list into playable rows
 *   - On Audius: direct-stream catalog overlap
 * Related-artist chips are derived from the top-track bylines.
 */
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Disc3, Loader2, Music2, Play } from 'lucide-react'
import { TrackRow, TrackImage } from '@/components/track-row'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useUi } from '@/store/ui'
import { usePlayer } from '@/store/player'
import type { MusicItem } from '@/lib/types'
import { cn } from '@/lib/utils'

interface ArtistAlbum {
  name: string
  artwork: string | null
  year: string | null
  trackCount: number
  kind: 'album' | 'single' | 'ep' | 'compilation'
}

interface ArtistData {
  name: string
  image: string | null
  genre: string | null
  itunesFound: boolean
  albums: ArtistAlbum[]
  top: MusicItem[]
  audius: MusicItem[]
}

function AlbumCard({
  album,
  onOpen,
  openName,
  loadingName,
  children,
}: {
  album: ArtistAlbum
  onOpen: () => void
  openName: string | null
  loadingName: string | null
  children?: React.ReactNode
}) {
  const isOpen = openName === album.name
  return (
    <div className="mb-4">
      <button
        onClick={onOpen}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors',
          isOpen ? 'border-primary/60 bg-accent/50' : 'hover:bg-accent/40'
        )}
        aria-expanded={isOpen}
      >
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
          {album.artwork ? (
            <img src={album.artwork} alt={album.name} loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Disc3 className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
          {loadingName === album.name && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Loader2 className="h-5 w-5 animate-spin text-white" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{album.name.replace(/\s*[-–]\s*(EP|Single)$/i, '')}</p>
          <p className="text-xs text-muted-foreground">
            {album.kind === 'album' ? 'Album' : album.kind === 'single' ? 'Single' : album.kind === 'ep' ? 'EP' : 'Compilation'}
            {album.trackCount > 0 && ` · ${album.trackCount} songs`}
            {album.year && ` · ${album.year}`}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-[11px] font-medium">
          {isOpen ? 'Hide' : 'Play'}
        </span>
      </button>
      {isOpen && (
        <div className="mt-2 space-y-1 pl-2">
          {children ?? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              No playable streams found for this album right now.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export function ArtistView() {
  const artistName = useUi((s) => s.artistName)
  const closeArtist = useUi((s) => s.closeArtist)
  const openArtist = useUi((s) => s.openArtist)
  const playItem = usePlayer((s) => s.playItem)
  const [data, setData] = useState<ArtistData | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  // album expansion state
  const [openAlbum, setOpenAlbum] = useState<string | null>(null)
  const [albumLoading, setAlbumLoading] = useState<string | null>(null)
  const [albumItems, setAlbumItems] = useState<Record<string, MusicItem[]>>({})

  const load = useCallback(async (name: string) => {
    setLoading(true)
    setFailed(false)
    setData(null)
    setOpenAlbum(null)
    setAlbumItems({})
    try {
      const res = await fetch(`/api/artist?name=${encodeURIComponent(name)}`)
      if (!res.ok) throw new Error()
      const d = (await res.json()) as ArtistData
      setData(d)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (artistName) void load(artistName)
  }, [artistName, load])

  const openAlbumTracks = async (album: ArtistAlbum) => {
    if (!data) return
    if (openAlbum === album.name) {
      setOpenAlbum(null)
      return
    }
    setOpenAlbum(album.name)
    if (albumItems[album.name]) return // cached from a previous expansion
    setAlbumLoading(album.name)
    try {
      const res = await fetch(
        `/api/artist/album?artist=${encodeURIComponent(data.name)}&album=${encodeURIComponent(album.name)}`
      )
      const d = (await res.json()) as { items?: MusicItem[] }
      setAlbumItems((prev) => ({ ...prev, [album.name]: d.items ?? [] }))
    } catch {
      setAlbumItems((prev) => ({ ...prev, [album.name]: [] }))
    } finally {
      setAlbumLoading(null)
    }
  }

  if (!artistName) return null

  const related = data
    ? [...new Set(data.top.map((t) => t.artist).filter((a) => a && a.toLowerCase() !== data.name.toLowerCase()))]
        .map((a) => a.replace(/\s*-\s*Topic$/i, '').trim())
        .filter((a) => a.length > 1 && !/^unknown/i.test(a))
        .slice(0, 8)
    : []

  return (
    <div className="px-4 sm:px-6 py-4">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
        <Button variant="ghost" size="icon" onClick={closeArtist} aria-label="Back" className="self-start">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex flex-1 items-center gap-4">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-muted shadow-lg shadow-primary/10 sm:h-24 sm:w-24">
            {data?.image ? (
              <img src={data.image} alt={data.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Music2 className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Artist</p>
            <h1 className="truncate text-2xl font-extrabold tracking-tight sm:text-3xl">{artistName}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {data?.genre && (
                <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium">{data.genre}</span>
              )}
              {data && (
                <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] text-muted-foreground">
                  {data.itunesFound ? 'discography via iTunes' : 'top tracks via YouTube Music'}
                  {data.audius.length > 0 && ' · Audius catalog too'}
                </span>
              )}
            </div>
          </div>
        </div>
        {data && data.top.length > 0 && (
          <Button
            className="rounded-full gap-1.5 self-start sm:self-center"
            onClick={() => playItem(data.top[0], data.top)}
          >
            <Play className="h-4 w-4 fill-current" /> Play top tracks
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-accent/40" />
          ))}
        </div>
      ) : failed ? (
        <div className="rounded-xl bg-accent/40 p-8 text-center">
          <Music2 className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <p className="font-medium">Could not load this artist</p>
          <p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p>
        </div>
      ) : (
        <>
          {/* Related artists (derived from the top-track bylines) */}
          {related.length > 0 && (
            <div className="mb-5 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground mr-1">Related:</span>
              {related.map((r) => (
                <button
                  key={r}
                  onClick={() => openArtist(r)}
                  className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {r}
                </button>
              ))}
            </div>
          )}

          <Tabs defaultValue="top">
            <TabsList className="grid w-full max-w-md grid-cols-3">
              <TabsTrigger value="top">Top tracks</TabsTrigger>
              <TabsTrigger value="albums">Albums &amp; singles</TabsTrigger>
              <TabsTrigger value="audius">On Audius</TabsTrigger>
            </TabsList>

            <TabsContent value="top" className="mt-4">
              {data!.top.length === 0 ? (
                <div className="rounded-xl bg-accent/40 p-8 text-center">
                  <Music2 className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                  <p className="font-medium">No playable top tracks found</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Try the Albums tab, or search for this artist in Explore.
                  </p>
                </div>
              ) : (
                data!.top.map((item, i) => <TrackRow key={item.id} item={item} index={i} context={data!.top} showViews />)
              )}
            </TabsContent>

            <TabsContent value="albums" className="mt-4">
              {data!.albums.length === 0 ? (
                <div className="rounded-xl bg-accent/40 p-8 text-center">
                  <Disc3 className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                  <p className="font-medium">No discography data</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    iTunes did not return an album list for this name.
                  </p>
                </div>
              ) : (
                data!.albums.map((album) => {
                  const items = albumItems[album.name]
                  return (
                    <AlbumCard
                      key={album.name}
                      album={album}
                      openName={openAlbum}
                      loadingName={albumLoading}
                      onOpen={() => void openAlbumTracks(album)}
                    >
                      {items && items.length > 0 ? (
                        <>
                          {items.slice(0, 10).map((item, i) => (
                            <TrackRow key={item.id} item={item} index={i} context={items} />
                          ))}
                          {items.length > 10 && (
                            <p className="px-2 py-1 text-[11px] text-muted-foreground">
                              +{items.length - 10} more playable matches for this album
                            </p>
                          )}
                        </>
                      ) : items ? (
                        <p className="px-2 py-3 text-xs text-muted-foreground">
                          No playable streams found for this album right now.
                        </p>
                      ) : null}
                    </AlbumCard>
                  )
                })
              )}
            </TabsContent>

            <TabsContent value="audius" className="mt-4">
              {data!.audius.length === 0 ? (
                <div className="rounded-xl bg-accent/40 p-8 text-center">
                  <Music2 className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                  <p className="font-medium">Not on Audius (or nothing matched)</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Audius hosts independent artists — mainstream catalogs usually aren&apos;t there.
                  </p>
                </div>
              ) : (
                data!.audius.map((item, i) => <TrackRow key={item.id} item={item} index={i} context={data!.audius} />)
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}
