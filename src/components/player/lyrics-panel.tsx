'use client'
/* Dhun — Lyrics panel (Day 12: karaoke mode + font size control).
 *
 * Normal mode: scrollable synced list, active line highlighted.
 * Karaoke mode: bigger type, active line centered with a live "sweep" fill
 * (background-clip: text) that advances with playback position — the classic
 * karaoke read-along feel.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Mic2, Music2, Type } from 'lucide-react'
import { parseLrc } from '@/lib/format'
import type { MusicItem } from '@/lib/types'
import { usePlayer } from '@/store/player'
import { useSettings, LYRICS_FONT_SIZES, type LyricsFontSize } from '@/store/settings'
import { cn } from '@/lib/utils'

interface LyricsState {
  synced?: string
  plain?: string
  source: string
}

const SIZE_ORDER: LyricsFontSize[] = ['sm', 'md', 'lg', 'xl']

export function LyricsPanel({ item }: { item: MusicItem }) {
  // Component is mounted with key={item.id} so it resets per track.
  const [data, setData] = useState<LyricsState | null>(null)
  const [loading, setLoading] = useState(true)
  const position = usePlayer((s) => s.position)
  const karaoke = useSettings((s) => s.lyricsKaraoke)
  const fontSize = useSettings((s) => s.lyricsFontSize)
  const setLyricsKaraoke = useSettings((s) => s.setLyricsKaraoke)
  const setLyricsFontSize = useSettings((s) => s.setLyricsFontSize)
  const containerRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    let alive = true
    fetch(
      `/api/lyrics?title=${encodeURIComponent(item.title)}&artist=${encodeURIComponent(item.artist)}&duration=${Math.round(item.duration || 0)}`
    )
      .then((r) => (r.ok ? r.json() : { source: 'none' }))
      .then((d) => {
        if (alive) setData(d)
      })
      .catch(() => {
        if (alive) setData({ source: 'none' })
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [item.id, item.title, item.artist, item.duration])

  const lines = useMemo(() => (data?.synced ? parseLrc(data.synced) : []), [data])

  const activeIndex = useMemo(() => {
    if (lines.length === 0) return -1
    let idx = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time <= position + 0.25) idx = i
      else break
    }
    return idx
  }, [lines, position])

  // Progress through the active line (0..1) for the karaoke sweep fill.
  const lineProgress = useMemo(() => {
    if (activeIndex < 0 || activeIndex >= lines.length) return 0
    const start = lines[activeIndex].time
    const end = activeIndex + 1 < lines.length ? lines[activeIndex + 1].time : start + 6
    const span = Math.max(0.5, end - start)
    return Math.max(0, Math.min(1, (position - start) / span))
  }, [lines, activeIndex, position])

  useEffect(() => {
    if (activeRef.current && lines.length > 0) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [activeIndex, lines.length])

  const cycleFont = (dir: 1 | -1) => {
    const i = SIZE_ORDER.indexOf(fontSize)
    const next = SIZE_ORDER[Math.max(0, Math.min(SIZE_ORDER.length - 1, i + dir))]
    setLyricsFontSize(next)
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Finding lyrics…
      </div>
    )
  }

  const sizes = LYRICS_FONT_SIZES[fontSize]

  if (lines.length > 0) {
    return (
      <div
        ref={containerRef}
        className={cn('h-full overflow-y-auto dhun-scroll px-2 py-4', karaoke && 'flex flex-col justify-center py-8')}
        aria-label="Synced lyrics"
      >
        {/* lyrics controls: font size + karaoke toggle */}
        <div className="sticky top-0 z-10 mb-2 flex items-center gap-1">
          <div className="flex items-center gap-1 rounded-full bg-background/80 px-2 py-1 backdrop-blur">
            <Type className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
            <button
              onClick={() => cycleFont(-1)}
              disabled={fontSize === 'sm'}
              className="rounded px-1.5 text-xs font-bold text-muted-foreground hover:text-foreground disabled:opacity-30"
              aria-label="Smaller lyric text"
            >
              A-
            </button>
            <button
              onClick={() => cycleFont(1)}
              disabled={fontSize === 'xl'}
              className="rounded px-1.5 text-sm font-bold text-muted-foreground hover:text-foreground disabled:opacity-30"
              aria-label="Larger lyric text"
            >
              A+
            </button>
          </div>
          <button
            onClick={() => setLyricsKaraoke(!karaoke)}
            className={cn(
              'ml-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors',
              karaoke ? 'bg-primary text-primary-foreground' : 'bg-background/80 text-muted-foreground backdrop-blur hover:text-foreground'
            )}
            aria-pressed={karaoke}
            aria-label="Toggle karaoke mode"
          >
            <Mic2 className="h-3 w-3" /> Karaoke {karaoke ? 'on' : 'off'}
          </button>
        </div>

        {lines.map((line, i) => {
          const isActive = i === activeIndex
          if (karaoke) {
            // Karaoke: neighbors dim hard, active line sweeps with progress.
            const dist = Math.abs(i - activeIndex)
            if (dist > 4) return null
            return (
              <p
                key={`${line.time}-${i}`}
                ref={isActive ? activeRef : undefined}
                className={cn(
                  'font-extrabold leading-tight tracking-tight transition-all duration-300',
                  isActive ? `${sizes.active} origin-center scale-100 text-center` : `${sizes.line} text-center`,
                  !isActive && 'opacity-30'
                )}
                style={
                  isActive
                    ? {
                        backgroundImage: `linear-gradient(90deg, hsl(var(--primary)) ${Math.round(lineProgress * 100)}%, hsl(var(--muted-foreground)) ${Math.round(lineProgress * 100)}%)`,
                        WebkitBackgroundClip: 'text',
                        backgroundClip: 'text',
                        color: 'transparent',
                        WebkitTextFillColor: 'transparent',
                      }
                    : undefined
                }
              >
                {line.text || '♪'}
              </p>
            )
          }
          return (
            <p
              key={`${line.time}-${i}`}
              ref={i === activeIndex ? activeRef : undefined}
              className={cn(
                'py-1.5 leading-relaxed transition-all duration-300',
                sizes.line,
                i === activeIndex
                  ? 'text-foreground font-semibold scale-[1.02] origin-left'
                  : 'text-muted-foreground/70'
              )}
            >
              {line.text || '♪'}
            </p>
          )
        })}
        <div className={cn('h-24', karaoke && 'h-12')} />
      </div>
    )
  }

  if (data?.plain) {
    return (
      <div className="h-full overflow-y-auto dhun-scroll px-2 py-4" aria-label="Lyrics">
        <div className="mb-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Mic2 className="h-3 w-3" /> Lyrics • LRCLIB
        </div>
        {data.plain.split('\n').map((line, i) => (
          <p key={i} className={cn('py-1 leading-relaxed text-foreground/90', sizes.line)}>
            {line || ' '}
          </p>
        ))}
        <div className="h-24" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center px-6">
      <div className="rounded-full bg-accent p-4">
        <Music2 className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">No lyrics found</p>
      <p className="text-xs text-muted-foreground max-w-xs">
        We searched LRCLIB (free lyrics database) for “{item.title}” but there is no match yet.
        Lyrics support grows every day.
      </p>
    </div>
  )
}
