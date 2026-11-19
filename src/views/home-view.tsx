'use client'
/* Dhun — Home (Day 20: smart sections).
 * The feed adapts to the user's local hour (morning energy / afternoon focus /
 * evening vibes / late-night calm) and to live weather (Open-Meteo, region
 * capital coordinates — no geolocation permission needed). */
import { useEffect, useState } from 'react'
import { Sparkles, History, RefreshCw, AudioWaveform, CloudSun } from 'lucide-react'
import { TrackCardRow } from '@/components/track-card'
import { TrackRow } from '@/components/track-row'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { ForYou } from '@/components/for-you'
import { WavesStrip } from '@/components/waves'
import { EmptyState } from '@/components/empty-state'
import type { HomeResponse, MusicItem } from '@/lib/types'
import { usePlayer } from '@/store/player'
import { useLibrary } from '@/store/library'
import { useSettings } from '@/store/settings'
import { greeting } from '@/lib/format'

interface WeatherInfo {
  temp: number
  condition: string
  isDay: boolean
  label: string
  glyph: string
}

/* Region → representative city coordinates (feeds /api/weather via Open-Meteo) */
const REGION_COORDS: Record<string, { lat: number; lon: number; city: string }> = {
  BD: { lat: 23.81, lon: 90.41, city: 'Dhaka' },
  IN: { lat: 28.61, lon: 77.21, city: 'Delhi' },
  US: { lat: 40.71, lon: -74.01, city: 'New York' },
  GB: { lat: 51.51, lon: -0.13, city: 'London' },
  DE: { lat: 52.52, lon: 13.4, city: 'Berlin' },
  JP: { lat: 35.68, lon: 139.69, city: 'Tokyo' },
}

export function HomeView({ region }: { region?: string }) {
  const settingsRegion = useSettings((s) => s.region)
  const activeRegion = region ?? settingsRegion
  const [data, setData] = useState<HomeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [audius, setAudius] = useState<MusicItem[]>([])
  const [weather, setWeather] = useState<WeatherInfo | null>(null)
  const playItem = usePlayer((s) => s.playItem)
  const history = useLibrary((s) => s.history)
  const loadAll = useLibrary((s) => s.loadAll)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshCount, setRefreshCount] = useState(0)

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Smart home feed: local hour + weather drive section selection (Day 20)
  useEffect(() => {
    let alive = true
    const hour = new Date().getHours()
    const weatherParam = weather?.condition ?? ''
    fetch(`/api/home?region=${activeRegion}&hour=${hour}${weatherParam ? `&weather=${weatherParam}` : ''}`)
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
  }, [activeRegion, weather?.condition, refreshCount])

  // Weather: fetch once per mount/region via the region capital (silent — best effort)
  useEffect(() => {
    let alive = true
    const coords = REGION_COORDS[activeRegion] ?? REGION_COORDS.BD
    fetch(`/api/weather?lat=${coords.lat}&lon=${coords.lon}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: WeatherInfo) => {
        if (alive && d && typeof d.temp === 'number' && d.condition) setWeather(d)
      })
      .catch(() => {
        /* weather chip is optional */
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
    setRefreshCount((c) => c + 1)
    fetch(`/api/home?region=${activeRegion}&hour=${new Date().getHours()}&t=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d) => setData(d))
      .catch(() => setError(true))
      .finally(() => setRefreshing(false))
  }

  const city = REGION_COORDS[activeRegion]?.city

  return (
    <div className="px-4 sm:px-6 py-4">
      {/* greeting (with accent aura + gradient title + live weather chip) */}
      <div className="relative mb-6">
        <div aria-hidden className="dhun-header-aura pointer-events-none absolute -inset-x-4 -top-10 -bottom-4" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Dhun • free music, your way</p>
            <h1
              suppressHydrationWarning
              className="dhun-gradient-text text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight"
            >
              {greeting()}
              <span className="ml-2 text-primary">♪</span>
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {/* Day 20 — weather chip (best-effort, hidden when unavailable) */}
              {weather && (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border bg-card/70 px-2.5 py-1 text-xs text-muted-foreground"
                  aria-label={`Weather in ${city ?? 'your area'}: ${weather.label}, ${weather.temp} degrees`}
                >
                  <span aria-hidden>{weather.glyph}</span>
                  {weather.temp}° {weather.label}
                  {city ? ` · ${city}` : ''}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                <CloudSun className="h-3.5 w-3.5" aria-hidden="true" />
                Smart feed · adapts to your day
              </span>
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Search any song from YouTube&apos;s catalog — no ads, no login, works offline too.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={refresh}
            aria-label="Refresh feed"
            className="shrink-0 transition-[background-color,transform] duration-150 active:scale-90"
          >
            <RefreshCw className={refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          </Button>
        </div>
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

      {/* Day 36 — Waves: curated editorial sections (Bangla/Bollywood/Punjab/Global) */}
      <WavesStrip />

      {/* quick picks from history */}
      {quickPicks.length > 0 && (
        <section className="mb-8" aria-label="Quick picks">
          <div className="mb-3 flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-bold">Jump back in</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {quickPicks.slice(0, 6).map((item, i) => (
              <div
                key={`${item.id}-${i}`}
                className="dhun-fade-up"
                style={{ animationDelay: `${Math.min(i * 60, 300)}ms` }}
              >
                <TrackRow item={item} context={quickPicks} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* curated sections (staggered entrance animation) */}
      {data?.sections?.map((section, si) => (
        <div
          key={section.title}
          className="dhun-fade-up"
          style={{ animationDelay: `${Math.min(si * 90, 450)}ms` }}
        >
          <TrackCardRow
            title={section.title}
            items={section.items}
            loading={loading}
            onPlayAll={section.items.length > 0 ? () => playItem(section.items[0], section.items) : undefined}
          />
        </div>
      ))}

      {/* Made for you — personalised from real listening data */}
      <ForYou refreshKey={refreshCount} />

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
              <div
                key={`${item.id}-${i}`}
                className="dhun-fade-up"
                style={{ animationDelay: `${Math.min(i * 60, 300)}ms` }}
              >
                <TrackRow item={item} index={i} context={audius} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Audius catalog unavailable right now — indie tracks appear here when the network recovers.
          </p>
        )}
      </section>

      {!loading && !error && (!data || data.sections.every((s) => s.items.length === 0)) && (
        <EmptyState
          icon={Sparkles}
          iconTone="primary"
          title="Feed is empty right now"
          hint="Try the Explore tab to search anything, or switch region in Settings."
        />
      )}
    </div>
  )
}
