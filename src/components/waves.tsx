'use client'

/**
 * Day 36 — Waves editorial strip for Home.
 * Four curated gradient cards (Bangla / Bollywood / Punjab / Global). Tapping
 * a card resolves its track list via /api/waves?id=… and expands a row below
 * the strip. Results are cached per session; reduced-motion aware.
 */

import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Drum, Film, Globe2, Loader2, Waves, X } from 'lucide-react'
import { TrackCardRow } from '@/components/track-card'
import { Skeleton } from '@/components/ui/skeleton'
import { WAVES, type WaveMeta, type WaveTrackResponse } from '@/lib/waves'
import { useT } from '@/lib/i18n'
import type { MusicItem } from '@/lib/types'
import { usePlayer } from '@/store/player'
import { cn } from '@/lib/utils'

const WAVE_ICONS: Record<WaveMeta['icon'], typeof Waves> = {
  waves: Waves,
  film: Film,
  drum: Drum,
  globe: Globe2,
}

export function WavesStrip() {
  const t = useT()
  const [openId, setOpenId] = useState<string | null>(null)
  const [tracks, setTracks] = useState<Record<string, MusicItem[]>>({})
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [failedId, setFailedId] = useState<string | null>(null)
  const playItem = usePlayer((s) => s.playItem)
  const reduceMotion = !!useReducedMotion()

  const toggle = async (id: string) => {
    if (openId === id) {
      setOpenId(null)
      return
    }
    setOpenId(id)
    if (tracks[id] || loadingId) return
    setLoadingId(id)
    setFailedId(null)
    try {
      const res = await fetch(`/api/waves?id=${encodeURIComponent(id)}`)
      if (!res.ok) throw new Error(String(res.status))
      const d = (await res.json()) as { wave: WaveTrackResponse }
      setTracks((prev) => ({ ...prev, [id]: d.wave.items }))
      if (d.wave.items.length === 0) setFailedId(id)
    } catch {
      setFailedId(id)
    } finally {
      setLoadingId(null)
    }
  }

  const openWave = WAVES.find((w) => w.id === openId)
  const openItems = openId ? tracks[openId] : undefined

  return (
    <section className="mb-8" aria-label={t('Waves — curated editorial picks')}>
      <div className="mb-3 flex items-center gap-2">
        <Waves className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="text-lg font-bold">{t('Waves')}</h2>
        <span className="rounded-full bg-primary/15 text-primary text-[10px] font-semibold px-2 py-0.5">
          {t('curated by Dhun')}
        </span>
      </div>

      <div className="flex gap-3 overflow-x-auto dhun-scroll pb-2 snap-x" role="group" aria-label={t('Waves')}>
        {WAVES.map((wave, i) => {
          const Icon = WAVE_ICONS[wave.icon]
          const open = openId === wave.id
          return (
            <button
              key={wave.id}
              onClick={() => void toggle(wave.id)}
              aria-pressed={open}
              aria-label={`${wave.title} — ${wave.tagline}`}
              className={cn(
                'group relative flex shrink-0 snap-start flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-left transition-[transform,box-shadow] duration-200 active:scale-[0.97]',
                'h-36 w-52 sm:w-60',
                wave.gradient,
                open
                  ? 'ring-2 ring-foreground/70 shadow-lg shadow-black/30'
                  : 'ring-1 ring-white/10 hover:shadow-md hover:shadow-black/20'
              )}
              style={{
                animation: reduceMotion ? undefined : `dhun-fade-up 400ms ease-out both`,
                animationDelay: `${i * 70}ms`,
              }}
            >
              {/* subtle texture ring */}
              <span
                aria-hidden
                className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-white/10 blur-xl transition-transform duration-300 group-hover:scale-125"
              />
              <Icon className="relative h-5 w-5 text-white/90" aria-hidden="true" />
              <span className="relative">
                <span className="block text-base font-extrabold leading-tight text-white drop-shadow-sm">
                  {wave.title}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-white/85">
                  {wave.tagline}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {/* expanded wave row */}
      <AnimatePresence initial={false}>
        {openWave && (
          <motion.div
            key={openWave.id}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="relative pt-2">
              <button
                onClick={() => setOpenId(null)}
                aria-label={`Close ${openWave.title}`}
                className="absolute right-0 top-3 z-10 rounded-full bg-accent/80 p-1.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              {loadingId === openWave.id ? (
                <div className="flex gap-4 overflow-hidden py-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-44 w-36 sm:w-40 shrink-0 rounded-xl" />
                  ))}
                </div>
              ) : failedId === openWave.id || (openItems && openItems.length === 0) ? (
                <p className="py-3 text-xs text-muted-foreground">
                  {openWave.title} couldn&apos;t load right now — tap the card again in a moment.
                </p>
              ) : openItems && openItems.length > 0 ? (
                <TrackCardRow
                  title={`${openWave.title} — ${openItems.length} picks`}
                  items={openItems}
                  onPlayAll={() => playItem(openItems[0], openItems)}
                />
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* invisible spinner only for a11y while switching waves */}
      {loadingId && <Loader2 className="sr-only" aria-live="polite" />}
    </section>
  )
}
