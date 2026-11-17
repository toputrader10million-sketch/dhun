'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ListMusic, Loader2, Search, Users, Disc3, Library } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { TrackRow, TrackImage } from '@/components/track-row'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import type { MusicItem, SearchFilter, SearchResponse } from '@/lib/types'
import { SEARCH_FILTERS } from '@/lib/types'
import { usePlayer } from '@/store/player'
import { useUi } from '@/store/ui'
import { cn } from '@/lib/utils'

const FILTER_LABELS: Record<SearchFilter, string> = {
  music_songs: 'Songs',
  videos: 'Videos',
  albums: 'Albums',
  artists: 'Artists',
  playlists: 'Playlists',
}

type DetailState = {
  title: string
  cover: string
  items: MusicItem[]
}

export function ExploreView() {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<SearchFilter>('music_songs')
  const [results, setResults] = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [detail, setDetail] = useState<DetailState | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchSeed = useUi((s) => s.searchSeed)
  const clearSearchSeed = useUi((s) => s.clearSearchSeed)
  const playItem = usePlayer((s) => s.playItem)

  const runSearch = useCallback(
    (q: string, f: SearchFilter, page?: string) => {
      if (!q.trim()) return
      setLoading(true)
      setShowSuggestions(false)
      const url = `/api/search?q=${encodeURIComponent(q)}&filter=${f}${page ? `&page=${encodeURIComponent(page)}` : ''}`
      fetch(url)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: SearchResponse) => {
          setResults((prev) =>
            page && prev && prev.filter === f ? { ...d, items: [...prev.items, ...d.items] } : d
          )
        })
        .catch(() => {
          setResults({ items: [], filter: f })
        })
        .finally(() => setLoading(false))
    },
    []
  )

  // Debounced live search
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults(null)
      setSuggestions([])
      return
    }
    const t = setTimeout(() => runSearch(q, filter), 450)
    return () => clearTimeout(t)
  }, [query, filter, runSearch])

  // Suggestions
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2 || !showSuggestions) return
    const t = setTimeout(() => {
      fetch(`/api/suggestions?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setSuggestions(d?.suggestions || []))
        .catch(() => setSuggestions([]))
    }, 300)
    return () => clearTimeout(t)
  }, [query, showSuggestions])

  // External seed (e.g., from artist click)
  useEffect(() => {
    if (searchSeed) {
      setQuery(searchSeed)
      runSearch(searchSeed, filter)
      clearSearchSeed()
      inputRef.current?.focus()
    }
  }, [searchSeed, filter, runSearch, clearSearchSeed])

  const openDetail = async (item: MusicItem) => {
    if (filter === 'artists') {
      setQuery(item.artist || item.title)
      runSearch(item.artist || item.title, 'music_songs')
      return
    }
    setDetailLoading(true)
    setDetail(null)
    try {
      const res = await fetch(`/api/playlist/${item.id}`)
      if (!res.ok) throw new Error()
      const d = await res.json()
      setDetail({ title: d.name || item.title, cover: d.cover || item.artwork, items: d.items || [] })
    } catch {
      setDetail({ title: item.title, cover: item.artwork, items: [] })
    } finally {
      setDetailLoading(false)
    }
  }

  return (
    <div className="px-4 sm:px-6 py-4">
      {/* search bar */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setShowSuggestions(true)
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setShowSuggestions(false)
              runSearch(query.trim(), filter)
            }
          }}
          placeholder="Search songs, artists, albums…"
          className="pl-10 h-11 rounded-xl bg-accent/50 border-0"
          aria-label="Search music"
        />
        {suggestions.length > 0 && showSuggestions && (
          <div className="absolute z-30 mt-1 w-full rounded-xl border bg-popover shadow-lg overflow-hidden">
            {suggestions.slice(0, 8).map((s) => (
              <button
                key={s}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-left hover:bg-accent"
                onMouseDown={() => {
                  setQuery(s)
                  runSearch(s, filter)
                }}
              >
                <Search className="h-3.5 w-3.5 text-muted-foreground" /> {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {detail ? (
        <>
          <div className="flex items-center gap-3 mb-4">
            <Button variant="ghost" size="icon" onClick={() => setDetail(null)} aria-label="Back to results">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            {detail.cover && <TrackImage item={{ artwork: detail.cover, title: detail.title }} className="h-12 w-12" />}
            <h2 className="truncate text-lg font-bold">{detail.title}</h2>
            {detail.items.length > 0 && (
              <Button size="sm" className="ml-auto rounded-full" onClick={() => playItem(detail.items[0], detail.items)}>
                Play all
              </Button>
            )}
          </div>
          {detailLoading ? (
            <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
          ) : (
            detail.items.map((item, i) => <TrackRow key={`${item.id}-${i}`} item={item} index={i} context={detail.items} />)
          )}
        </>
      ) : (
        <>
          {/* filter chips */}
          <div className="mb-4 flex gap-2 overflow-x-auto dhun-scroll pb-1">
            {SEARCH_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                  filter === f ? 'bg-primary text-primary-foreground' : 'bg-accent hover:bg-accent/70'
                )}
              >
                {f === 'albums' && <Disc3 className="mr-1 inline h-3 w-3" />}
                {f === 'artists' && <Users className="mr-1 inline h-3 w-3" />}
                {f === 'playlists' && <Library className="mr-1 inline h-3 w-3" />}
                {FILTER_LABELS[f]}
              </button>
            ))}
          </div>

          {/* results */}
          {loading && !results && (
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-xl" />
              ))}
            </div>
          )}

          {results && results.items.length === 0 && !loading && (
            <div className="rounded-xl bg-accent/40 p-8 text-center mt-8">
              <ListMusic className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
              <p className="font-medium">No results{query ? ` for “${query}”` : ''}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try a different search or another filter — the catalog covers nearly everything on YouTube.
              </p>
            </div>
          )}

          {(filter === 'music_songs' || filter === 'videos') &&
            results?.items.map((item, i) => (
              <TrackRow
                key={`${item.id}-${i}`}
                item={item}
                index={i}
                context={results.items}
                showViews={filter === 'videos'}
              />
            ))}

          {(filter === 'albums' || filter === 'artists' || filter === 'playlists') && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {results?.items.map((item, i) => (
                <button
                  key={`${item.id}-${i}`}
                  className="group text-left"
                  onClick={() => openDetail(item)}
                >
                  <TrackImage item={item} className="aspect-square w-full" rounded="rounded-xl" />
                  <p className="mt-2 line-clamp-1 text-sm font-medium">{item.title}</p>
                  <p className="line-clamp-1 text-xs text-muted-foreground">{item.artist}</p>
                </button>
              ))}
            </div>
          )}

          {results?.nextPage && !loading && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                onClick={() => runSearch(query.trim(), filter, results.nextPage)}
                className="rounded-full"
              >
                Load more
              </Button>
            </div>
          )}
          {loading && results && (
            <div className="mt-4 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </>
      )}
    </div>
  )
}
