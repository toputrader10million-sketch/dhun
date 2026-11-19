'use client'

/**
 * Day 34 — Public playlist share-link viewer.
 * Reached via /?p=<token> (read-only token URL). Shows the shared playlist,
 * lets you play it or save a copy to your own library. No owner info is shown.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  ArrowLeft,
  Check,
  Copy,
  Link2Off,
  ListMusic,
  Loader2,
  Play,
  Share2,
  UserPlus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TrackImage } from '@/components/track-row'
import { EmptyState } from '@/components/empty-state'
import { toast } from 'sonner'
import { useUi } from '@/store/ui'
import { usePlayer } from '@/store/player'
import { useLibrary } from '@/store/library'
import type { MusicItem, TrackSource } from '@/lib/types'

interface SharedItem {
  trackId: string
  title: string
  artist: string
  artwork: string | null
  duration: number
  source: string
  position: number
}

interface SharedPlaylist {
  name: string
  description: string | null
  count: number
  updatedAt: string
  truncated: boolean
  items: SharedItem[]
}

function toMusicItems(items: SharedItem[]): MusicItem[] {
  return items.map((it) => ({
    id: it.trackId,
    title: it.title,
    artist: it.artist,
    artwork: it.artwork || '',
    duration: it.duration,
    source: (['yt', 'au', 'jm'].includes(it.source) ? it.source : 'yt') as TrackSource,
  }))
}

export function SharedPlaylistView() {
  const token = useUi((s) => s.shareToken)
  const closeShared = useUi((s) => s.closeShared)
  const playItem = usePlayer((s) => s.playItem)
  const createPlaylist = useLibrary((s) => s.createPlaylist)

  const [data, setData] = useState<SharedPlaylist | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/share/${encodeURIComponent(token)}`)
      const body = (await res.json()) as SharedPlaylist & { error?: string }
      if (!res.ok) {
        setError(body.error ?? 'This link is invalid or was revoked')
        setData(null)
      } else {
        setData(body)
      }
    } catch {
      setError('Could not reach Dhun — check your connection and reload.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const items = data ? toMusicItems(data.items) : []

  const saveCopy = async () => {
    if (!data || saving || saved) return
    setSaving(true)
    try {
      const id = await createPlaylist(data.name, data.description ?? undefined)
      if (!id) throw new Error('create failed')
      let added = 0
      for (const it of data.items) {
        try {
          const res = await fetch(`/api/playlists/${id}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              trackId: it.trackId,
              title: it.title,
              artist: it.artist,
              artwork: it.artwork,
              duration: it.duration,
              source: it.source,
            }),
          })
          if (res.ok) added++
        } catch {}
      }
      setSaved(true)
      toast.success(`Saved "${data.name}" to your Library`, {
        description: `${added}/${data.items.length} songs added.`,
      })
    } catch {
      toast.error('Could not save the playlist — try again')
    } finally {
      setSaving(false)
    }
  }

  const shareLink = async () => {
    if (!token) return
    const url = `${window.location.origin}/?p=${token}`
    try {
      if (navigator.share) {
        await navigator.share({ title: `${data?.name ?? 'Playlist'} — Dhun`, url })
        return
      }
      await navigator.clipboard.writeText(url)
      toast.success('Link copied')
    } catch {
      // share aborted / clipboard blocked — silent for share(), honest for copy
      try {
        await navigator.clipboard.writeText(url)
        toast.success('Link copied')
      } catch {
        /* user cancelled share — no fake success */
      }
    }
  }

  return (
    <div className="px-4 sm:px-6 py-4">
      <div className="mb-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={closeShared} aria-label="Close shared playlist">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <Share2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">
            Shared playlist — read-only link{token ? ` · ${token}` : ''}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-64 rounded-xl" />
          <div className="space-y-2 pt-2">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        </div>
      ) : error ? (
        <EmptyState
          icon={Link2Off}
          title="This link doesn't work"
          hint={error}
          action={{ label: 'Try again', onClick: () => void load() }}
          className="mx-auto max-w-md"
        />
      ) : data ? (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/15">
              <ListMusic className="h-6 w-6 text-primary" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-extrabold tracking-tight sm:text-2xl">{data.name}</h1>
              <p className="text-xs text-muted-foreground">
                {data.count} songs
                {data.description ? ` · ${data.description}` : ''}
                {data.truncated ? ' · first 200 shown' : ''}
              </p>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              {items.length > 0 && (
                <Button size="sm" className="rounded-full gap-1.5" onClick={() => playItem(items[0], items)}>
                  <Play className="h-3.5 w-3.5 fill-current" /> Play
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="rounded-full gap-1.5"
                disabled={saving || saved || items.length === 0}
                onClick={() => void saveCopy()}
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
                {saved ? 'Saved' : 'Save to Library'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-full gap-1.5"
                onClick={() => void shareLink()}
              >
                <Copy className="h-3.5 w-3.5 sm:hidden" aria-hidden="true" />
                <span className="hidden sm:inline">Copy link</span>
              </Button>
            </div>
          </div>

          {items.length === 0 ? (
            <EmptyState
              icon={ListMusic}
              title="This playlist is empty"
              hint="The owner hasn't added songs yet — check back later."
            />
          ) : (
            <div className="space-y-1">
              {items.map((item, i) => (
                <button
                  key={`${item.id}-${i}`}
                  onClick={() => playItem(item, items)}
                  className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-accent/60 active:scale-[0.995]"
                >
                  <span className="w-6 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  <TrackImage item={item} className="h-11 w-11 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{item.artist}</span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {item.duration > 0
                      ? `${Math.floor(item.duration / 60)}:${String(item.duration % 60).padStart(2, '0')}`
                      : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
