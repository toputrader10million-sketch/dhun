'use client'
/* Dhun — "Made for you" (Day 15: AI DJ Daily Mix + personalised sections).
 *
 * Daily Mix hero: one composed mix from real listening data (history +
 * favorites → top artists → personal + discovery tracks), refreshed hourly.
 * Below it, the artist-based "Because you listen to…" sections.
 */
import { useEffect, useState } from 'react'
import { Play, Shuffle, Sparkles, RefreshCw, Loader2 } from 'lucide-react'
import { TrackCardRow } from '@/components/track-card'
import { useT } from '@/lib/i18n'
import { TrackImage } from '@/components/track-row'
import { Button } from '@/components/ui/button'
import { usePlayer } from '@/store/player'
import type { HomeSection, MusicItem } from '@/lib/types'
import { cn } from '@/lib/utils'

interface DailyMixData {
  title: string
  description: string
  items: MusicItem[]
}

function DailyMixHero({ refreshKey }: { refreshKey: number }) {
  const t = useT()
  const [mix, setMix] = useState<DailyMixData | null>(null)
  const [loaded, setLoaded] = useState(false)
  const playItem = usePlayer((s) => s.playItem)

  useEffect(() => {
    let alive = true
    fetch('/api/ai/daily-mix')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (alive) setMix(d.mix ?? null)
      })
      .catch(() => {
        if (alive) setMix(null)
      })
      .finally(() => {
        if (alive) setLoaded(true)
      })
    return () => {
      alive = false
    }
  }, [refreshKey])

  if (!loaded) {
    return (
      <div className="mb-8" aria-hidden>
        <div className="dhun-fade-up relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/15 via-card to-card p-5">
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 shrink-0 animate-pulse rounded-2xl bg-accent" />
            <div className="flex-1 space-y-2">
              <div className="h-5 w-40 animate-pulse rounded bg-accent" />
              <div className="h-3 w-64 max-w-full animate-pulse rounded bg-accent" />
              <div className="h-8 w-44 animate-pulse rounded-full bg-accent" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!mix || mix.items.length === 0) return null

  const dayLabel = new Date().toLocaleDateString(undefined, { weekday: 'long' })
  const previews = mix.items.slice(0, 3)

  return (
    <div className="mb-8 dhun-fade-up" aria-label="Daily Mix">
      <div className="dhun-glass-strong relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/15 via-card to-card p-5 transition-shadow duration-300 hover:shadow-xl hover:shadow-primary/10">
        <div className="flex items-start gap-4">
          {/* stacked artwork preview */}
          <div className="relative h-20 w-20 sm:h-24 sm:w-24 shrink-0">
            {previews.map((it, i) => (
              <TrackImage
                key={`${it.id}-${i}`}
                item={it}
                className={cn(
                  'absolute rounded-xl border bg-muted shadow-lg transition-transform duration-300',
                  i === 0 && 'h-16 w-16 sm:h-20 sm:w-20 left-0 top-0 z-30 rotate-0',
                  i === 1 && 'h-14 w-14 sm:h-16 sm:w-16 left-2 top-2 z-20 rotate-6',
                  i === 2 && 'h-12 w-12 sm:h-14 sm:w-14 left-4 top-4 z-10 rotate-12'
                )}
                rounded="rounded-xl"
              />
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
              <Sparkles className="h-3 w-3" /> AI DJ · {dayLabel}
            </p>
            <h2 className="dhun-gradient-text truncate text-xl sm:text-2xl font-extrabold tracking-tight">
              {mix.title}
            </h2>
            <p className="mt-0.5 line-clamp-2 text-xs sm:text-sm text-muted-foreground">
              {mix.description} · {mix.items.length} tracks
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                className="rounded-full gap-1.5"
                onClick={() => playItem(mix.items[0], mix.items)}
                aria-label={t('Play daily mix')}
              >
                <Play className="h-4 w-4 fill-current" /> {t('Play mix')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-full gap-1.5"
                onClick={() => {
                  // Shuffle mode ON before playing → the queue is shuffled.
                  usePlayer.setState({ shuffle: true })
                  playItem(mix.items[0], mix.items)
                }}
                aria-label={t('Shuffle play daily mix')}
              >
                <Shuffle className="h-4 w-4" /> {t('Shuffle')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="rounded-full gap-1.5 text-muted-foreground"
                onClick={() => {
                  setLoaded(false)
                  fetch('/api/ai/daily-mix?t=' + Date.now())
                    .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
                    .then((d) => setMix(d.mix ?? null))
                    .catch(() => setMix(null))
                    .finally(() => setLoaded(true))
                }}
                aria-label={t('Refresh daily mix')}
              >
                <RefreshCw className="h-3.5 w-3.5" /> {t('New mix')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ForYou({ refreshKey }: { refreshKey?: number }) {
  const t = useT()
  const [sections, setSections] = useState<HomeSection[]>([])
  const [loaded, setLoaded] = useState(false)
  const playItem = usePlayer((s) => s.playItem)

  useEffect(() => {
    let alive = true
    fetch('/api/for-you')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (alive) setSections(d.sections ?? [])
      })
      .catch(() => {
        if (alive) setSections([])
      })
      .finally(() => {
        if (alive) setLoaded(true)
      })
    return () => {
      alive = false
    }
  }, [refreshKey])

  return (
    <div aria-label={t('Made for you')}>
      <DailyMixHero refreshKey={refreshKey ?? 0} />
      {!loaded && sections.length === 0 && (
        <div className="mb-8 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('Building your personal sections…')}
        </div>
      )}
      {sections.map((section) => (
        <TrackCardRow
          key={section.title}
          title={section.title}
          items={section.items}
          onPlayAll={
            section.items.length > 0
              ? () => playItem(section.items[0], section.items)
              : undefined
          }
        />
      ))}
    </div>
  )
}
