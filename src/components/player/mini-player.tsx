'use client'
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Pause, Play, SkipBack, SkipForward, Heart, ListMusic, Cast, Download, Loader2 } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { TrackImage } from '@/components/track-row'
import { EqBars } from '@/components/eq-bars'
import { usePlayer } from '@/store/player'
import { useUi } from '@/store/ui'
import { useLibrary } from '@/store/library'
import { useSettings } from '@/store/settings'
import { useOffline } from '@/store/offline'
import { useCast } from '@/lib/cast'
import { cn } from '@/lib/utils'
import { formatDuration } from '@/lib/format'

/**
 * Title/artist text that ping-pong scrolls only when it actually overflows.
 * Static (clipped) otherwise — no wasted animation on short names.
 */
function MarqueeText({ text, className }: { text: string; className?: string }) {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLSpanElement>(null)
  const [animated, setAnimated] = useState(false)

  useEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return
    const check = () => {
      const over = inner.scrollWidth > outer.clientWidth + 4
      setAnimated((prev) => (prev === over ? prev : over))
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(outer)
    return () => ro.disconnect()
  }, [text, animated])

  return (
    <div ref={outerRef} className={cn('overflow-hidden', className)}>
      <span
        className={cn('flex w-max items-center whitespace-nowrap', animated && 'dhun-marquee')}
      >
        <span ref={innerRef}>{text}</span>
        <span className="mx-2 text-primary" aria-hidden>
          ♪
        </span>
        <span aria-hidden>{text}</span>
      </span>
    </div>
  )
}

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
  const castAvailable = useCast((s) => s.available)
  const castConnected = useCast((s) => s.connected)
  const castTrackId = useCast((s) => s.castTrackId)
  const castCurrent = usePlayer((s) => s.castCurrent)
  const stopCast = useCast((s) => s.actions.stopCast)
  const downloaded = useOffline((s) => s.isDownloaded(current?.id ?? ''))
  const downloading = useOffline((s) => s.isDownloading(current?.id ?? ''))
  const dlProgress = useOffline((s) => (current ? s.progress[current.id] : undefined))
  const download = useOffline((s) => s.download)
  const reduceMotion = !!useReducedMotion()

  const progress = current && duration > 0 ? (position / duration) * 100 : 0
  const fav = current ? isFavorite(current.id) : false

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          key="mini-player"
          initial={reduceMotion ? { opacity: 0 } : { y: 110, opacity: 0 }}
          animate={reduceMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { y: 110, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          className="fixed inset-x-0 bottom-16 lg:bottom-0 z-40 lg:left-60 border-t dhun-glass-strong"
          role="region"
          aria-label="Player controls"
        >
          {/* progress line with glowing leading dot */}
          <div className="absolute top-0 left-0 h-0.5 bg-muted w-full">
            <div
              className="relative h-full bg-gradient-to-r from-primary/55 to-primary transition-[width] duration-500"
              style={{ width: `${progress}%` }}
            >
              {progress > 1 && (
                <span
                  className="absolute -right-1 -top-[3px] h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_10px_2px] shadow-primary/50"
                  aria-hidden
                />
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 px-3 py-2">
            {/* Track info — tap to expand */}
            <button
              className="flex items-center gap-3 min-w-0 flex-1 text-left group"
              onClick={openNowPlaying}
              aria-label="Open now playing"
            >
              {showMiniArt && (
                <TrackImage item={current} className="h-10 w-10" rounded="rounded-md" />
              )}
              <EqBars paused={!isPlaying} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <MarqueeText text={current.title} className="text-sm font-medium leading-tight" />
                <p className="truncate text-xs text-muted-foreground leading-tight">
                  {isBuffering ? 'Buffering…' : current.artist}
                </p>
              </div>
            </button>

            {/* Controls */}
            <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
              {castAvailable && (
                <button
                  onClick={() => {
                    if (castConnected) stopCast()
                    else castCurrent()
                  }}
                  className={cn(
                    'inline-flex h-11 w-11 items-center justify-center rounded-full transition-[background-color,transform] duration-150 hover:bg-accent active:scale-95',
                    castConnected && castTrackId === current.id && 'text-primary'
                  )}
                  aria-label={castConnected ? 'Disconnect cast' : 'Cast to device'}
                  title={castConnected ? 'Disconnect cast' : 'Cast to device'}
                >
                  <Cast className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => {
                  if (!downloading && !downloaded) download(current, current.source === 'au' ? 'au' : 'yt')
                }}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full transition-[background-color,transform] duration-150 hover:bg-accent active:scale-95"
                aria-label={downloaded ? 'Downloaded for offline' : 'Download for offline'}
                title={
                  downloaded
                    ? 'Available offline'
                    : downloading
                      ? `Downloading ${dlProgress?.total ? Math.round(((dlProgress.loaded || 0) / dlProgress.total) * 100) : 0}%`
                      : 'Download for offline'
                }
              >
                {downloading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : downloaded ? (
                  <Download className="h-4 w-4 text-primary fill-current" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </button>
              <button
                onClick={prev}
                className="hidden xs:inline-flex rounded-full p-2 transition-[background-color,transform] duration-150 hover:bg-accent active:scale-90"
                aria-label="Previous track"
              >
                <SkipBack className="h-4 w-4 fill-current" />
              </button>
              <button
                onClick={togglePlay}
                className="mx-1 inline-flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/25 transition-[transform,opacity] duration-150 hover:opacity-90 active:scale-90"
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
                className="inline-flex h-11 w-11 items-center justify-center rounded-full transition-[background-color,transform] duration-150 hover:bg-accent active:scale-95"
                aria-label="Next track"
              >
                <SkipForward className="h-4 w-4 fill-current" />
              </button>
            </div>

            {/* Desktop extras */}
            <div className="hidden lg:flex items-center gap-1 shrink-0">
              {castConnected && (
                <span className="text-[10px] font-medium uppercase tracking-wide text-primary">Casting</span>
              )}
              <button
                onClick={() => toggleFavorite(current)}
                className="rounded-full p-2 transition-[background-color,transform] duration-150 hover:bg-accent active:scale-95"
                aria-label="Toggle favorite"
              >
                <Heart className={cn('h-4 w-4', fav && 'fill-current text-primary')} />
              </button>
              <button
                onClick={openNowPlaying}
                className="rounded-full p-2 transition-[background-color,transform] duration-150 hover:bg-accent active:scale-95"
                aria-label="Open queue"
              >
                <ListMusic className="h-4 w-4" />
              </button>
              <span className="text-xs text-muted-foreground tabular-nums w-20 text-right">
                {formatDuration(position)} / {formatDuration(duration)}
              </span>
            </div>
          </div>

          {/* Compact + tablet seek row */}
          <div className="lg:hidden px-3 pb-1.5 -mt-1 flex items-center gap-2">
            <Slider
              value={[Math.min(position, duration || 1)]}
              max={Math.max(duration, 1)}
              step={1}
              onValueChange={(v) => seek(v[0])}
              className="flex-1 h-1.5"
              aria-label="Seek"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
