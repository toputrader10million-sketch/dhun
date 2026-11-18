'use client'
/* Dhun — floating desktop widget (Day 31).
 *
 * A compact now-playing card with a REAL mini spectrum when the Hi-Fi engine
 * is driving playback (canvas over hifiEngine.getLevels()), and the existing
 * EqBars decoration when only the YouTube embed is active (its audio can't
 * be tapped — we never fake FFT data). Desktop only (lg+), toggle in Settings.
 */
import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronUp, Pause, Play, SkipForward, X } from 'lucide-react'
import { TrackImage } from '@/components/track-row'
import { EqBars } from '@/components/eq-bars'
import { usePlayer } from '@/store/player'
import { useUi } from '@/store/ui'
import { useSettings } from '@/store/settings'
import { hifiEngine } from '@/engine/hifi'
import { cn } from '@/lib/utils'

function MiniSpectrum({ active }: { active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!active) return
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const levels = hifiEngine.getLevels()
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (!levels) return
      const bars = 20
      const step = Math.max(1, Math.floor(levels.length / bars))
      const bw = canvas.width / bars
      for (let i = 0; i < bars; i++) {
        const v = levels[Math.min(i * step, levels.length - 1)] / 255
        const h = Math.max(2, v * canvas.height)
        ctx.fillStyle = `oklch(0.62 0.2 20 / ${0.3 + v * 0.6})`
        ctx.fillRect(i * bw + 1, canvas.height - h, bw - 2, h)
      }
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [active])
  if (!active) return null
  return <canvas ref={ref} width={120} height={26} className="h-6 w-[120px]" aria-hidden />
}

export function DesktopWidget() {
  const enabled = useSettings((s) => s.desktopWidget)
  const current = usePlayer((s) => s.queue[s.index])
  const isPlaying = usePlayer((s) => s.isPlaying)
  const hifiActive = usePlayer((s) => s.hifiActive)
  const nowPlayingOpen = useUi((s) => s.nowPlayingOpen)
  const togglePlay = usePlayer((s) => s.togglePlay)
  const next = usePlayer((s) => s.next)
  const openNowPlaying = useUi((s) => s.openNowPlaying)
  const setDesktopWidget = useSettings((s) => s.setDesktopWidget)

  const visible = enabled && !!current && !nowPlayingOpen
  // Real FFT data only exists when the Hi-Fi engine drives playback.
  const showSpectrum = visible && hifiActive && isPlaying

  return (
    <AnimatePresence>
      {visible && (
        <motion.aside
          key="desktop-widget"
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className="dhun-glass-strong fixed bottom-28 right-4 z-40 hidden w-72 rounded-2xl border p-3 shadow-xl shadow-black/20 lg:block"
          role="region"
          aria-label="Compact now playing widget"
        >
          <div className="flex items-center gap-3">
            <button
              onClick={openNowPlaying}
              className="min-w-0 flex-1 text-left"
              aria-label="Open now playing"
            >
              <div className="flex items-center gap-2.5">
                <TrackImage item={current} className="h-11 w-11" rounded="rounded-lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-tight">{current.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{current.artist}</p>
                </div>
              </div>
            </button>
            <button
              onClick={() => setDesktopWidget(false)}
              className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Hide desktop widget (re-enable in Settings → Playback)"
              title="Hide widget"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Mini spectrum (Hi-Fi) or decorative EQ bars (embed) */}
          <div className="mt-2 flex h-6 items-end">
            {showSpectrum ? (
              <MiniSpectrum active />
            ) : (
              <EqBars paused={!isPlaying} className="h-6" />
            )}
          </div>

          <div className="mt-2 flex items-center justify-center gap-2">
            <button
              onClick={togglePlay}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/25 transition-transform hover:opacity-90 active:scale-90"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
            </button>
            <button
              onClick={next}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full transition-[background-color,transform] hover:bg-accent active:scale-90"
              aria-label="Next track"
            >
              <SkipForward className="h-4 w-4 fill-current" />
            </button>
            <button
              onClick={openNowPlaying}
              className={cn(
                'inline-flex h-10 w-10 items-center justify-center rounded-full transition-[background-color,transform] hover:bg-accent active:scale-90'
              )}
              aria-label="Expand player"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
