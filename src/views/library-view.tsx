'use client'
import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Check,
  ClipboardPaste,
  Copy,
  FileDown,
  FileUp,
  Heart,
  History,
  Link2,
  Link2Off,
  ListMusic,
  Loader2,
  MoreVertical,
  Music4,
  Plus,
  Trash2,
  Download,
  HardDrive,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { EmptyState } from '@/components/empty-state'
import type { MusicItem, PlaylistDetail } from '@/lib/types'
import { useLibrary } from '@/store/library'
import { usePlayer } from '@/store/player'
import { useOffline } from '@/store/offline'
import { formatDuration } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { AiPlaylistDialog } from '@/components/ai-playlist-dialog'
import { encodePlaylistCode, decodePlaylistCode, exportPlaylistFile, type PlaylistExport } from '@/lib/playlist-code'

/** Day 34 — create / copy / revoke a public read-only share link for a playlist */
function ShareLinkDialog({
  playlistId,
  playlistName,
  open,
  onOpenChange,
}: {
  playlistId: string
  playlistName: string
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const t = useT()
  const [token, setToken] = useState<string | null>(null)
  const [views, setViews] = useState<number | null>(null)
  const [busy, setBusy] = useState<'create' | 'revoke' | null>(null)
  const [copied, setCopied] = useState(false)

  const mint = async () => {
    setBusy('create')
    try {
      const res = await fetch(`/api/playlists/${playlistId}/share`, { method: 'POST' })
      const body = (await res.json()) as { token?: string; views?: number; error?: string }
      if (!res.ok || !body.token) throw new Error(body.error ?? 'Failed')
      setToken(body.token)
      setViews(body.views ?? 0)
      toast.success(t('Public link ready'), { description: t('Anyone with the link can view — read-only.') })
    } catch {
      toast.error(t('Could not create the link — try again'))
    } finally {
      setBusy(null)
    }
  }

  const revoke = async () => {
    setBusy('revoke')
    try {
      const res = await fetch(`/api/playlists/${playlistId}/share`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setToken(null)
      setViews(null)
      toast.success(t('Link revoked'), { description: t('The old URL no longer works.') })
    } catch {
      toast.error(t('Could not revoke — try again'))
    } finally {
      setBusy(null)
    }
  }

  const url = token ? `${typeof window !== 'undefined' ? window.location.origin : ''}/?p=${token}` : ''

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setCopied(false) }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('Public link — {0}', [playlistName])}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          {t('A read-only web link anyone can open — no account needed. Viewers can play the tracks or save their own copy. Your account stays private.')}
        </p>
        {token ? (
          <>
            <div className="rounded-xl bg-accent/40 p-3">
              <p className="break-all font-mono text-xs select-all" aria-label="Share URL">{url}</p>
              {views !== null && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">{t('{0} opens so far', [views])}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                className="rounded-full gap-1.5"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(url)
                    setCopied(true)
                    toast.success(t('Link copied'))
                  } catch {
                    toast.error(t('Copy failed — select the link manually'))
                  }
                }}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? t('Copied') : t('Copy link')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-full gap-1.5"
                disabled={busy === 'revoke'}
                onClick={() => void revoke()}
              >
                {busy === 'revoke' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2Off className="h-4 w-4" />}
                {t('Revoke link')}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t('The link always reflects the playlist as it is right now. Revoking breaks the URL immediately.')}
            </p>
          </>
        ) : (
          <Button className="gap-1.5" disabled={busy === 'create'} onClick={() => void mint()}>
            {busy === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            {t('Create public link')}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Day 27 — import a playlist from a DHUN1 share code or a JSON export file */
function ImportPlaylistDialog() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [preview, setPreview] = useState<PlaylistExport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setCode('')
    setPreview(null)
    setError(null)
    setImporting(false)
  }

  const analyze = (text: string) => {
    setCode(text)
    setError(null)
    setPreview(null)
    if (!text.trim()) return
    const res = decodePlaylistCode(text)
    if (res.ok && res.data) setPreview(res.data)
    else setError(res.error ?? 'Invalid code')
  }

  const runImport = async () => {
    if (!preview) return
    setImporting(true)
    try {
      const createRes = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: preview.name, description: preview.description ?? undefined }),
      })
      if (!createRes.ok) throw new Error()
      const { id } = (await createRes.json()) as { id: string }
      let added = 0
      for (const item of preview.items) {
        try {
          const res = await fetch(`/api/playlists/${id}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item),
          })
          if (res.ok) added++
        } catch {}
      }
      toast.success(t('Imported "{0}"', [preview.name]), { description: t('{0}/{1} songs added.', [added, preview.items.length]) })
      setOpen(false)
      reset()
      useLibrary.getState().refreshPlaylists()
    } catch {
      toast.error(t('Import failed — could not create the playlist'))
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-full gap-1.5">
          <FileUp className="h-4 w-4" /> {t('Import')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('Import playlist')}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          {t('Paste a Dhun share code (DHUN1…) or open a .dhun.json export file. The playlist is recreated on your account — nothing is overwritten.')}
        </p>
        <Textarea
          value={code}
          onChange={(e) => analyze(e.target.value)}
          placeholder="DHUN1.xxxxxxxxxxxx"
          className="min-h-24 font-mono text-xs"
          aria-label="Share code"
        />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => fileRef.current?.click()}>
            <FileUp className="h-3.5 w-3.5" /> {t('Open file…')}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (file) analyze(await file.text())
              e.target.value = ''
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="rounded-full gap-1.5"
            onClick={async () => {
              try {
                const text = await navigator.clipboard.readText()
                analyze(text)
              } catch {
                toast.error(t('Clipboard read blocked — paste manually'))
              }
            }}
          >
            <ClipboardPaste className="h-3.5 w-3.5" /> {t('Paste')}
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        {preview && (
          <div className="rounded-xl bg-accent/40 p-3">
            <p className="text-sm font-medium">{preview.name}</p>
            <p className="text-xs text-muted-foreground">
              {t('{0} songs', [preview.items.length])}
              {preview.items[0] && ` — ${t('starts with "{0}"', [preview.items[0].title.slice(0, 30)])}`}
            </p>
          </div>
        )}
        <Button disabled={!preview || importing} onClick={runImport} className="gap-1.5">
          {importing && <Loader2 className="h-4 w-4 animate-spin" />}
          {importing ? t('Importing…') : preview ? t('Import {0} songs', [preview.items.length]) : t('Import')}
        </Button>
      </DialogContent>
    </Dialog>
  )
}

export function LibraryView() {
  const t = useT()
  const { favorites, history, playlists, loadAll, clearHistory, deletePlaylist } = useLibrary()
  const playItem = usePlayer((s) => s.playItem)
  const offlineItems = useOffline((s) => s.items)
  const offlineProgress = useOffline((s) => s.progress)
  const offlineHydrated = useOffline((s) => s.hydrated)
  const offlineRemove = useOffline((s) => s.remove)
  const offlineClear = useOffline((s) => s.clearAll)
  const offlineTotal = useOffline((s) => s.totalSize())
  const [openPlaylist, setOpenPlaylist] = useState<PlaylistDetail | null>(null)
  const [playlistLoading, setPlaylistLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const createPlaylist = useLibrary((s) => s.createPlaylist)
  const getPlaylistDetail = useLibrary((s) => s.getPlaylistDetail)
  const removeFromPlaylist = useLibrary((s) => s.removeFromPlaylist)
  const refreshPlaylists = useLibrary((s) => s.refreshPlaylists)
  const [exportMenu, setExportMenu] = useState(false)
  const [shareLinkOpen, setShareLinkOpen] = useState(false)

  useEffect(() => {
    loadAll()
    useOffline.getState().hydrate()
  }, [loadAll])

  const favoriteItems: MusicItem[] = favorites.map((f) => ({
    id: f.trackId,
    title: f.title,
    artist: f.artist,
    artwork: f.artwork || '',
    duration: f.duration,
    source: f.source,
  }))
  const historyItems: MusicItem[] = history.map((h) => ({
    id: h.trackId,
    title: h.title,
    artist: h.artist,
    artwork: h.artwork || '',
    duration: h.duration,
    source: h.source,
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
          {/* Day 27 — export as JSON file or share code */}
          <DropdownMenu open={exportMenu} onOpenChange={setExportMenu}>
            <DropdownMenuTrigger asChild>
              <button
                className="rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Export or share playlist"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onClick={() => {
                  exportPlaylistFile({
                    name: openPlaylist.name,
                    description: openPlaylist.description,
                    items: openPlaylist.items.map((it) => ({
                      trackId: it.trackId,
                      title: it.title,
                      artist: it.artist,
                      artwork: it.artwork,
                      duration: it.duration,
                      source: it.source,
                    })),
                  })
                  toast.success(t('Playlist file downloaded'))
                  setExportMenu(false)
                }}
              >
                <FileDown className="mr-2 h-4 w-4" /> {t('Export as JSON file')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  const code = encodePlaylistCode({
                    name: openPlaylist.name,
                    description: openPlaylist.description,
                    items: openPlaylist.items.map((it) => ({
                      trackId: it.trackId,
                      title: it.title,
                      artist: it.artist,
                      artwork: it.artwork,
                      duration: it.duration,
                      source: it.source,
                    })),
                  })
                  try {
                    await navigator.clipboard.writeText(code)
                    toast.success(t('Share code copied'), {
                      description: t('Anyone can paste it in Library → Import to recreate this playlist.'),
                    })
                  } catch {
                    toast.error(t('Copy failed'))
                  }
                  setExportMenu(false)
                }}
              >
                <Copy className="mr-2 h-4 w-4" /> {t('Copy share code')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  setShareLinkOpen(true)
                  setExportMenu(false)
                }}
              >
                <Link2 className="mr-2 h-4 w-4" /> {t('Public link…')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Day 34 — public read-only share link */}
          {shareLinkOpen && (
            <ShareLinkDialog
              playlistId={openPlaylist.id}
              playlistName={openPlaylist.name}
              open={shareLinkOpen}
              onOpenChange={setShareLinkOpen}
            />
          )}
        </div>
        {openPlaylist.items.length === 0 ? (
          <EmptyState
            icon={Music4}
            title={t('This playlist is empty')}
            hint={t('Use the ⋮ menu on any song → "Add to playlist".')}
          />
        ) : (
          openPlaylist.items.map((it, i) => {
            const item: MusicItem = {
              id: it.trackId,
              title: it.title,
              artist: it.artist,
              artwork: it.artwork || '',
              duration: it.duration,
              source: it.source,
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
      <h1 className="text-2xl font-extrabold tracking-tight mb-4">{t('Your Library')}</h1>
      <Tabs defaultValue="favorites" className="w-full">
        <TabsList className="grid w-full max-w-lg grid-cols-4">
          <TabsTrigger value="favorites" className="gap-1.5">
            <Heart className="h-3.5 w-3.5" /> {t('Favorites')}
            {favorites.length > 0 && <span className="text-[10px] opacity-70">({favorites.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="playlists" className="gap-1.5">
            <ListMusic className="h-3.5 w-3.5" /> {t('Playlists')}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <History className="h-3.5 w-3.5" /> {t('History')}
          </TabsTrigger>
          <TabsTrigger value="offline" className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> {t('Offline')}
            {offlineItems.length > 0 && <span className="text-[10px] opacity-70">({offlineItems.length})</span>}
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
            <EmptyState
              icon={Heart}
              iconTone="primary"
              title={t('No favorites yet')}
              hint={t('Tap the ♥ on any song (or in the ⋮ menu) to save it here.')}
            />
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{t('{0} saved songs', [favorites.length])}</p>
                <Button size="sm" className="rounded-full" onClick={() => playItem(favoriteItems[0], favoriteItems)}>
                  {t('Play all')}
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
            <p className="text-sm text-muted-foreground">{t('{0} playlists', [playlists.length])}</p>
            <div className="flex items-center gap-2">
              <ImportPlaylistDialog />
              <AiPlaylistDialog
                onCreated={(playlistId) => {
                  void showDetail(playlistId)
                }}
              />
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="rounded-full gap-1.5">
                    <Plus className="h-4 w-4" /> {t('New playlist')}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-sm">
                  <DialogHeader>
                    <DialogTitle>{t('Create playlist')}</DialogTitle>
                  </DialogHeader>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={t('Playlist name')}
                    aria-label={t('Playlist name')}
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
          </div>
          {playlists.length === 0 ? (
            <EmptyState
              icon={ListMusic}
              title={t('No playlists yet')}
              hint={t('Create one above — or tap "AI playlist" and just describe the vibe.')}
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {playlists.map((p) => (
                <div key={p.id} className="group relative">
                  <button
                    className="w-full text-left transition-transform duration-150 ease-out active:scale-[0.97]"
                    onClick={() => showDetail(p.id)}
                  >
                    <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-accent transition-[transform,box-shadow] duration-200 ease-out group-hover:-translate-y-1 group-hover:shadow-xl group-hover:shadow-primary/10">
                      {p.cover ? (
                        <TrackImage item={{ artwork: p.cover, title: p.name }} className="h-full w-full" rounded="rounded-xl" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <ListMusic className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <p className="mt-2 truncate text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{t('{0} songs', [p.count])}</p>
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
                        <AlertDialogTitle>{t('Delete "{0}"?', [p.name])}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t('This removes the playlist and its {0} songs from your library.', [p.count])}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-white hover:bg-destructive/90"
                          onClick={() => deletePlaylist(p.id)}
                        >
                          {t('Delete')}
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
            <p className="text-sm text-muted-foreground">{t('Recently played')}</p>
            {history.length > 0 && (
              <Button variant="ghost" size="sm" className="text-destructive" onClick={clearHistory}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> {t('Clear')}
              </Button>
            )}
          </div>
          {history.length === 0 ? (
            <EmptyState
              icon={History}
              title={t('Nothing played yet')}
              hint={t('Your listening history will appear here.')}
            />
          ) : (
            historyItems.map((item, i) => (
              <TrackRow key={`${item.id}-${i}`} item={item} context={historyItems} />
            ))
          )}
        </TabsContent>

        {/* Offline downloads */}
        <TabsContent value="offline" className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <HardDrive className="h-3.5 w-3.5" />
              {t('{0} saved', [offlineItems.length])}
              {offlineTotal > 0 && ` • ${(offlineTotal / (1024 * 1024)).toFixed(1)} MB ${t('on device')}`}
            </p>
            {offlineItems.length > 0 && (
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => offlineClear()}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> {t('Clear all')}
              </Button>
            )}
          </div>
          {!offlineHydrated ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-xl" />
              ))}
            </div>
          ) : offlineItems.length === 0 ? (
            <EmptyState
              icon={Download}
              iconTone="primary"
              title={t('No offline downloads')}
              hint={t('Use the ⋮ menu on any song → "Download for offline". Saved songs play even without internet.')}
            />
          ) : (
            offlineItems.map((ot) => {
              const item: MusicItem = {
                id: ot.trackId,
                title: ot.title,
                artist: ot.artist,
                artwork: ot.artwork || '',
                duration: ot.duration,
                source: ot.source,
              }
              const prog = offlineProgress[ot.trackId]
              return (
                <div
                  key={ot.trackId}
                  className="group flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-accent/60 cursor-pointer"
                  onClick={() => playItem(item)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      playItem(item)
                    }
                  }}
                  aria-label={`Play offline ${ot.title}`}
                >
                  <TrackImage item={item} className="h-11 w-11" rounded="rounded-md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{ot.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {ot.artist}
                      {ot.size > 0 && ` • ${(ot.size / (1024 * 1024)).toFixed(1)} MB`}
                      {` • ${ot.source === 'au' ? 'Audius' : ot.source === 'jm' ? 'Jamendo' : 'YouTube'}`}
                      {ot.matchedVia && ` · ${t('matched from {0}', [ot.matchedVia === 'jamendo' ? 'Jamendo' : 'Audius'])}`}
                    </p>
                  </div>
                  {prog && (
                    <span className="text-xs text-primary tabular-nums shrink-0">
                      {prog.total ? Math.round((prog.loaded / prog.total) * 100) : '…'}%
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0 hidden sm:block">
                    {formatDuration(ot.duration)}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      offlineRemove(ot.trackId)
                    }}
                    className="rounded-full p-1.5 text-muted-foreground hover:text-destructive hover:bg-accent shrink-0"
                    aria-label={`Remove offline download ${ot.title}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
