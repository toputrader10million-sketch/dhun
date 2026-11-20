'use client'
/* Dhun — usage statistics (Day 55).
 *
 * Pure-client, honest counters that power the Pro panel's usage dashboard
 * and the loyalty-unlock eligibility (Day 53). Everything lives locally:
 *   • dhun-played-count — lifetime track plays (incremented by the player)
 *   • dhun-sessions     — unique active days (YYYY-MM-DD strings, cap 90)
 * Cloud-derived numbers (favorites/playlists) come from the library store,
 * offline count from the offline store. No estimates are presented as exact.
 */
import { useMemo } from 'react'
import { useLibrary } from '@/store/library'
import { useOffline } from '@/store/offline'

const PLAYED_KEY = 'dhun-played-count'
const SESSIONS_KEY = 'dhun-sessions'
const CAP_DAYS = 90

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

/** Called by the player on every track start — lifetime play counter. */
export function trackPlay() {
  try {
    const n = Number(localStorage.getItem(PLAYED_KEY) || '0') + 1
    localStorage.setItem(PLAYED_KEY, String(n))
  } catch {
    /* private mode */
  }
}

/** Called once per app boot — records today as an active day. */
export function trackSession() {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const days = readJson<string[]>(SESSIONS_KEY, [])
    if (!days.includes(today)) {
      days.push(today)
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(days.slice(-CAP_DAYS)))
    }
  } catch {
    /* private mode */
  }
}

export interface UsageStats {
  /** Lifetime track plays (from localStorage). */
  playedLifetime: number
  /** Unique active days recorded locally (cap 90). */
  daysActive: number
  /** Consecutive active days ending today or yesterday. */
  streak: number
  favorites: number
  playlists: number
  offlineTracks: number
  /** Distinct artists in the recent history window (max 30, honest label). */
  artistsRecent: number
  /** Minutes of music in the recent history window. */
  minutesRecent: number
}

/** Consecutive-day streak ending today or yesterday (both count as alive). */
function computeStreak(days: string[]): number {
  const set = new Set(days)
  const day = new Date()
  day.setHours(0, 0, 0, 0)
  if (!set.has(day.toISOString().slice(0, 10))) {
    day.setDate(day.getDate() - 1)
    if (!set.has(day.toISOString().slice(0, 10))) return 0
  }
  let streak = 0
  while (set.has(day.toISOString().slice(0, 10)) && streak < CAP_DAYS) {
    streak++
    day.setDate(day.getDate() - 1)
  }
  return streak
}

export function computeUsageStats(): UsageStats {
  // SSR / private-mode safe: localStorage only exists in the browser.
  if (typeof window === 'undefined') {
    return {
      playedLifetime: 0,
      daysActive: 0,
      streak: 0,
      favorites: 0,
      playlists: 0,
      offlineTracks: 0,
      artistsRecent: 0,
      minutesRecent: 0,
    }
  }
  const lib = useLibrary.getState()
  const offline = useOffline.getState()
  const days = readJson<string[]>(SESSIONS_KEY, [])
  const playedLifetime = Number(localStorage.getItem(PLAYED_KEY) || '0') || 0
  const artists = new Set(lib.history.map((h) => h.artist).filter(Boolean))
  const seconds = lib.history.reduce((acc, h) => acc + (h.duration || 0), 0)
  return {
    playedLifetime,
    daysActive: days.length,
    streak: computeStreak(days),
    favorites: lib.favorites.length,
    playlists: lib.playlists.length,
    offlineTracks: offline.items.length,
    artistsRecent: artists.size,
    minutesRecent: Math.round(seconds / 60),
  }
}

/** Loyalty unlock threshold (Day 53): real usage earns a free code. */
export const LOYALTY_PLAYS = 25
export const LOYALTY_DAYS = 3

export interface LoyaltyStatus {
  earned: boolean
  playsPct: number
  daysPct: number
  plays: number
  days: number
}

export function loyaltyStatus(stats?: UsageStats): LoyaltyStatus {
  const s = stats ?? computeUsageStats()
  const plays = s.playedLifetime
  const days = Math.max(s.daysActive, s.streak)
  return {
    earned: plays >= LOYALTY_PLAYS && days >= LOYALTY_DAYS,
    playsPct: Math.min(100, Math.round((plays / LOYALTY_PLAYS) * 100)),
    daysPct: Math.min(100, Math.round((days / LOYALTY_DAYS) * 100)),
    plays,
    days,
  }
}

/** Reactive hook — recomputes when library/offline stores change. */
export function useUsageStats(): UsageStats {
  const favorites = useLibrary((s) => s.favorites)
  const playlists = useLibrary((s) => s.playlists)
  const history = useLibrary((s) => s.history)
  const offlineCount = useOffline((s) => s.items.length)
  // Derived value, not synced state — recomputes when any input changes.
  return useMemo(
    () => computeUsageStats(),
    [favorites, playlists, history, offlineCount]
  )
}
