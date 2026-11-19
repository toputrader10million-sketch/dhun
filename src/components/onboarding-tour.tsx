'use client'

/**
 * Day 40 — Onboarding tour for first-time visitors (3 steps, skippable).
 *
 * Shown only when there is no sign of an existing user: the `dhun-onboarded`
 * flag is unset AND no persisted settings/player state exists (so returning
 * users are never nagged). Finishing or skipping sets the flag permanently.
 */

import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  AudioWaveform,
  Compass,
  Download,
  Heart,
  Keyboard,
  Mic2,
  Sparkles,
  WifiOff,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const FLAG = 'dhun-onboarded'

const STEPS: {
  key: string
  icon: typeof AudioWaveform
  title: string
  body: string
  points: { icon: typeof Heart; text: string }[]
}[] = [
  {
    key: 'welcome',
    icon: AudioWaveform,
    title: 'Welcome to Dhun',
    body: 'A free music platform — every feature below works without an account, without ads, forever.',
    points: [
      { icon: Heart, text: 'Search YouTube, Audius & Creative Commons catalogs' },
      { icon: WifiOff, text: 'Offline downloads that survive dead zones' },
      { icon: Mic2, text: 'Lyrics with karaoke mode — synced line by line' },
    ],
  },
  {
    key: 'discover',
    icon: Compass,
    title: 'Find music your way',
    body: 'Three ways to explore — pick whatever feels natural at the moment.',
    points: [
      { icon: Compass, text: 'Explore: plain search, voice search, or "Ask Dhun AI" in any language' },
      { icon: Sparkles, text: 'Waves & Charts: curated Bangla, Bollywood, Punjabi and global picks' },
      { icon: AudioWaveform, text: 'Dhun Copilot (the dock bubble): ask for a workout mix, get playable tracks' },
    ],
  },
  {
    key: 'keep',
    icon: Download,
    title: 'Keep what you love',
    body: 'Everything stays yours — locally first, with optional cloud sync across devices.',
    points: [
      { icon: Heart, text: '♥ any song — favorites can auto-download for offline' },
      { icon: Keyboard, text: 'Space to play, ←/→ to seek, ? for all shortcuts' },
      { icon: Sparkles, text: 'Settings: 6 pro themes, accent designer, EQ profiles, visualizers' },
    ],
  },
]

function isReturningUser(): boolean {
  try {
    // Any persisted store = the user has used Dhun before the tour existed
    return !!localStorage.getItem('dhun-settings') || !!localStorage.getItem('dhun-player')
  } catch {
    return false
  }
}

export function OnboardingTour() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const reduceMotion = !!useReducedMotion()

  useEffect(() => {
    try {
      if (localStorage.getItem(FLAG)) return
      if (isReturningUser()) {
        // Existing users silently get the flag — no tour, ever.
        localStorage.setItem(FLAG, 'done')
        return
      }
      const t = setTimeout(() => setOpen(true), 1400)
      return () => clearTimeout(t)
    } catch {
      /* storage blocked — stay silent */
    }
  }, [])

  const finish = () => {
    setOpen(false)
    try {
      localStorage.setItem(FLAG, 'done')
    } catch {}
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish()
      if (e.key === 'Enter') {
        if (step < STEPS.length - 1) setStep((s) => s + 1)
        else finish()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, step])

  if (!open) return null
  const s = STEPS[step]
  const Icon = s.icon

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Welcome to Dhun — step ${step + 1} of ${STEPS.length}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={s.key}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.98 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl shadow-black/40"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                  Step {step + 1} of {STEPS.length}
                </p>
                <h2 className="text-lg font-extrabold tracking-tight">{s.title}</h2>
              </div>
            </div>
            <button
              onClick={finish}
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Skip the tour"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <p className="text-sm text-muted-foreground">{s.body}</p>

          <ul className="mt-4 space-y-2.5">
            {s.points.map((p) => {
              const PIcon = p.icon
              return (
                <li key={p.text} className="flex items-start gap-2.5 text-sm">
                  <PIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>{p.text}</span>
                </li>
              )
            })}
          </ul>

          <div className="mt-6 flex items-center justify-between gap-3">
            {/* progress dots */}
            <div className="flex items-center gap-1.5" aria-hidden="true">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-300',
                    i === step ? 'w-5 bg-primary' : 'w-1.5 bg-muted-foreground/40'
                  )}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              {step > 0 && (
                <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setStep((v) => v - 1)}>
                  Back
                </Button>
              )}
              <Button size="sm" className="rounded-full gap-1" onClick={() => (step < STEPS.length - 1 ? setStep((v) => v + 1) : finish())}>
                {step < STEPS.length - 1 ? 'Next' : 'Start listening'}
              </Button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
