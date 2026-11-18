'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { toast } from 'sonner'
import type { MusicItem, QueuedTrack } from '@/lib/types'
import { youtubeEngine, YouTubeEngine } from '@/engine/youtube'
import { hifiEngine } from '@/engine/hifi'
import {
  updateMediaMetadata,
  setMediaActionHandlers,
  updateMediaPositionState,
  setMediaPlaybackState,
} from '@/engine/media-session'
import { useSettings, eqGainsFor } from './settings'
import { useOffline } from './offline'
import { useKeys } from './keys'
import { audioUrlFor } from '@/lib/offline'
import { useCast } from '@/lib/cast'
import { useSleepTimer } from '@/lib/sleep-timer'
import type { AudioStream } from '@/lib/types'

export type RepeatMode = 'off' | 'all' | 'one'

interface PlayerState {
  queue: QueuedTrack[]
  index: number
  isPlaying: boolean
  isBuffering: boolean
  position: number
  duration: number
  shuffle: boolean
  repeat: RepeatMode
  hifiActive: boolean
  embedMode: boolean // visible YouTube embed player is driving playback
  hiResArt: string | null
  loadingTrackId: string | null
  // actions
  init: () => void
  playItem: (item: MusicItem, context?: MusicItem[]) => void
  playQueueAt: (i: number) => void
  addToQueue: (item: MusicItem) => void
  playNext: (item: MusicItem) => void
  removeFromQueue: (i: number) => void
  /** Reorder the queue: move the track at absolute index `from` to `to` (splice semantics). */
  moveInQueue: (from: number, to: number) => void
  clearQueue: () => void
  togglePlay: () => void
  next: () => void
  prev: () => void
  seek: (seconds: number) => void
  setVolume: (v: number) => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  /** Relative seek from the current position (seconds, may be negative). */
  seekBy: (delta: number) => void
  /** Mute / unmute. Remembers the pre-mute volume and restores it on unmute. */
  toggleMute: () => void
  muted: boolean
  startRadio: (opts?: { mood?: string; era?: string; label?: string }) => Promise<void>
  castCurrent: () => Promise<boolean>
  resumeHandoff: (opts: {
    items: MusicItem[]
    index: number
    position: number
    shuffle?: boolean
    repeat?: RepeatMode
  }) => void
}

function toQueued(item: MusicItem): QueuedTrack {
  return { ...item, queuedAt: Date.now() }
}

/**
 * Same-origin audio URL for a track — mirrors the resolution order of
 * startPlayback (offline cache → Audius proxy → Hi-Fi API proxy).
 * Returns null when gapless preload is not possible (iframe mode / unknown).
 */
function resolveAudioUrl(item: MusicItem): string | null {
  const offline = useOffline.getState()
  if (offline.isDownloaded(item.id)) {
    const u = offline.urlFor(item.id)
    if (u) return u
  }
  if (item.source === 'au') return `/api/audius/stream/${item.id}`
  if (item.source === 'jm') {
    const key = useKeys.getState().jamendoKey
    return `/api/jamendo/stream/${item.id}${key ? `?key=${encodeURIComponent(key)}` : ''}`
  }
  if (useSettings.getState().playbackMode === 'hifi') return `/api/audio/${item.id}`
  return null
}

/** Best-quality stream from our cached /api/streams resolver (server-side). */
async function resolveBestStream(
  id: string,
  maxBitrate: number
): Promise<AudioStream | null> {
  try {
    const res = await fetch(`/api/streams/${encodeURIComponent(id)}`, {
      signal: AbortSignal.timeout(9000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { audioStreams?: AudioStream[] }
    const streams = (data.audioStreams ?? []).filter((s) => s.url && s.bitrate > 0)
    if (streams.length === 0) return null
    const sorted = [...streams].sort((a, b) => b.bitrate - a.bitrate)
    const isM4a = (s: AudioStream) => /mp4a|m4a|audio\/mp4/i.test(s.mimeType || '')
    if (maxBitrate > 0) {
      const pool = sorted.filter((s) => s.bitrate <= maxBitrate * 1000)
      const usable = pool.length > 0 ? pool : sorted
      return usable.find(isM4a) ?? usable[0]
    }
    return sorted.find((s) => isM4a(s) && s.bitrate >= 120_000) ?? sorted[0]
  } catch {
    return null
  }
}

function shuffleIndices(len: number, first: number): number[] {
  const rest = [...Array(len).keys()].filter((i) => i !== first)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  return [first, ...rest]
}

let initialized = false
let consecutiveErrors = 0
/** Volume to restore when unmuting (not part of persisted state). */
let preMuteVolume = 80
// Auto-mix (Day 18): single-flight guard + throttle.
let autoMixBusy = false
let autoMixLastAt = 0

export const usePlayer = create<PlayerState>()(
  persist(
    (set, get) => {
      const current = () => get().queue[get().index] ?? null

      function sideEffects(item: MusicItem) {
        // Fire-and-forget: hi-res artwork upgrade + history record (safe offline)
        if (item.source !== 'au') {
          fetch(`/api/artwork?title=${encodeURIComponent(item.title)}&artist=${encodeURIComponent(item.artist)}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
              if (d?.url && current()?.id === item.id) set({ hiResArt: d.url })
            })
            .catch(() => {})
        }
        fetch('/api/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: item.id,
            title: item.title,
            artist: item.artist,
            artwork: item.artwork,
            duration: item.duration,
            source: item.source === 'au' ? 'au' : 'yt',
          }),
        }).catch(() => {})
      }

      function stopLocalEngines() {
        hifiEngine.active = false
        hifiEngine.stop()
        youtubeEngine.stop()
      }

      /** Day 25: load the per-source EQ profile into the Web Audio chain. */
      function applyEqFor(item: MusicItem) {
        hifiEngine.setEqGains(eqGainsFor(useSettings.getState().eqProfiles, item.source))
      }

      /** Pre-buffer the next queue track into the Hi-Fi standby element. */
      function schedulePreload() {
        const s = get()
        if (!useSettings.getState().gaplessPlayback) return
        if (!s.hifiActive || s.queue.length === 0) return
        const nextIdx = s.index + 1
        const nextItem =
          s.repeat === 'one'
            ? s.queue[s.index] // re-preload the current track → instant repeat-one
            : nextIdx < s.queue.length
              ? s.queue[nextIdx]
              : s.repeat === 'all'
                ? s.queue[0]
                : undefined
        if (!nextItem) return
        const url = resolveAudioUrl(nextItem)
        if (url) hifiEngine.preload(url)
      }

      /**
       * Day 18 — Auto-mix: when the queue is about to run dry (≤2 tracks
       * remaining), silently fetch similar tracks and append them so the
       * music never stops. Throttled to one attempt per 30s.
       */
      async function maybeExtendQueue() {
        const s = get()
        const { autoMix, autoplayRadio } = useSettings.getState()
        if (!autoMix || autoMixBusy) return
        if (s.repeat === 'one' || s.queue.length === 0) return
        const remaining = s.queue.length - (s.index + 1)
        if (remaining > 2) return
        if (Date.now() - autoMixLastAt < 30_000) return
        const cur = current()
        if (!cur) return
        autoMixBusy = true
        autoMixLastAt = Date.now()
        try {
          const res = await fetch(
            `/api/radio/${cur.id}?title=${encodeURIComponent(cur.title)}&artist=${encodeURIComponent(cur.artist)}`,
            { signal: AbortSignal.timeout(9000) }
          )
          if (!res.ok) return
          const data = await res.json()
          const fresh: MusicItem[] = (data.items || []).filter(
            (x: MusicItem) =>
              !s.queue.some((q) => q.id === x.id && (q.source ?? 'yt') === (x.source ?? 'yt'))
          )
          if (fresh.length > 0) {
            set((st) => ({ queue: [...st.queue, ...fresh.slice(0, 6).map(toQueued)] }))
            toast(`Auto-mix: +${Math.min(fresh.length, 6)} similar songs`, {
              id: 'auto-mix',
              description: 'Queue extended so the music keeps flowing.',
            })
          }
        } catch {
          // Silent — auto-mix must never interrupt playback.
        } finally {
          autoMixBusy = false
        }
        // Nudge radio autoplay so end-of-queue still resolves if extension failed.
        void autoplayRadio
      }

      async function startPlayback(item: MusicItem, startSeconds = 0) {
        const mode = useSettings.getState().playbackMode
        set({
          loadingTrackId: item.id,
          isBuffering: true,
          hiResArt: null,
          position: startSeconds,
          embedMode: false,
        })
        updateMediaMetadata(item)
        setMediaPlaybackState('paused')

        // Casting: hand off to the receiver instead of local engines
        if (useCast.getState().connected) {
          const ok = await useCast
            .getState()
            .actions.castTrack(
              { id: item.id, source: item.source, title: item.title, artist: item.artist, artwork: item.artwork },
              audioUrlFor(item.id, item.source)
            )
          if (ok) {
            stopLocalEngines()
            set({ hifiActive: false, isBuffering: false, loadingTrackId: null, isPlaying: true })
            setMediaPlaybackState('playing')
            sideEffects(item)
            return
          }
          toast.error('Could not cast — playing locally')
        }

        // 1) Cached offline copy → play from device (works without internet)
        const offline = useOffline.getState()
        if (offline.isDownloaded(item.id)) {
          const url = offline.urlFor(item.id)
          if (url) {
            // Mark active BEFORE play(): 'playing' can fire before the await resolves
            set({ hifiActive: true })
            const ok = await hifiEngine.playUrl(url, startSeconds)
            if (ok) {
              applyEqFor(item)
              set({ isBuffering: false, loadingTrackId: null, embedMode: false })
              schedulePreload()
              sideEffects(item)
              return
            }
            set({ hifiActive: false })
          }
        }

        // 2) Jamendo tracks stream via our same-origin proxy (CC-licensed mp3)
        if (item.source === 'jm') {
          const key = useKeys.getState().jamendoKey
          set({ hifiActive: true })
          const ok = await hifiEngine.playUrl(
            `/api/jamendo/stream/${item.id}${key ? `?key=${encodeURIComponent(key)}` : ''}`,
            startSeconds,
            { watchdogMs: 10000 }
          )
          if (ok) {
            applyEqFor(item)
            set({ isBuffering: false, loadingTrackId: null, embedMode: false })
            schedulePreload()
            sideEffects(item)
            return
          }
          set({ hifiActive: false })
          stopLocalEngines()
          set({ isBuffering: false, loadingTrackId: null, isPlaying: false })
          setMediaPlaybackState('paused')
          toast.error('Jamendo stream unavailable', {
            description: key
              ? item.title.slice(0, 48)
              : 'Add your free Jamendo key in Explore to play Jamendo tracks.',
          })
          return
        }

        // 3) Audius tracks stream via our same-origin proxy (EQ-capable)
        if (item.source === 'au') {
          set({ hifiActive: true })
          const ok = await hifiEngine.playUrl(`/api/audius/stream/${item.id}`, startSeconds, {
            watchdogMs: 10000,
          })
          if (ok) {
            applyEqFor(item)
            set({ isBuffering: false, loadingTrackId: null, embedMode: false })
            schedulePreload()
            sideEffects(item)
            return
          }
          set({ hifiActive: false })
          stopLocalEngines()
          set({ isBuffering: false, loadingTrackId: null, isPlaying: false })
          setMediaPlaybackState('paused')
          toast.error('Audius stream unavailable', { description: item.title.slice(0, 48) })
          return
        }

        // 3) YouTube — Hi-Fi mode: resolve once via our cached resolver, play the
        //    direct stream in the browser (no serverless streaming limits).
        //    A watchdog keeps a stalled stream from hanging "Buffering…" forever.
        let hifiOk = false
        if (mode === 'hifi') {
          const best = await resolveBestStream(item.id, useSettings.getState().maxBitrate)
          if (best?.url) {
            set({ hifiActive: true })
            hifiOk = await hifiEngine.playUrl(best.url, startSeconds, { watchdogMs: 8000 })
            if (hifiOk) applyEqFor(item)
          }
          if (!hifiOk) {
            set({ hifiActive: false })
            toast.info('Direct stream unavailable — using YouTube player', {
              description: 'Hi-Fi streams are limited right now; playback continues in stable mode.',
            })
          }
        }

        // 4) Stable fallback: YouTube's official embed player — visible video
        //    bubble. Hidden/zero-size embeds trigger YouTube's bot check, so the
        //    player stays genuinely visible while it drives playback.
        if (!hifiOk) {
          hifiEngine.active = false
          hifiEngine.stop() // stop any still-playing direct audio before the iframe takes over
          set({ embedMode: true })
          await youtubeEngine.play(item.id, startSeconds)
          const vol = useSettings.getState().volume
          youtubeEngine.setVolume(vol)
        } else {
          set({ embedMode: false })
        }

        set({ hifiActive: hifiOk, isBuffering: false, loadingTrackId: null })
        if (hifiOk) schedulePreload()
        sideEffects(item)
      }

      async function maybeRadioThenNext(auto: boolean) {
        const s = get()
        const { autoplayRadio } = useSettings.getState()
        if (autoplayRadio) {
          const cur = current()
          if (cur) {
            try {
              // Audius tracks: radio = Audius trending pool
              const res = await fetch(
                cur.source === 'au'
                  ? '/api/audius/trending'
                  : `/api/radio/${cur.id}?title=${encodeURIComponent(cur.title)}&artist=${encodeURIComponent(cur.artist)}`
              )
              if (res.ok) {
                const data = await res.json()
                const items: MusicItem[] = (data.items || []).filter(
                  (x: MusicItem) =>
                    !s.queue.some((q) => q.id === x.id && (q.source ?? 'yt') === (x.source ?? 'yt'))
                )
                if (items.length > 0) {
                  set({ queue: [...s.queue, ...items.map(toQueued)] })
                  get().playQueueAt(get().queue.length - items.length)
                  return
                }
              }
            } catch {}
          }
        }
        set({ isPlaying: false })
        setMediaPlaybackState('paused')
        if (auto) toast('Queue ended', { description: 'Radio autoplay is off in Settings.' })
      }

      return {
        queue: [],
        index: -1,
        isPlaying: false,
        isBuffering: false,
        position: 0,
        duration: 0,
        shuffle: false,
        repeat: 'off',
        hifiActive: false,
        embedMode: false,
        hiResArt: null,
        loadingTrackId: null,
        muted: false,

        init: () => {
          if (initialized || typeof window === 'undefined') return
          initialized = true
          youtubeEngine.setEvents({
            onState: (state) => {
              const s = get()
              if (s.hifiActive) return // ignore iframe events while hifi drives
              if (state === 'playing') {
                consecutiveErrors = 0
                set({ isPlaying: true, isBuffering: false, duration: youtubeEngine.getDuration() || s.duration })
                setMediaPlaybackState('playing')
              } else if (state === 'paused') {
                set({ isPlaying: false })
                setMediaPlaybackState('paused')
              } else if (state === 'buffering') {
                set({ isBuffering: true })
              } else if (state === 'ended') {
                handleEnded()
              }
            },
            onTime: (cur, dur) => {
              const s = get()
              if (s.hifiActive) return
              if (dur > 0) set({ duration: dur })
              set({ position: cur })
              updateMediaPositionState(cur, dur || s.duration)
              // Auto-mix: keep the queue topped-up near the end (Day 18)
              if (dur > 0 && dur - cur < 45) void maybeExtendQueue()
            },
            onError: (code) => {
              const s = get()
              if (s.hifiActive) return
              const cur = current()
              consecutiveErrors += 1
              if (consecutiveErrors >= 4) {
                consecutiveErrors = 0
                set({ isPlaying: false, isBuffering: false })
                setMediaPlaybackState('paused')
                toast.error('Playback is blocked right now', {
                  description:
                    'Several tracks failed in a row. Your network may be blocking embedded playback — try again later or from a different network.',
                })
                return
              }
              toast.error('Cannot play this track', {
                description:
                  cur?.title && YouTubeEngine.isUnplayable(code)
                    ? `"${cur.title.slice(0, 40)}" doesn't allow embedding. Skipping…`
                    : `Player error (code ${code}). Skipping…`,
              })
              setTimeout(() => get().next(), 800)
            },
          })
          hifiEngine.setEvents({
            onState: (state) => {
              const s = get()
              if (!s.hifiActive) return
              if (state === 'playing') {
                consecutiveErrors = 0
                set({ isPlaying: true, isBuffering: false, duration: hifiEngine.getDuration() || s.duration })
                setMediaPlaybackState('playing')
              } else if (state === 'paused') {
                set({ isPlaying: false })
                setMediaPlaybackState('paused')
              } else if (state === 'ended') {
                handleEnded()
              }
            },
            onTime: (cur, dur) => {
              const s = get()
              if (!s.hifiActive) return
              if (dur > 0) set({ duration: dur })
              set({ position: cur })
              updateMediaPositionState(cur, dur || s.duration)
              // Late preload: covers seeks, slow starts, and long first tracks.
              if (dur > 0 && dur - cur < 25) schedulePreload()
              // Auto-mix: keep the queue topped-up near the end (Day 18)
              if (dur > 0 && dur - cur < 45) void maybeExtendQueue()
            },
            onError: () => {
              if (!get().hifiActive) return
              toast.error('Stream failed — falling back to YouTube player')
              set({ hifiActive: false })
              const cur = current()
              if (cur) {
                const pos = get().position
                set({ embedMode: true })
                youtubeEngine.play(cur.id, pos)
                youtubeEngine.setVolume(useSettings.getState().volume)
              }
            },
          })
          setMediaActionHandlers({
            onPlay: () => get().togglePlay(),
            onPause: () => get().togglePlay(),
            onPrev: () => get().prev(),
            onNext: () => get().next(),
            onSeekTo: (sec) => get().seek(sec),
            onStop: () => get().togglePlay(),
          })
          // Cast session lifecycle: when the receiver disconnects, stop local UI state
          useCast.subscribe((cast, prev) => {
            if (prev.connected && !cast.connected) {
              set({ isPlaying: false, hifiActive: false })
              setMediaPlaybackState('paused')
            }
          })
        },

        playItem: (item, context) => {
          const s = get()
          let queue = s.queue
          let index = 0
          if (context && context.length > 0) {
            const q = context.map(toQueued)
            index = Math.max(0, q.findIndex((x) => x.id === item.id))
            if (s.shuffle) {
              const order = shuffleIndices(q.length, index)
              queue = order.map((i) => q[i])
              index = 0
            } else {
              queue = q
            }
          } else {
            const existing = s.queue.findIndex((x) => x.id === item.id)
            if (existing >= 0) {
              index = s.shuffle ? s.index : existing
            } else if (s.shuffle && s.queue.length > 0) {
              queue = [toQueued(item), ...s.queue]
              index = 0
            } else {
              queue = [...s.queue.slice(0, s.index + 1), toQueued(item), ...s.queue.slice(s.index + 1)]
              index = s.index + 1
            }
          }
          set({ queue, index })
          startPlayback(queue[index])
        },

        playQueueAt: (i) => {
          const s = get()
          if (i < 0 || i >= s.queue.length) return
          set({ index: i })
          startPlayback(s.queue[i])
        },

        addToQueue: (item) => {
          set((s) => ({ queue: [...s.queue, toQueued(item)] }))
          toast.success('Added to queue', { description: item.title.slice(0, 50) })
        },

        playNext: (item) => {
          set((s) => {
            const queue = [...s.queue]
            queue.splice(s.index + 1, 0, toQueued(item))
            return { queue }
          })
          toast.success('Playing next', { description: item.title.slice(0, 50) })
        },

        removeFromQueue: (i) => {
          set((s) => {
            const queue = s.queue.filter((_, idx) => idx !== i)
            let index = s.index
            if (i < s.index) index -= 1
            return { queue, index: Math.min(index, queue.length - 1) }
          })
        },

        moveInQueue: (from, to) => {
          if (from === to) return
          set((s) => {
            if (
              from < 0 ||
              to < 0 ||
              from >= s.queue.length ||
              to >= s.queue.length ||
              from === to
            )
              return {}
            const queue = [...s.queue]
            const [moved] = queue.splice(from, 1)
            queue.splice(to, 0, moved)
            return { queue }
          })
        },

        clearQueue: () => {
          if (useCast.getState().connected) useCast.getState().actions.stopCast()
          youtubeEngine.stop()
          hifiEngine.stop()
          set({
            queue: [],
            index: -1,
            isPlaying: false,
            position: 0,
            duration: 0,
            hiResArt: null,
            embedMode: false,
          })
        },

        castCurrent: async () => {
          const cur = current()
          if (!cur) return false
          const ok = await useCast
            .getState()
            .actions.castTrack(
              { id: cur.id, source: cur.source, title: cur.title, artist: cur.artist, artwork: cur.artwork },
              audioUrlFor(cur.id, cur.source)
            )
          if (ok) {
            stopLocalEngines()
            set({ hifiActive: false, isPlaying: true, isBuffering: false })
            setMediaPlaybackState('playing')
          } else {
            toast.error('No cast device found', {
              description: 'Chromecast and this device must be on the same Wi-Fi network.',
            })
          }
          return ok
        },

        togglePlay: () => {
          const s = get()
          const cur = current()
          if (!cur) return
          if (useCast.getState().connected && useCast.getState().trackId === cur.id) {
            useCast.getState().actions.toggleRemote()
            set({ isPlaying: useCast.getState().paused })
            setMediaPlaybackState(useCast.getState().paused ? 'playing' : 'paused')
            return
          }
          if (s.isPlaying) {
            if (s.hifiActive) hifiEngine.pause()
            else youtubeEngine.pause()
            set({ isPlaying: false })
            setMediaPlaybackState('paused')
          } else {
            if (s.hifiActive) hifiEngine.resume()
            else {
              const st = youtubeEngine.getState()
              if (st === 'unstarted' || st === 'cued' || youtubeEngine.currentVideoId !== cur.id) {
                startPlayback(cur, s.position > 5 ? s.position : 0)
              } else {
                youtubeEngine.resume()
              }
            }
            set({ isPlaying: true })
            setMediaPlaybackState('playing')
          }
        },

        next: () => {
          const s = get()
          if (s.queue.length === 0) return
          if (s.repeat === 'one') {
            get().playQueueAt(s.index)
            return
          }
          const nextIdx = s.index + 1
          if (nextIdx < s.queue.length) {
            get().playQueueAt(nextIdx)
          } else if (s.repeat === 'all') {
            get().playQueueAt(0)
          } else {
            maybeRadioThenNext(false)
          }
        },

        prev: () => {
          const s = get()
          if (s.position > 8) {
            get().seek(0)
            return
          }
          if (s.index > 0) get().playQueueAt(s.index - 1)
          else get().seek(0)
        },

        seek: (seconds) => {
          if (useCast.getState().connected) {
            useCast.getState().actions.seekRemote(seconds)
          } else if (get().hifiActive) hifiEngine.seek(seconds)
          else youtubeEngine.seek(seconds)
          set({ position: seconds })
          updateMediaPositionState(seconds, get().duration)
        },

        setVolume: (v) => {
          const vol = Math.max(0, Math.min(100, v))
          useSettings.getState().setVolume(vol)
          if (useCast.getState().connected) {
            useCast.getState().actions.setVolumeRemote(vol)
            return
          }
          // Hi-Fi engine previously ignored volume changes — apply it so the
          // volume shortcuts work in direct-stream mode too.
          if (get().hifiActive) hifiEngine.setVolume(vol)
          youtubeEngine.setVolume(vol)
        },

        seekBy: (delta) => {
          const s = get()
          // Prefer the live engine clock in Hi-Fi mode; the store position is
          // the last timeupdate snapshot and can lag by a second.
          const cur = s.hifiActive ? hifiEngine.getTime() : s.position
          const dur = s.duration > 0 ? s.duration : s.hifiActive ? hifiEngine.getDuration() : 0
          let target = cur + delta
          if (target < 0) target = 0
          if (dur > 0 && target > dur) target = Math.max(0, dur - 0.5)
          get().seek(target)
        },

        toggleMute: () => {
          const s = get()
          const castConnected = useCast.getState().connected
          if (s.muted) {
            const restore = preMuteVolume > 0 ? preMuteVolume : Math.max(useSettings.getState().volume, 10)
            set({ muted: false })
            get().setVolume(restore)
            if (s.hifiActive && !castConnected) hifiEngine.setVolume(restore)
          } else {
            preMuteVolume = useSettings.getState().volume
            set({ muted: true })
            get().setVolume(0)
            if (s.hifiActive && !castConnected) hifiEngine.setVolume(0)
          }
        },

        toggleShuffle: () => {
          const s = get()
          const newShuffle = !s.shuffle
          if (newShuffle && s.queue.length > 1) {
            const order = shuffleIndices(s.queue.length, s.index)
            set({ queue: order.map((i) => s.queue[i]), index: 0, shuffle: true })
          } else {
            set({ shuffle: newShuffle })
          }
        },

        cycleRepeat: () => {
          const modes: RepeatMode[] = ['off', 'all', 'one']
          const i = modes.indexOf(get().repeat)
          set({ repeat: modes[(i + 1) % modes.length] })
        },

        resumeHandoff: ({ items, index, position, shuffle, repeat }) => {
          const queue = items.map(toQueued)
          if (queue.length === 0) return
          const idx = Math.max(0, Math.min(queue.length - 1, index))
          set({
            queue,
            index: idx,
            hiResArt: null,
            ...(typeof shuffle === 'boolean' ? { shuffle } : {}),
            ...(repeat ? { repeat } : {}),
          })
          startPlayback(queue[idx], position > 3 ? position : 0)
        },

        startRadio: async (opts) => {
          const cur = current()
          if (!cur) {
            toast.error('Play something first')
            return
          }
          const { mood = '', era = '', label } = opts ?? {}
          toast.loading(label ?? 'Starting radio…', { id: 'radio' })
          try {
            const params = new URLSearchParams({
              title: cur.title,
              artist: cur.artist,
            })
            if (mood) params.set('mood', mood)
            if (era) params.set('era', era)
            const res = await fetch(`/api/radio/${cur.id}?${params.toString()}`)
            const data = await res.json()
            const items: MusicItem[] = (data.items || []).filter(
              (x: MusicItem) => !get().queue.some((q) => q.id === x.id && (q.source ?? 'yt') === (x.source ?? 'yt'))
            )
            if (items.length === 0) {
              toast.error('No radio tracks found', { id: 'radio' })
              return
            }
            set((s) => ({ queue: [...s.queue, ...items.map(toQueued)] }))
            toast.success(label ? `${label}: added ${items.length} tracks` : `Radio: added ${items.length} tracks`, {
              id: 'radio',
            })
            if (!get().isPlaying) get().playQueueAt(get().index + 1)
          } catch {
            toast.error('Radio unavailable right now', { id: 'radio' })
          }
        },
      }

      async function handleEnded() {
        // Sleep timer (Day 11): "stop after this track" mode — enforce here so
        // it works even when the sleep dialog is not mounted.
        const sleep = useSleepTimer.getState()
        if (sleep.mode === 'track-end') {
          sleep.cancel()
          set({ isPlaying: false })
          setMediaPlaybackState('paused')
          toast('Sleep timer — stopped after this track', {
            description: 'Sweet dreams. Play again any time.',
          })
          return
        }
        const s = get()
        if (s.repeat === 'one') {
          get().playQueueAt(s.index) // playUrl promotion makes this near-instant
          return
        }
        const nextIdx = s.index + 1
        const hasNext = nextIdx < s.queue.length
        const wraps = !hasNext && s.repeat === 'all' && s.queue.length > 0
        if (hasNext || wraps) {
          const idx = wraps ? 0 : nextIdx
          const item = s.queue[idx]
          const gaplessReady =
            useSettings.getState().gaplessPlayback &&
            s.hifiActive &&
            item != null &&
            hifiEngine.getPreloadedUrl() !== null
          if (item && gaplessReady) {
            // ZERO-GAP advance: the next track is already buffered in standby.
            set({
              index: idx,
              isPlaying: true,
              isBuffering: true,
              position: 0,
              hiResArt: null,
              loadingTrackId: null,
            })
            const ok = await hifiEngine.swapToPreloaded()
            if (ok) {
              applyEqFor(item)
              set({ isBuffering: false })
              updateMediaMetadata(item)
              setMediaPlaybackState('playing')
              sideEffects(item)
              schedulePreload()
              return
            }
            set({ isPlaying: false }) // promotion failed → normal path below
          }
          get().playQueueAt(idx)
          return
        }
        maybeRadioThenNext(true)
      }
    },
    {
      name: 'dhun-player',
      partialize: (s) => ({
        queue: s.queue,
        index: s.index,
        shuffle: s.shuffle,
        repeat: s.repeat,
      }),
    }
  )
)
