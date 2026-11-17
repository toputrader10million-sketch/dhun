'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Mic2, Music2 } from 'lucide-react'
import { parseLrc } from '@/lib/format'
import type { MusicItem } from '@/lib/types'
import { usePlayer } from '@/store/player'
import { cn } from '@/lib/utils'

interface LyricsState {
  synced?: string
  plain?: string
  source: string
}

export function LyricsPanel({ item }: { item: MusicItem }) {
  // Component is mounted with key={item.id} so it resets per track.
  const [data, setData] = useState<LyricsState | null>(null)
  const [loading, setLoading] = useState(true)
  const position = usePlayer((s) => s.position)
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

  useEffect(() => {
    if (activeRef.current && lines.length > 0) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [activeIndex, lines.length])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Finding lyrics…
      </div>
    )
  }

  if (lines.length > 0) {
    return (
      <div ref={containerRef} className="h-full overflow-y-auto dhun-scroll px-2 py-4" aria-label="Synced lyrics">
        <div className="mb-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Mic2 className="h-3 w-3" /> Synced lyrics • LRCLIB
        </div>
        {lines.map((line, i) => (
          <p
            key={`${line.time}-${i}`}
            ref={i === activeIndex ? activeRef : undefined}
            className={cn(
              'py-1.5 text-lg leading-relaxed transition-all duration-300',
              i === activeIndex
                ? 'text-foreground font-semibold scale-[1.02] origin-left'
                : 'text-muted-foreground/70'
            )}
          >
            {line.text || '♪'}
          </p>
        ))}
        <div className="h-24" />
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
          <p key={i} className="py-1 text-base leading-relaxed text-foreground/90">
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
