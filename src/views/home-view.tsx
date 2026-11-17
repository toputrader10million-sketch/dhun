'use client'
import { useEffect, useState } from 'react'
import { Sparkles, History, RefreshCw, AudioWaveform } from 'lucide-react'
import { TrackCardRow } from '@/components/track-card'
import { TrackRow } from '@/components/track-row'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import type { HomeResponse, MusicItem } from '@/lib/types'
import { usePlayer } from '@/store/player'
import { useLibrary } from '@/store/library'
import { useSettings } from '@/store/settings'
import { greeting } from '@/lib/format'

export function HomeView({ region }: { region?: string }) {
  const settingsRegion = useSettings((s) => s.region)
  const activeRegion = region ?? settingsRegion
  const [data, setData] = useState<HomeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [audius, setAudius] = useState<MusicItem[]>([])
  const playItem = usePlayer((s) => s.playItem)
  const history = useLibrary((s) => s.history)
  const loadAll = useLibrary((s) => s.loadAll)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    loadAll()
  }, [loadAll])

  useEffect(() => {
    let alive = true
    fetch(`/api/home?region=${activeRegion}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (alive) setData(d)
      })
      .catch(() => {
        if (alive) setError(true)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [activeRegion])

  useEffect(() => {
    let alive = true
    fetch('/api/audius/trending')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d) => {
        if (alive) setAudius(d.items || [])
      })
      .catch(() => {
        if (alive) setAudius([])
      })
    return () => {
      alive = false
    }
  }, [])

  const quickPicks: MusicItem[] = history.slice(0, 10).map((h) => ({
    id: h.trackId,
    title: h.title,
    artist: h.artist,
    artwork: h.artwork || '',
    duration: h.duration,
    source: h.source,
  }))

  const refresh = () => {
    setRefreshing(true)
    fetch(`/api/home?region=${activeRegion}&t=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d) => setData(d))
      .catch(() => setError(true))
      .finally(() => setRefreshing(false))
  }

  return (
    <div className="px-4 sm:px-6 py-4">
      {/* greeting */}
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Dhun • free music, your way</p>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight" suppressHydrationWarning>
            {greeting()}
            <span className="ml-2 text-primary">♪</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Search any song from YouTube&apos;s catalog — no ads, no login, works offline too.
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={refresh} aria-label="Refresh feed" className="shrink-0">
          <RefreshCw className={refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        </Button>
      </div>

      {loading && (
        <div>
          <Skeleton className="mb-3 h-5 w-40" />
          <div className="flex gap-4 overflow-hidden mb-8">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-44 w-36 sm:w-40 shrink-0 rounded-xl" />
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm mb-8">
          <p className="font-medium">Could not load the feed</p>
          <p className="mt-1 text-muted-foreground">
            The music network is temporarily unavailable. Tap refresh, or try another region in Settings.
          </p>
        </div>
      )}

      {/* quick picks from history */}
      {quickPicks.length > 0 && (
        <section className="mb-8" aria-label="Quick picks">
          <div className="mb-3 flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-bold">Jump back in</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {quickPicks.slice(0, 6).map((item, i) => (
              <TrackRow key={`${item.id}-${i}`} item={item} context={quickPicks} />
            ))}
          </div>
        </section>
      )}

      {/* curated sections */}
      {data?.sections?.map((section, si) => (
        <TrackCardRow
          key={section.title}
          title={section.title}
          items={section.items}
          loading={loading}
          onPlayAll={section.items.length > 0 ? () => playItem(section.items[0], section.items) : undefined}
        />
      ))}

      {/* Audius trending (indie / direct-stream catalog) */}
      <section className="mb-8" aria-label="Audius trending">
        <div className="mb-3 flex items-center gap-2">
          <AudioWaveform className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-bold">Audius Trending</h2>
          <span className="rounded-full bg-primary/15 text-primary text-[10px] font-semibold px-2 py-0.5">
            direct stream
          </span>
        </div>
        {audius.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {audius.slice(0, 6).map((item, i) => (
              <TrackRow key={`${item.id}-${i}`} item={item} index={i} context={audius} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Audius catalog unavailable right now — indie tracks appear here when the network recovers.
          </p>
        )}
      </section>

      {!loading && !error && (!data || data.sections.every((s) => s.items.length === 0)) && (
        <div className="rounded-xl bg-accent/40 p-6 text-center">
          <Sparkles className="mx-auto h-6 w-6 text-primary mb-2" />
          <p className="font-medium">Feed is empty right now</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try the Explore tab to search anything, or switch region in Settings.
          </p>
        </div>
      )}
    </div>
  )
}
