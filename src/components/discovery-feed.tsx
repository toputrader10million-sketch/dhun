'use client'

/**
 * Day 38 — Discovery feed for Explore.
 * Rendered before any search is typed: related radio around the user's last
 * play, anonymous community loves, and rotating Audius finds. Each section
 * degrades independently; nothing renders when a section is unavailable.
 */

import { useEffect, useState } from 'react'
import { Compass } from 'lucide-react'
import { TrackCardRow } from '@/components/track-card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/empty-state'
import type { MusicItem } from '@/lib/types'
import { usePlayer } from '@/store/player'

interface DiscoverSection {
  title: string
  items: MusicItem[]
}

interface DiscoverResponse {
  related: DiscoverSection | null
  loved: DiscoverSection | null
  fresh: DiscoverSection | null
}

export function DiscoveryFeed() {
  const [data, setData] = useState<DiscoverResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const playItem = usePlayer((s) => s.playItem)

  // Seed with the most recent history entry (if any) for a personal feed
  const [seed, setSeed] = useState<{ id: string; artist: string } | null>(null)

  useEffect(() => {
    // Read history lazily (the library store loads independently)
    import('@/store/library').then(({ useLibrary }) => {
      const last = useLibrary.getState().history[0]
      if (last) setSeed({ id: last.trackId, artist: last.artist })
    })
  }, [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    const params = new URLSearchParams()
    if (seed) {
      params.set('seed', seed.id)
      if (seed.artist) params.set('artist', seed.artist)
    }
    fetch(`/api/discover?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: DiscoverResponse) => {
        if (alive) setData(d)
      })
      .catch(() => {
        if (alive) setData({ related: null, loved: null, fresh: null })
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [seed])

  const sections = [data?.related, data?.loved, data?.fresh].filter(
    (s): s is DiscoverSection => !!s && s.items.length > 0
  )

  if (loading) {
    return (
      <div className="mb-6 space-y-6" aria-label="Discovery feed loading">
        <div className="flex gap-4 overflow-hidden">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-44 w-36 sm:w-40 shrink-0 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (sections.length === 0) {
    return (
      <div className="mb-6" aria-label="Discovery feed empty">
        <EmptyState
          icon={Compass}
          title="Discover more"
          hint="Play a few songs and this feed starts recommending — or just search above."
        />
      </div>
    )
  }

  return (
    <div className="mb-6 space-y-2" aria-label="Discovery feed">
      {sections.map((s, i) => (
        <div key={s.title} className="dhun-fade-up" style={{ animationDelay: `${i * 80}ms` }}>
          <TrackCardRow
            title={s.title}
            items={s.items}
            onPlayAll={() => playItem(s.items[0], s.items)}
          />
        </div>
      ))}
    </div>
  )
}
