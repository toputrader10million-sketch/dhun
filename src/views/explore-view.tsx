'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, KeyRound, ListMusic, Loader2, Search, Users, Disc3, Library, Youtube, AudioWaveform } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { TrackRow, TrackImage } from '@/components/track-row'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { MusicItem, SearchFilter, SearchResponse, TrackSource } from '@/lib/types'
import { SEARCH_FILTERS } from '@/lib/types'
import { usePlayer } from '@/store/player'
import { useUi } from '@/store/ui'
import { useKeys } from '@/store/keys'
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
  const [source, setSource] = useState<TrackSource>('yt')
  const [results, setResults] = useState<SearchResponse | null>(null)
  const [jmError, setJmError] = useState<string | null>(null)
  const [keyDialogOpen, setKeyDialogOpen] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [detail, setDetail] = useState<DetailState | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchSeed = useUi((s) => s.searchSeed)
  const clearSearchSeed = useUi((s) => s.clearSearchSeed)
  const playItem = usePlayer((s) => s.playItem)
  const jamendoKey = useKeys((s) => s.jamendoKey)
  const setJamendoKey = useKeys((s) => s.setJamendoKey)

  const runSearch = useCallback(
    (q: string, f: SearchFilter, page?: string, src: TrackSource = source) => {
      if (!q.trim()) return
      setLoading(true)
      setShowSuggestions(false)
      setJmError(null)
      const url =
        src === 'au'
          ? `/api/audius/search?q=${encodeURIComponent(q)}`
          : src === 'jm'
            ? `/api/jamendo/search?q=${encodeURIComponent(q)}&key=${encodeURIComponent(useKeys.getState().jamendoKey)}`
            : `/api/search?q=${encodeURIComponent(q)}&filter=${f}${page ? `&page=${encodeURIComponent(page)}` : ''}`
      fetch(url)
        .then((r) => (r.ok ? r.json() : r.json().catch(() => null).then((d) => Promise.reject(Object.assign(new Error(String(r.status)), { payload: d })))))
        .then((d: SearchResponse) => {
          const items = (d.items || []).map((it: MusicItem) => ({
            ...it,
            source: src === 'au' ? ('au' as const) : src === 'jm' ? ('jm' as const) : it.source,
          }))
          setResults((prev) =>
            page && prev && prev.filter === f
              ? { ...d, items: [...prev.items, ...items] }
              : { ...d, items, filter: src === 'au' || src === 'jm' ? ('music_songs' as const) : f }
          )
        })
        .catch((err: Error & { payload?: { error?: string; reason?: string } }) => {
          setResults({ items: [], filter: src === 'au' || src === 'jm' ? 'music_songs' : f })
          if (src === 'jm') {
            const reason = err.payload?.reason
            setJmError(
              reason === 'jamendo-key-required' || reason === 'jamendo-key-invalid'
                ? 'key'
                : 'Jamendo search failed — check your connection or key.'
            )
          }
        })
        .finally(() => setLoading(false))
    },
    [source]
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

  // Suggestions (YouTube only — Audius/Jamendo have no suggest endpoint)
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2 || !showSuggestions || source !== 'yt') return
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
      setSource('yt')
      setQuery(searchSeed)
      runSearch(searchSeed, 'music_songs', undefined, 'yt')
      clearSearchSeed()
      inputRef.current?.focus()
    }
  }, [searchSeed, runSearch, clearSearchSeed])

  const openDetail = async (item: MusicItem) => {
    if (filter === 'artists') {
      setQuery(item.artist || item.title)
      runSearch(item.artist || item.title, 'music_songs')
      return
    }
    if (source === 'au') return
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
        <div aria-hidden className="dhun-header-aura pointer-events-none absolute -inset-x-4 -top-12 h-40" />
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
          placeholder={
            source === 'au'
              ? 'Search Audius (indie artists)…'
              : source === 'jm'
                ? 'Search Jamendo (Creative Commons)…'
                : 'Search songs, artists, albums…'
          }
          className="relative pl-10 h-11 rounded-xl bg-accent/50 border-0"
          aria-label="Search music"
        />
        {suggestions.length > 0 && showSuggestions && (
          <div className="dhun-glass-strong absolute z-30 mt-1 w-full rounded-xl border bg-popover shadow-lg overflow-hidden">
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
          {/* source toggle: YouTube ↔ Audius ↔ Jamendo */}
          <div className="mb-3 flex items-center gap-2">
            <div className="inline-flex rounded-full border p-0.5 bg-accent/40">
              <button
                onClick={() => {
                  setSource('yt')
                  if (query.trim().length >= 2) runSearch(query.trim(), filter, undefined, 'yt')
                }}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-[background-color,transform] duration-150 inline-flex items-center gap-1.5 active:scale-95',
                  source === 'yt' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
                aria-pressed={source === 'yt'}
              >
                <Youtube className="h-3.5 w-3.5" /> YouTube
              </button>
              <button
                onClick={() => {
                  setSource('au')
                  setResults(null)
                  if (query.trim().length >= 2) runSearch(query.trim(), filter, undefined, 'au')
                }}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-[background-color,transform] duration-150 inline-flex items-center gap-1.5 active:scale-95',
                  source === 'au' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
                aria-pressed={source === 'au'}
              >
                <AudioWaveform className="h-3.5 w-3.5" /> Audius
              </button>
              <button
                onClick={() => {
                  setSource('jm')
                  setResults(null)
                  if (!useKeys.getState().jamendoKey) setKeyDialogOpen(true)
                  if (query.trim().length >= 2) runSearch(query.trim(), filter, undefined, 'jm')
                }}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-[background-color,transform] duration-150 inline-flex items-center gap-1.5 active:scale-95',
                  source === 'jm' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
                aria-pressed={source === 'jm'}
              >
                <KeyRound className="h-3.5 w-3.5" /> Jamendo
              </button>
            </div>
            {source === 'au' && (
              <p className="text-[11px] text-muted-foreground">
                Independent artists — streams directly, no YouTube needed.
              </p>
            )}
            {source === 'jm' && (
              <p className="text-[11px] text-muted-foreground">
                Creative Commons full tracks — legal downloads for offline.
              </p>
            )}
          </div>

          {/* Jamendo key hint / error */}
          {source === 'jm' && (jmError === 'key' || (!jamendoKey && jmError)) && (
            <div className="mb-4 rounded-xl border border-dashed bg-accent/30 p-4">
              <p className="text-sm font-medium flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" /> Free Jamendo key needed
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Jamendo gives every user a free non-commercial API key (devportal.jamendo.com). It stays on this
                device only — Dhun uses it to search and legally download Creative Commons music.
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" className="rounded-full" onClick={() => setKeyDialogOpen(true)}>
                  Add key
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-full"
                  onClick={() => window.open('https://devportal.jamendo.com/', '_blank', 'noopener')}
                >
                  Get a free key
                </Button>
              </div>
            </div>
          )}

          {/* Jamendo key dialog (BYO key, stored locally only) */}
          <Dialog open={keyDialogOpen} onOpenChange={setKeyDialogOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Connect Jamendo</DialogTitle>
                <DialogDescription>
                  Paste your free client_id from devportal.jamendo.com. It is saved in this browser only and used
                  for Creative Commons search, streaming and legal offline downloads.
                </DialogDescription>
              </DialogHeader>
              <Input
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="Jamendo client_id"
                aria-label="Jamendo client id"
                autoComplete="off"
                spellCheck={false}
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setKeyDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={!keyInput.trim()}
                  onClick={() => {
                    setJamendoKey(keyInput)
                    setKeyDialogOpen(false)
                    setJmError(null)
                    if (query.trim().length >= 2) runSearch(query.trim(), filter, undefined, 'jm')
                  }}
                >
                  Save &amp; search
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* filter chips (YouTube only) */}
          {source === 'yt' && (
            <div className="mb-4 flex gap-2 overflow-x-auto dhun-scroll pb-1">
              {SEARCH_FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-[background-color,transform] duration-150 active:scale-95',
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
          )}

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

          {(source === 'au' || filter === 'music_songs' || filter === 'videos') &&
            results?.items.map((item, i) => (
              <TrackRow
                key={`${item.id}-${i}`}
                item={item}
                index={i}
                context={results.items}
                showViews={filter === 'videos'}
              />
            ))}

          {source === 'yt' && (filter === 'albums' || filter === 'artists' || filter === 'playlists') && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {results?.items.map((item, i) => (
                <button
                  key={`${item.id}-${i}`}
                  className="group text-left transition-transform duration-150 ease-out active:scale-[0.97]"
                  onClick={() => openDetail(item)}
                >
                  <TrackImage
                    item={item}
                    className="aspect-square w-full rounded-2xl transition-[transform,box-shadow] duration-200 ease-out group-hover:-translate-y-1 group-hover:shadow-xl group-hover:shadow-primary/10"
                    rounded="rounded-xl"
                  />
                  <p className="mt-2 line-clamp-1 text-sm font-medium">{item.title}</p>
                  <p className="line-clamp-1 text-xs text-muted-foreground">{item.artist}</p>
                </button>
              ))}
            </div>
          )}

          {source === 'yt' && results?.nextPage && !loading && (
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
