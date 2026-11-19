'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, KeyRound, ListMusic, Loader2, Mic, Search, Users, Disc3, Library, Youtube, AudioWaveform, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
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
import { useT } from '@/lib/i18n'
import { useKeys } from '@/store/keys'
import { useSettings } from '@/store/settings'
import { useVoiceSearch, VOICE_LOCALE_BY_REGION, VOICE_ERROR_MESSAGES, type VoiceError } from '@/hooks/use-voice-search'
import { DiscoveryFeed } from '@/components/discovery-feed'
import { EmptyState } from '@/components/empty-state'
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

/* Day 16 — NL search plan shape (mirrors /api/ai/nl-search). */
interface NlPlan {
  interpretation: string
  queries: string[]
  chips: string[]
  source: 'ai' | 'rules'
}

const NL_HINT_RE =
  /(songs?|music|gaan|গান|playlist|vibe|feeling|feel|mood|drive|study|workout|gym|sleep|relax|rain|বৃষ্টি|sad|happy|romantic|love|ভালোবাসা|focus|party|chill|বাংলা|bangla|mix)/i

/** Heuristic: does this query read like a natural-language music request? */
function looksLikeNaturalLanguage(q: string): boolean {
  const words = q.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 4) return true
  if (words.length >= 2 && NL_HINT_RE.test(q)) return true
  // Non-Latin scripts (Bangla etc.) are almost always descriptive requests
  if (/[^\x00-\x7F]/.test(q) && words.length >= 2) return true
  return false
}

export function ExploreView() {
  const t = useT()
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
  // Day 16 — AI search state
  const [aiPlan, setAiPlan] = useState<NlPlan | null>(null)
  const [aiItems, setAiItems] = useState<MusicItem[]>([])
  const [aiLoading, setAiLoading] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const searchSeed = useUi((s) => s.searchSeed)
  const clearSearchSeed = useUi((s) => s.clearSearchSeed)
  const playItem = usePlayer((s) => s.playItem)
  const jamendoKey = useKeys((s) => s.jamendoKey)
  const setJamendoKey = useKeys((s) => s.setJamendoKey)
  const region = useSettings((s) => s.region)

  // Day 21 — voice search: speak a song/artist/mood, it lands in the search box
  // and runs the same search pipeline. Locale follows the music region
  // (Bangladesh → bn-BD, India → en-IN, …) so Bangla voice queries work.
  const voiceLocale = VOICE_LOCALE_BY_REGION[region] ?? 'en-US'
  const voice = useVoiceSearch({
    locale: voiceLocale,
    onFinal: (text) => {
      setQuery(text)
      runSearch(text, filter)
      toast.success('Voice search', { description: text })
    },
  })

  // Honest error surfacing for voice failures
  useEffect(() => {
    if (voice.error) {
      toast.error('Voice search', { description: VOICE_ERROR_MESSAGES[voice.error as VoiceError] })
      voice.clearError()
    }
  }, [voice.error, voice.clearError])

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

  /**
   * Day 16 — Ask Dhun AI: natural-language query → LLM plan → parallel
   * catalog searches → merged ranked results with an interpretation + chips.
   */
  const runAiSearch = useCallback(async (q: string) => {
    const text = q.trim()
    if (!text) return
    setAiPrompt(text)
    setAiLoading(true)
    setAiPlan(null)
    setAiItems([])
    try {
      const res = await fetch('/api/ai/nl-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text }),
      })
      if (!res.ok) throw new Error(String(res.status))
      const plan = (await res.json()) as NlPlan
      setAiPlan(plan)
      const searches = await Promise.allSettled(
        plan.queries.map((query) =>
          fetch(`/api/search?q=${encodeURIComponent(query)}&filter=music_songs`)
            .then((r) => (r.ok ? r.json() : { items: [] }))
            .then((d: { items?: MusicItem[] }) => d.items ?? [])
        )
      )
      // Interleave the per-query results, then dedupe.
      const merged: MusicItem[] = []
      const maxLen = Math.max(0, ...searches.map((s) => (s.status === 'fulfilled' ? s.value.length : 0)))
      for (let i = 0; i < maxLen; i++) {
        for (const s of searches) {
          if (s.status !== 'fulfilled') continue
          const it = s.value[i]
          if (it) merged.push(it)
        }
      }
      const seen = new Set<string>()
      const deduped = merged.filter((it) => {
        const k = `${it.source ?? 'yt'}:${it.id}`
        if (seen.has(k)) return false
        seen.add(k)
        return it.id && (it.duration === 0 || (it.duration >= 60 && it.duration <= 900))
      })
      setAiItems(deduped.slice(0, 40))
    } catch {
      setAiPlan({ interpretation: 'AI search is unavailable right now — showing a direct search instead.', queries: [text], chips: [], source: 'rules' })
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(text)}&filter=music_songs`)
        const d = await res.json()
        setAiItems((d.items ?? []).slice(0, 25))
      } catch {
        setAiItems([])
      }
    } finally {
      setAiLoading(false)
    }
  }, [])

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
            voice.listening
              ? t('Listening… speak now')
              : source === 'au'
                ? t('Search Audius (indie artists)…')
                : source === 'jm'
                  ? t('Search Jamendo (Creative Commons)…')
                  : t('Search songs, artists, albums…')
          }
          className="relative pl-10 pr-12 h-11 rounded-xl bg-accent/50 border-0"
          aria-label={t('Search music')}
        />
        {/* Day 21 — mic button (hidden entirely where Web Speech is unsupported) */}
        {voice.supported && (
          <button
            onClick={() => {
              if (voice.listening) {
                voice.stop()
              } else {
                setShowSuggestions(false)
                voice.start()
              }
            }}
            className={cn(
              'absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-full transition-[background-color,transform,color] duration-150 active:scale-90',
              voice.listening
                ? 'bg-primary text-primary-foreground dhun-pulse-glow'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
            aria-label={voice.listening ? 'Stop voice search' : 'Search by voice'}
            aria-pressed={voice.listening}
            title={voice.listening ? 'Stop listening' : `Search by voice (${voiceLocale})`}
          >
            {voice.listening ? <Mic className="h-4 w-4" /> : <Mic className="h-4 w-4" aria-hidden />}
          </button>
        )}
        {/* live interim caption while listening */}
        {voice.listening && (
          <div
            className="dhun-glass-strong absolute z-30 mt-1 w-full rounded-xl border px-4 py-2.5 text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            {voice.interim ? (
              <span className="text-foreground">{voice.interim}…</span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <span className="dhun-eq h-3"><span /><span /><span /></span>
                Listening — say a song, artist or mood ({voiceLocale})
              </span>
            )}
          </div>
        )}
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
            <Button variant="ghost" size="icon" onClick={() => setDetail(null)} aria-label={t('Back to results')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            {detail.cover && <TrackImage item={{ artwork: detail.cover, title: detail.title }} className="h-12 w-12" />}
            <h2 className="truncate text-lg font-bold">{detail.title}</h2>
            {detail.items.length > 0 && (
              <Button size="sm" className="ml-auto rounded-full" onClick={() => playItem(detail.items[0], detail.items)}>
                {t('Play all')}
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
                <Youtube className="h-3.5 w-3.5" /> {t('YouTube')}
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
                <AudioWaveform className="h-3.5 w-3.5" /> {t('Audius')}
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
                <KeyRound className="h-3.5 w-3.5" /> {t('Jamendo')}
              </button>
            </div>
            {source === 'au' && (
              <p className="text-[11px] text-muted-foreground">
                {t('Independent artists — streams directly, no YouTube needed.')}
              </p>
            )}
            {source === 'jm' && (
              <p className="text-[11px] text-muted-foreground">
                {t('Creative Commons full tracks — legal downloads for offline.')}
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
                  {FILTER_LABELS[f] ? t(FILTER_LABELS[f]) : FILTER_LABELS[f]}
                </button>
              ))}
            </div>
          )}

          {/* Day 16 — Ask Dhun AI trigger: natural-language queries on YouTube */}
          {source === 'yt' &&
            query.trim().length >= 3 &&
            looksLikeNaturalLanguage(query) &&
            !aiLoading &&
            (!aiPrompt || aiPrompt !== query.trim()) && (
              <div className="dhun-fade-up mb-4 rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-primary" /> {t("Sounds like you're describing music")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('Let Dhun AI read "{0}" and build the right search plan.', [query.trim()])}
                </p>
                <Button size="sm" className="mt-3 rounded-full gap-1.5" onClick={() => runAiSearch(query)}>
                  <Sparkles className="h-3.5 w-3.5" /> {t('Ask Dhun AI')}
                </Button>
              </div>
            )}

          {/* Day 16 — AI results panel */}
          {aiLoading && (
            <div className="dhun-fade-up mb-4 rounded-2xl border bg-accent/30 p-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Loader2 className="h-4 w-4 animate-spin text-primary" /> Dhun AI is planning your search…
              </p>
              <p className="mt-1 text-xs text-muted-foreground truncate">“{aiPrompt}”</p>
              <div className="mt-3 space-y-2">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-12 rounded-xl" />
                ))}
              </div>
            </div>
          )}

          {!aiLoading && aiPlan && (
            <div className="dhun-fade-up mb-4 rounded-2xl border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{aiPlan.interpretation}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Searched {aiPlan.queries.length} {aiPlan.queries.length === 1 ? 'query' : 'queries'}
                    {aiPlan.source === 'ai' ? ' · AI planner' : ' · smart rules'} · found {aiItems.length} tracks
                  </p>
                </div>
                <button
                  onClick={() => {
                    setAiPlan(null)
                    setAiItems([])
                    setAiPrompt('')
                  }}
                  className="rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Close AI results"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {aiPlan.chips.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {aiPlan.chips.map((chip) => (
                    <button
                      key={chip}
                      onClick={() => {
                        setQuery(chip)
                        runAiSearch(chip)
                      }}
                      className="rounded-full bg-accent px-3 py-1 text-xs font-medium transition-[background-color,transform] duration-150 hover:bg-primary hover:text-primary-foreground active:scale-95"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {!aiLoading && aiPlan && aiItems.length === 0 && (
            <EmptyState
              icon={ListMusic}
              title={t('No tracks matched this vibe')}
              hint={t('Try rephrasing — e.g. "romantic bangla songs for evening".')}
              className="mb-4"
            />
          )}

          {!aiLoading &&
            aiPlan &&
            aiItems.map((item, i) => (
              <TrackRow key={`ai-${item.id}-${i}`} item={item} index={i} context={aiItems} />
            ))}

          {/* Day 38 — Discovery feed while no search is active */}
          {source === 'yt' && !results && !loading && !aiPlan && <DiscoveryFeed />}

          {/* results */}
          {loading && !results && (
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-xl" />
              ))}
            </div>
          )}

          {results && results.items.length === 0 && !loading && (
            <EmptyState
              icon={ListMusic}
              title={query ? t('No results for "{0}"', [query]) : t('No results')}
              hint={t('Try a different search or another filter — the catalog covers nearly everything on YouTube.')}
              className="mt-8"
            />
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
