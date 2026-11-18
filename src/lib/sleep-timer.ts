'use client'
/* Dhun — Sleep timer state (Day 11, "Sleep timer pro").
 *
 * Previously the sleep timer lived only inside a dialog in Now Playing, which
 * meant the *player* could not know about it. That made the "stop after the
 * current track" mode impossible. This tiny shared store is the single source
 * of truth consumed by:
 *   - SleepTimerDialog (UI: presets, countdown, volume fade)
 *   - the player store's handleEnded (track-end mode)
 *
 * Volume fade (last 5s) is applied by the dialog's ticker; track-end mode is
 * enforced by the player itself so it works even when the dialog is unmounted.
 */
import { create } from 'zustand'

export type SleepMode = 'off' | 'timed' | 'track-end'

interface SleepTimerState {
  mode: SleepMode
  /** epoch ms when playback should stop (mode === 'timed') */
  endsAt: number | null
  /** configured length in minutes (for display) */
  durationMin: number | null
  setTimed: (min: number) => void
  setTrackEnd: () => void
  /** Extend a running timer by N minutes (no-op when off). */
  addMinutes: (min: number) => void
  cancel: () => void
  /** True when playback should stop instead of advancing to the next track. */
  shouldStopAfterTrack: () => boolean
}

export const useSleepTimer = create<SleepTimerState>((set, get) => ({
  mode: 'off',
  endsAt: null,
  durationMin: null,
  setTimed: (min) =>
    set({
      mode: 'timed',
      durationMin: min,
      endsAt: Date.now() + min * 60_000,
    }),
  setTrackEnd: () => set({ mode: 'track-end', endsAt: null, durationMin: null }),
  addMinutes: (min) =>
    set((s) => {
      if (s.mode !== 'timed' || s.endsAt === null) return {}
      return { endsAt: s.endsAt + min * 60_000, durationMin: (s.durationMin ?? 0) + min }
    }),
  cancel: () => set({ mode: 'off', endsAt: null, durationMin: null }),
  shouldStopAfterTrack: () => get().mode !== 'off',
}))
