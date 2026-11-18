'use client'
/* HandoffNudge (Day 32) — proactive "continue listening?" prompt.
 *
 * On app load (once), checks the user's cloud handoffs for one sent from
 * ANOTHER device that the user hasn't been shown yet. When found (and this
 * device isn't already playing), a toast offers one-tap resume with the
 * exact track + position. Seen-state persists in localStorage so the same
 * handoff never nags twice.
 */
import { useEffect } from 'react'
import { toast } from 'sonner'
import { usePlayer } from '@/store/player'
import { getDeviceLabel } from '@/lib/device'
import type { MusicItem } from '@/lib/types'

const SEEN_KEY = 'dhun-handoff-seen'

function resumeHandoff(id: string): Promise<boolean> {
  return fetch(`/api/sync/queue/${id}`)
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error())) as Promise<{
      fromDevice: string
      trackIndex: number
      position: number
      shuffle: boolean
      repeat: 'off' | 'all' | 'one'
      items: { id: string; source?: string; title: string; artist: string; artwork?: string; duration?: number }[]
    }>)
    .then((d) => {
      if (!d.items?.length) throw new Error()
      const items: MusicItem[] = d.items.map((x) => ({
        id: x.id,
        title: x.title,
        artist: x.artist,
        artwork: x.artwork ?? '',
        duration: x.duration ?? 0,
        source: x.source === 'au' || x.source === 'jm' ? x.source : 'yt',
      }))
      usePlayer.getState().resumeHandoff({
        items,
        index: d.trackIndex,
        position: d.position,
        shuffle: d.shuffle,
        repeat: d.repeat,
      })
      toast.success(`Resumed from ${d.fromDevice}`, {
        description: d.items[d.trackIndex]?.title.slice(0, 48),
      })
      return true
    })
    .catch(() => {
      toast.error('Could not resume this handoff')
      return false
    })
}

export function HandoffNudge() {
  useEffect(() => {
    // Give the app time to restore the persisted queue first.
    const timer = setTimeout(async () => {
      try {
        if (!navigator.onLine) return
        // Already playing (or has a queue mid-way)? Don't interrupt.
        const player = usePlayer.getState()
        if (player.queue.length > 0 && player.index >= 0) return

        const res = await fetch('/api/sync/queue')
        if (!res.ok) return
        const d = (await res.json()) as {
          handoffs?: Array<{
            id: string
            fromDevice: string
            trackCount: number
            track: { title: string; artist: string } | null
            createdAt: string
          }>
        }
        const lastSeen = Number(localStorage.getItem(SEEN_KEY) ?? 0)
        const candidate = (d.handoffs ?? [])
          .filter((h) => h.fromDevice !== getDeviceLabel())
          .filter((h) => new Date(h.createdAt).getTime() > lastSeen)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
        if (!candidate) return

        // Mark seen immediately — even if the user dismisses, never nag again.
        localStorage.setItem(SEEN_KEY, String(Date.now()))
        toast(`Queue sent from ${candidate.fromDevice}`, {
          description: candidate.track
            ? `"${candidate.track.title.slice(0, 40)}" · ${candidate.trackCount} tracks — tap to continue where they left off.`
            : `${candidate.trackCount} tracks — tap to continue listening.`,
          duration: 12000,
          action: {
            label: 'Resume',
            onClick: () => void resumeHandoff(candidate.id),
          },
        })
      } catch {
        /* nudge is best-effort */
      }
    }, 5000)
    return () => clearTimeout(timer)
  }, [])

  return null
}
