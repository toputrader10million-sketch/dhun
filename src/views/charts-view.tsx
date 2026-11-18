'use client'
/* Dhun — Charts (Day 14): region-curated YouTube charts + Audius trending,
 * with genre tabs. Fully responsive: card rows scroll horizontally on mobile,
 * grid sections on desktop. */
import { useCallback, useEffect, useState } from 'react'
import { BarChart3, AudioWaveform, RefreshCw, Globe } from 'lucide-react'
import { TrackCardRow } from '@/components/track-card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import type { MusicItem } from '@/lib/types'
import { usePlayer } from '@/store/player'
import { useSettings } from '@/store/settings'
import { cn } from '@/lib/utils'

interface ChartSection {
  title: string
  items: MusicItem[]
  source: 'yt' | 'au'
}

type Mode = 'tops' | 'genre' | 'audius'

const GENRES = [
  { id: 'pop', label: 'Pop' },
  { id: 'hiphop', label: 'Hip-Hop' },
  { id: 'electronic', label: 'Electronic' },
  { id: 'lofi', label: 'Lo-Fi' },
  { id: 'bollywood', label: 'Bollywood' },
  { id: 'bangla', label: 'Bangla' },
  { id: 'punjabi', label: 'Punjabi' },
  { id: 'rock', label: 'Rock' },
  { id: 'rnb', label: 'R&B' },
  { id: 'classical', label: 'Classical' },
]

const REGION_LABELS: Record<string, string> = {
  BD: 'Bangladesh',
  IN: 'India',
  PK: 'Pakistan',
  US: 'United States',
  GB: 'United Kingdom',
  DE: 'Germany',
  JP: 'Japan',
  GLOBAL: 'Global',
}

export function ChartsView() {
  const settingsRegion = useSettings((s) => s.region)
  // Local chart-region override; null = follow the Settings region.
  const [regionSel, setRegionSel] = useState<string | null>(null)
  const region = regionSel ?? settingsRegion
  const [mode, setMode] = useState<Mode>('tops')
  const [genre, setGenre] = useState('pop')
  const [sections, setSections] = useState<ChartSection[]>([])
  const [loading, setLoading] = useState(true)
  const playItem = usePlayer((s) => s.playItem)
  const [refreshKey, setRefreshKey] = useState(0)

  // Fetch on region/mode/genre change. All state updates happen inside async
  // callbacks (never synchronously in the effect body).
  useEffect(() => {
    let alive = true
    const params = new URLSearchParams({ region: region || 'GLOBAL' })
    if (mode === 'genre' || mode === 'audius') params.set('genre', genre)
    params.set('mode', mode)
    void Promise.resolve().then(() => {
      if (!alive) return
      setLoading(true)
      return fetch(`/api/charts?${params.toString()}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d) => {
          if (alive) setSections(d.sections ?? [])
        })
        .catch(() => {
          if (alive) setSections([])
        })
        .finally(() => {
          if (alive) setLoading(false)
        })
    })
    return () => {
      alive = false
    }
  }, [region, mode, genre, refreshKey])

  return (
    <div className="px-4 sm:px-6 py-4">
      {/* header */}
      <div className="relative mb-5">
        <div aria-hidden className="dhun-header-aura pointer-events-none absolute -inset-x-4 -top-10 -bottom-4" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Dhun Charts</p>
            <h1 className="dhun-gradient-text text-2xl sm:text-3xl font-extrabold tracking-tight">
              What the world is playing
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Region charts + indie trending, refreshed hourly.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setRefreshKey((k) => k + 1)}
            aria-label="Refresh charts"
            className="shrink-0 transition-[background-color,transform] duration-150 active:scale-90"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* mode tabs */}
      <div className="mb-3 flex gap-2 overflow-x-auto dhun-scroll pb-1">
        <button
          onClick={() => setMode('tops')}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-[background-color,transform] duration-150 active:scale-95',
            mode === 'tops' ? 'bg-primary text-primary-foreground' : 'bg-accent hover:bg-accent/70'
          )}
          aria-pressed={mode === 'tops'}
        >
          <BarChart3 className="h-3.5 w-3.5" /> Top charts
        </button>
        <button
          onClick={() => setMode('audius')}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-[background-color,transform] duration-150 active:scale-95',
            mode === 'audius' ? 'bg-primary text-primary-foreground' : 'bg-accent hover:bg-accent/70'
          )}
          aria-pressed={mode === 'audius'}
        >
          <AudioWaveform className="h-3.5 w-3.5" /> Audius
        </button>
        <button
          onClick={() => setMode('genre')}
          className={cn(
            'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-[background-color,transform] duration-150 active:scale-95',
            mode === 'genre' ? 'bg-primary text-primary-foreground' : 'bg-accent hover:bg-accent/70'
          )}
          aria-pressed={mode === 'genre'}
        >
          Genres
        </button>
      </div>

      {/* region pills (top charts) */}
      {mode === 'tops' && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {['GLOBAL', 'BD', 'IN', 'PK', 'US', 'GB', 'DE', 'JP'].map((r) => (
            <button
              key={r}
              onClick={() => setRegionSel(r)}
              className={cn(
                'flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                region === r
                  ? 'bg-primary/20 text-primary ring-1 ring-primary/40'
                  : 'bg-accent/60 text-muted-foreground hover:text-foreground'
              )}
            >
              <Globe className="h-3 w-3" /> {REGION_LABELS[r] ?? r}
            </button>
          ))}
          <span className="hidden items-center text-[11px] text-muted-foreground sm:flex">
            Charts only — your home feed region is in Settings.
          </span>
        </div>
      )}

      {/* genre chips (genre mode) */}
      {mode === 'genre' && (
        <div className="mb-4 flex gap-2 overflow-x-auto dhun-scroll pb-1">
          {GENRES.map((g) => (
            <button
              key={g.id}
              onClick={() => setGenre(g.id)}
              className={cn(
                'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-[background-color,transform] duration-150 active:scale-95',
                genre === g.id ? 'bg-primary text-primary-foreground' : 'bg-accent hover:bg-accent/70'
              )}
              aria-pressed={genre === g.id}
            >
              {g.label}
            </button>
          ))}
        </div>
      )}

      {/* audius genre chips reuse GENRES when in audius mode */}
      {mode === 'audius' && (
        <div className="mb-4 flex gap-2 overflow-x-auto dhun-scroll pb-1">
          {GENRES.filter((g) => ['pop', 'hiphop', 'electronic', 'lofi', 'rock', 'rnb', 'classical'].includes(g.id)).map(
            (g) => (
              <button
                key={g.id}
                onClick={() => setGenre(g.id)}
                className={cn(
                  'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-[background-color,transform] duration-150 active:scale-95',
                  genre === g.id ? 'bg-primary text-primary-foreground' : 'bg-accent hover:bg-accent/70'
                )}
                aria-pressed={genre === g.id}
              >
                {g.label}
              </button>
            )
          )}
        </div>
      )}

      {/* loading skeletons */}
      {loading && (
        <div className="space-y-6">
          <Skeleton className="h-5 w-44" />
          <div className="flex gap-4 overflow-hidden">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-44 w-36 sm:w-40 shrink-0 rounded-xl" />
            ))}
          </div>
        </div>
      )}

      {!loading && sections.length === 0 && (
        <div className="rounded-xl bg-accent/40 p-8 text-center">
          <BarChart3 className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
          <p className="font-medium">Charts are warming up</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The chart network didn&apos;t respond — tap refresh in a moment.
          </p>
        </div>
      )}

      {!loading &&
        sections.map((section, si) => (
          <div
            key={section.title}
            className="dhun-fade-up"
            style={{ animationDelay: `${Math.min(si * 90, 450)}ms` }}
          >
            <TrackCardRow
              title={section.title}
              items={section.items}
              onPlayAll={
                section.items.length > 0 ? () => playItem(section.items[0], section.items) : undefined
              }
            />
          </div>
        ))}

      {!loading && sections.some((s) => s.source === 'au') && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Audius sections stream directly — no YouTube required, works offline-friendly.
        </p>
      )}
    </div>
  )
}
