'use client'
import Image from 'next/image'
import { Pause, Play, SkipBack, SkipForward, Heart, ChevronUp, X, ListMusic } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { usePlayer } from '@/store/player'
import { useUi } from '@/store/ui'
import { useLibrary } from '@/store/library'
import { useSettings } from '@/store/settings'
import { cn } from '@/lib/utils'
import { formatDuration } from '@/lib/format'

export function MiniPlayer() {
  const current = usePlayer((s) => s.queue[s.index])
  const isPlaying = usePlayer((s) => s.isPlaying)
  const isBuffering = usePlayer((s) => s.isBuffering)
  const position = usePlayer((s) => s.position)
  const duration = usePlayer((s) => s.duration)
  const togglePlay = usePlayer((s) => s.togglePlay)
  const next = usePlayer((s) => s.next)
  const prev = usePlayer((s) => s.prev)
  const seek = usePlayer((s) => s.seek)
  const openNowPlaying = useUi((s) => s.openNowPlaying)
  const toggleFavorite = useLibrary((s) => s.toggleFavorite)
  const isFavorite = useLibrary((s) => s.isFavorite)
  const showMiniArt = useSettings((s) => s.showMiniArt)

  if (!current) return null

  const progress = duration > 0 ? (position / duration) * 100 : 0
  const fav = isFavorite(current.id)

  return (
    <div
      className="fixed inset-x-0 bottom-16 md:bottom-0 z-40 md:left-60 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      role="region"
      aria-label="Player controls"
    >
      {/* progress line */}
      <div className="absolute top-0 left-0 h-0.5 bg-muted w-full">
        <div className="h-full bg-primary transition-[width] duration-500" style={{ width: `${progress}%` }} />
      </div>

      <div className="flex items-center gap-2 sm:gap-3 px-3 py-2">
        {/* Track info — tap to expand */}
        <button
          className="flex items-center gap-3 min-w-0 flex-1 text-left group"
          onClick={openNowPlaying}
          aria-label="Open now playing"
        >
          {showMiniArt && (
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
              <img
                src={current.artwork}
                alt={current.title}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                <ChevronUp className="h-4 w-4 text-white" />
              </div>
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-tight">{current.title}</p>
            <p className="truncate text-xs text-muted-foreground leading-tight">
              {isBuffering ? 'Buffering…' : current.artist}
            </p>
          </div>
        </button>

        {/* Controls */}
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <button
            onClick={prev}
            className="hidden xs:inline-flex rounded-full p-2 hover:bg-accent"
            aria-label="Previous track"
          >
            <SkipBack className="h-4 w-4 fill-current" />
          </button>
          <button
            onClick={togglePlay}
            className="rounded-full bg-primary text-primary-foreground p-2.5 hover:opacity-90 transition-opacity mx-1"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4 fill-current" />
            ) : (
              <Play className="h-4 w-4 fill-current ml-0.5" />
            )}
          </button>
          <button
            onClick={next}
            className="inline-flex rounded-full p-2 hover:bg-accent"
            aria-label="Next track"
          >
            <SkipForward className="h-4 w-4 fill-current" />
          </button>
        </div>

        {/* Desktop extras */}
        <div className="hidden md:flex items-center gap-1 shrink-0">
          <button
            onClick={() => toggleFavorite(current)}
            className="rounded-full p-2 hover:bg-accent"
            aria-label="Toggle favorite"
          >
            <Heart className={cn('h-4 w-4', fav && 'fill-current text-primary')} />
          </button>
          <button
            onClick={openNowPlaying}
            className="rounded-full p-2 hover:bg-accent"
            aria-label="Open queue"
          >
            <ListMusic className="h-4 w-4" />
          </button>
          <span className="text-xs text-muted-foreground tabular-nums w-20 text-right">
            {formatDuration(position)} / {formatDuration(duration)}
          </span>
        </div>
      </div>

      {/* Mobile seek row */}
      <div className="md:hidden px-3 pb-1.5 -mt-1 flex items-center gap-2">
        <Slider
          value={[Math.min(position, duration || 1)]}
          max={Math.max(duration, 1)}
          step={1}
          onValueChange={(v) => seek(v[0])}
          className="flex-1 h-1.5"
          aria-label="Seek"
        />
      </div>
    </div>
  )
}
