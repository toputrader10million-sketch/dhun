'use client'
import { memo, useState } from 'react'
import { Heart, ListPlus, ListMusic, Play, Plus, Radio, Share2, Trash2, MoreVertical, Download } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EqBars } from '@/components/eq-bars'
import { formatDuration, formatViews } from '@/lib/format'
import type { MusicItem } from '@/lib/types'
import { usePlayer } from '@/store/player'
import { useLibrary } from '@/store/library'
import { useOffline } from '@/store/offline'
import { shareTrack } from '@/lib/share'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const YT_VIDEO_ID_RE = /^[\w-]{11}$/

/**
 * Artwork with a self-healing fallback chain:
 *   stored URL → i.ytimg.com hqdefault → i.ytimg.com mqdefault → placeholder.
 * Covers items persisted before artwork normalization (dead proxy URLs).
 */
export function TrackImage({
  item,
  className,
  rounded = 'rounded-lg',
}: {
  item: { artwork?: string; title: string; id?: string }
  className?: string
  rounded?: string
}) {
  const [stage, setStage] = useState(() => (item.artwork ? 0 : 1))
  const [prevKey, setPrevKey] = useState(`${item.id ?? ''}|${item.artwork}`)
  const nextKey = `${item.id ?? ''}|${item.artwork}`
  if (prevKey !== nextKey) {
    setPrevKey(nextKey)
    setStage(item.artwork ? 0 : 1)
  }

  const ytLike = !!item.id && YT_VIDEO_ID_RE.test(item.id)
  const candidates: string[] = []
  if (item.artwork) candidates.push(item.artwork)
  if (ytLike && item.id) {
    candidates.push(`https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`)
    candidates.push(`https://i.ytimg.com/vi/${item.id}/mqdefault.jpg`)
  }
  const src = stage < candidates.length ? candidates[stage] : null

  return (
    <div className={cn('relative overflow-hidden bg-muted shrink-0', rounded, className)}>
      {src ? (
        <img
          src={src}
          alt={item.title}
          loading="lazy"
          onError={() => setStage((s) => s + 1)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <ListMusic className="h-5 w-5" />
        </div>
      )}
    </div>
  )
}

interface TrackRowProps {
  item: MusicItem
  context?: MusicItem[]
  index?: number
  onRemove?: () => void
  trailing?: React.ReactNode
  showViews?: boolean
}

export const TrackRow = memo(function TrackRow({
  item,
  context,
  index,
  onRemove,
  trailing,
  showViews,
}: TrackRowProps) {
  const playItem = usePlayer((s) => s.playItem)
  const addToQueue = usePlayer((s) => s.addToQueue)
  const playNext = usePlayer((s) => s.playNext)
  const startRadio = usePlayer((s) => s.startRadio)
  const currentId = usePlayer((s) => (s.queue[s.index]?.id ?? null))
  const isPlaying = usePlayer((s) => s.isPlaying)
  const isCurrent = currentId === item.id
  const { isFavorite, toggleFavorite, playlists, addToPlaylist, createPlaylist } = useLibrary()
  const downloaded = useOffline((s) => s.isDownloaded(item.id))
  const downloading = useOffline((s) => s.isDownloading(item.id))
  const downloadOffline = useOffline((s) => s.download)
  const removeOffline = useOffline((s) => s.remove)

  const fav = isFavorite(item.id)

  return (
    <div
      className={cn(
        'group flex items-center gap-3 rounded-xl p-2 transition-[background-color,transform] duration-150 ease-out hover:bg-accent/60 active:scale-[0.985] cursor-pointer select-none',
        isCurrent && 'bg-accent'
      )}
      onClick={() => playItem(item, context)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          playItem(item, context)
        }
      }}
      aria-label={`Play ${item.title}`}
    >
      <span className="relative hidden sm:flex w-5 justify-center text-xs text-muted-foreground tabular-nums shrink-0">
        {isCurrent ? (
          <EqBars paused={!isPlaying} />
        ) : (
          <>
            <span className="group-hover:hidden">{index !== undefined ? index + 1 : ''}</span>
            <Play className="hidden group-hover:block h-3.5 w-3.5 fill-current" />
          </>
        )}
      </span>

      <TrackImage item={item} className="h-11 w-11" rounded="rounded-md" />

      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm font-medium', isCurrent && 'text-primary')}>
          {item.title}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {item.artist}
          {showViews && item.views ? ` • ${formatViews(item.views)}` : ''}
        </p>
      </div>

      {trailing}

      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
        {formatDuration(item.duration)}
      </span>

      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent focus:outline-none"
              aria-label={`More options for ${item.title}`}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => playNext(item)}>
              <ListPlus className="mr-2 h-4 w-4" /> Play next
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => addToQueue(item)}>
              <Plus className="mr-2 h-4 w-4" /> Add to queue
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => startRadio()}>
              <Radio className="mr-2 h-4 w-4" /> Start radio
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async () => {
                const res = await shareTrack({ title: item.title, artist: item.artist })
                if (res === 'copied') {
                  toast.success('Link copied', { description: `${item.title} — ${item.artist}` })
                } else if (res === 'failed') {
                  toast.error('Could not share', {
                    description: 'Sharing is not supported on this device.',
                  })
                }
              }}
            >
              <Share2 className="mr-2 h-4 w-4" /> Share
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => toggleFavorite(item)}>
              <Heart className={cn('mr-2 h-4 w-4', fav && 'fill-current text-primary')} />
              {fav ? 'Remove favorite' : 'Save to favorites'}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                if (downloaded) removeOffline(item.id)
                else downloadOffline(item, item.source === 'au' ? 'au' : 'yt')
              }}
            >
              <Download className={cn('mr-2 h-4 w-4', downloaded && 'text-primary fill-current')} />
              {downloading ? 'Downloading…' : downloaded ? 'Remove offline download' : 'Download for offline'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ListMusic className="mr-2 h-4 w-4" /> Add to playlist
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-64 overflow-y-auto dhun-scroll">
                {playlists.length === 0 ? (
                  <DropdownMenuItem disabled>No playlists yet</DropdownMenuItem>
                ) : (
                  playlists.map((p) => (
                    <DropdownMenuItem key={p.id} onClick={() => addToPlaylist(p.id, p.name, item)}>
                      {p.name}
                    </DropdownMenuItem>
                  ))
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    const id = await createPlaylist(`New ${new Date().toLocaleDateString()}`)
                    if (id) addToPlaylist(id, 'Playlist', item)
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" /> New playlist…
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {onRemove && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onRemove} className="text-destructive focus:text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" /> Remove
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
})
