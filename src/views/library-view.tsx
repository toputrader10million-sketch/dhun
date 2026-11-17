'use client'
import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  Heart,
  History,
  ListMusic,
  Loader2,
  Music4,
  Plus,
  Trash2,
} from 'lucide-react'
import { TrackRow, TrackImage } from '@/components/track-row'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import type { MusicItem, PlaylistDetail } from '@/lib/types'
import { useLibrary } from '@/store/library'
import { usePlayer } from '@/store/player'
import { formatDuration } from '@/lib/format'

export function LibraryView() {
  const { favorites, history, playlists, loadAll, clearHistory, deletePlaylist } = useLibrary()
  const playItem = usePlayer((s) => s.playItem)
  const [openPlaylist, setOpenPlaylist] = useState<PlaylistDetail | null>(null)
  const [playlistLoading, setPlaylistLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const createPlaylist = useLibrary((s) => s.createPlaylist)
  const getPlaylistDetail = useLibrary((s) => s.getPlaylistDetail)
  const removeFromPlaylist = useLibrary((s) => s.removeFromPlaylist)
  const refreshPlaylists = useLibrary((s) => s.refreshPlaylists)

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const favoriteItems: MusicItem[] = favorites.map((f) => ({
    id: f.trackId,
    title: f.title,
    artist: f.artist,
    artwork: f.artwork || '',
    duration: f.duration,
  }))
  const historyItems: MusicItem[] = history.map((h) => ({
    id: h.trackId,
    title: h.title,
    artist: h.artist,
    artwork: h.artwork || '',
    duration: h.duration,
  }))

  const showDetail = async (id: string) => {
    setPlaylistLoading(true)
    setOpenPlaylist(null)
    const d = await getPlaylistDetail(id)
    setOpenPlaylist(d)
    setPlaylistLoading(false)
  }

  if (openPlaylist) {
    return (
      <div className="px-4 sm:px-6 py-4">
        <div className="mb-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setOpenPlaylist(null)} aria-label="Back to library">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          {openPlaylist.cover ? (
            <TrackImage item={{ artwork: openPlaylist.cover, title: openPlaylist.name }} className="h-12 w-12" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-accent">
              <ListMusic className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold">{openPlaylist.name}</h2>
            <p className="text-xs text-muted-foreground">{openPlaylist.count} songs</p>
          </div>
          {openPlaylist.items.length > 0 && (
            <Button
              size="sm"
              className="rounded-full"
              onClick={() => playItem(openPlaylist.items[0] as MusicItem, openPlaylist.items as MusicItem[])}
            >
              Play all
            </Button>
          )}
        </div>
        {openPlaylist.items.length === 0 ? (
          <div className="rounded-xl bg-accent/40 p-8 text-center">
            <Music4 className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
            <p className="text-sm font-medium">This playlist is empty</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Use the ⋮ menu on any song → “Add to playlist”.
            </p>
          </div>
        ) : (
          openPlaylist.items.map((it, i) => {
            const item: MusicItem = {
              id: it.trackId,
              title: it.title,
              artist: it.artist,
              artwork: it.artwork || '',
              duration: it.duration,
            }
            return (
              <TrackRow
                key={it.id}
                item={item}
                index={i}
                context={openPlaylist.items.map((x) => ({
                  id: x.trackId,
                  title: x.title,
                  artist: x.artist,
                  artwork: x.artwork || '',
                  duration: x.duration,
                }))}
                onRemove={() => {
                  removeFromPlaylist(openPlaylist.id, it.id)
                  setOpenPlaylist({
                    ...openPlaylist,
                    items: openPlaylist.items.filter((x) => x.id !== it.id),
                    count: openPlaylist.count - 1,
                  })
                }}
              />
            )
          })
        )}
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-6 py-4">
      <h1 className="text-2xl font-extrabold tracking-tight mb-4">Your Library</h1>
      <Tabs defaultValue="favorites" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="favorites" className="gap-1.5">
            <Heart className="h-3.5 w-3.5" /> Favorites
            {favorites.length > 0 && <span className="text-[10px] opacity-70">({favorites.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="playlists" className="gap-1.5">
            <ListMusic className="h-3.5 w-3.5" /> Playlists
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <History className="h-3.5 w-3.5" /> History
          </TabsTrigger>
        </TabsList>

        {/* Favorites */}
        <TabsContent value="favorites" className="mt-4">
          {!useLibrary.getState().loaded ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-xl" />
              ))}
            </div>
          ) : favorites.length === 0 ? (
            <div className="rounded-xl bg-accent/40 p-8 text-center">
              <Heart className="mx-auto h-6 w-6 text-primary mb-2" />
              <p className="font-medium">No favorites yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Tap the ♥ on any song (or in the ⋮ menu) to save it here.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{favorites.length} saved songs</p>
                <Button size="sm" className="rounded-full" onClick={() => playItem(favoriteItems[0], favoriteItems)}>
                  Play all
                </Button>
              </div>
              {favoriteItems.map((item, i) => (
                <TrackRow key={item.id} item={item} index={i} context={favoriteItems} />
              ))}
            </>
          )}
        </TabsContent>

        {/* Playlists */}
        <TabsContent value="playlists" className="mt-4">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{playlists.length} playlists</p>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="rounded-full gap-1.5">
                  <Plus className="h-4 w-4" /> New playlist
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>Create playlist</DialogTitle>
                </DialogHeader>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Playlist name"
                  aria-label="Playlist name"
                />
                <Button
                  onClick={async () => {
                    if (!newName.trim()) return
                    await createPlaylist(newName.trim())
                    setNewName('')
                    setCreateOpen(false)
                  }}
                >
                  Create
                </Button>
              </DialogContent>
            </Dialog>
          </div>
          {playlists.length === 0 ? (
            <div className="rounded-xl bg-accent/40 p-8 text-center">
              <ListMusic className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
              <p className="font-medium">No playlists yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Create your first playlist above.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {playlists.map((p) => (
                <div key={p.id} className="group relative">
                  <button className="w-full text-left" onClick={() => showDetail(p.id)}>
                    <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-accent">
                      {p.cover ? (
                        <TrackImage item={{ artwork: p.cover, title: p.name }} className="h-full w-full" rounded="rounded-xl" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <ListMusic className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <p className="mt-2 truncate text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.count} songs</p>
                  </button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        className="absolute right-2 top-2 rounded-full bg-background/80 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label={`Delete playlist ${p.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete “{p.name}”?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This removes the playlist and its {p.count} songs from your library.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-white hover:bg-destructive/90"
                          onClick={() => deletePlaylist(p.id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* History */}
        <TabsContent value="history" className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Recently played</p>
            {history.length > 0 && (
              <Button variant="ghost" size="sm" className="text-destructive" onClick={clearHistory}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Clear
              </Button>
            )}
          </div>
          {history.length === 0 ? (
            <div className="rounded-xl bg-accent/40 p-8 text-center">
              <History className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
              <p className="font-medium">Nothing played yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Your listening history will appear here.</p>
            </div>
          ) : (
            historyItems.map((item, i) => (
              <TrackRow key={`${item.id}-${i}`} item={item} context={historyItems} />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
