'use client'
// "Made for you" — personalised sections computed server-side from the
// user's real listening data (history + favorites → top artists).
import { useEffect, useState } from 'react'
import { TrackCardRow } from '@/components/track-card'
import { usePlayer } from '@/store/player'
import type { HomeSection } from '@/lib/types'

export function ForYou({ refreshKey }: { refreshKey?: number }) {
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

  if (!loaded || sections.length === 0) return null

  return (
    <div className="dhun-fade-up" aria-label="Made for you">
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
