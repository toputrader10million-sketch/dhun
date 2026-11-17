'use client'
import { memo } from 'react'
import { Play } from 'lucide-react'
import { TrackImage } from './track-row'
import type { MusicItem } from '@/lib/types'
import { usePlayer } from '@/store/player'
import { cn } from '@/lib/utils'

interface TrackCardProps {
  item: MusicItem
  context?: MusicItem[]
  size?: 'md' | 'lg'
}

export const TrackCard = memo(function TrackCard({ item, context, size = 'md' }: TrackCardProps) {
  const playItem = usePlayer((s) => s.playItem)
  const currentId = usePlayer((s) => s.queue[s.index]?.id ?? null)
  const isCurrent = currentId === item.id
  const w = size === 'lg' ? 'w-44 sm:w-48' : 'w-36 sm:w-40'

  return (
    <button
      className={cn('group shrink-0 text-left', w)}
      onClick={() => playItem(item, context)}
      aria-label={`Play ${item.title}`}
    >
      <div className="relative">
        <TrackImage item={item} className={cn('aspect-square w-full', w && 'w-full')} rounded="rounded-xl" />
        <div className="absolute bottom-2 right-2 rounded-full bg-primary text-primary-foreground p-2.5 shadow-lg opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all">
          <Play className="h-4 w-4 fill-current" />
        </div>
      </div>
      <p
        className={cn(
          'mt-2 line-clamp-2 text-sm font-medium leading-tight',
          isCurrent && 'text-primary'
        )}
      >
        {item.title}
      </p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.artist}</p>
    </button>
  )
})

export function TrackCardRow({
  title,
  items,
  onPlayAll,
  loading,
}: {
  title: string
  items: MusicItem[]
  onPlayAll?: () => void
  loading?: boolean
}) {
  if (loading) {
    return (
      <section className="mb-8">
        <div className="mb-3 h-5 w-40 rounded bg-muted animate-pulse" />
        <div className="flex gap-4 overflow-hidden">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="w-36 sm:w-40 shrink-0">
              <div className="aspect-square w-full rounded-xl bg-muted animate-pulse" />
              <div className="mt-2 h-4 w-3/4 rounded bg-muted animate-pulse" />
              <div className="mt-1 h-3 w-1/2 rounded bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      </section>
    )
  }
  if (items.length === 0) return null
  return (
    <section className="mb-8" aria-label={title}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold">{title}</h2>
        {onPlayAll && (
          <button
            onClick={onPlayAll}
            className="rounded-full bg-accent px-3 py-1 text-xs font-medium hover:bg-accent/80 transition-colors"
          >
            Play all
          </button>
        )}
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 dhun-scroll -mx-1 px-1">
        {items.map((item, i) => (
          <TrackCard key={`${item.id}-${i}`} item={item} context={items} />
        ))}
      </div>
    </section>
  )
}
