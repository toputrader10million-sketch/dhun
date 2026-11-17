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
import { useSettings } from './settings'

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
  hiResArt: string | null
  loadingTrackId: string | null
  // actions
  init: () => void
  playItem: (item: MusicItem, context?: MusicItem[]) => void
  playQueueAt: (i: number) => void
  addToQueue: (item: MusicItem) => void
  playNext: (item: MusicItem) => void
  removeFromQueue: (i: number) => void
  clearQueue: () => void
  togglePlay: () => void
  next: () => void
  prev: () => void
  seek: (seconds: number) => void
  setVolume: (v: number) => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  startRadio: () => Promise<void>
}

function toQueued(item: MusicItem): QueuedTrack {
  return { ...item, queuedAt: Date.now() }
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

export const usePlayer = create<PlayerState>()(
  persist(
    (set, get) => {
      const current = () => get().queue[get().index] ?? null

      async function startPlayback(item: MusicItem, startSeconds = 0) {
        const mode = useSettings.getState().playbackMode
        set({ loadingTrackId: item.id, isBuffering: true, hiResArt: null, position: startSeconds })
        updateMediaMetadata(item)
        setMediaPlaybackState('paused')

        let hifiOk = false
        if (mode === 'hifi') {
          hifiOk = await hifiEngine.play(item.id, {
            maxBitrate: useSettings.getState().maxBitrate,
          })
          if (!hifiOk) {
            toast.info('Direct stream unavailable — using stable mode', {
              description: 'Switch to Hi-Fi mode later in Settings if instances recover.',
            })
          }
        }

        if (!hifiOk) {
          hifiEngine.active = false
          await youtubeEngine.play(item.id, startSeconds)
          const vol = useSettings.getState().volume
          youtubeEngine.setVolume(vol)
        }

        set({ hifiActive: hifiOk, isBuffering: false, loadingTrackId: null })
        // Fire-and-forget: hi-res artwork upgrade + history record
        fetch(`/api/artwork?title=${encodeURIComponent(item.title)}&artist=${encodeURIComponent(item.artist)}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (d?.url && current()?.id === item.id) set({ hiResArt: d.url })
          })
          .catch(() => {})
        fetch('/api/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: item.id,
            title: item.title,
            artist: item.artist,
            artwork: item.artwork,
            duration: item.duration,
          }),
        }).catch(() => {})
      }

      async function maybeRadioThenNext(auto: boolean) {
        const s = get()
        const { autoplayRadio } = useSettings.getState()
        if (autoplayRadio) {
          const cur = current()
          if (cur) {
            try {
              const res = await fetch(
                `/api/radio/${cur.id}?title=${encodeURIComponent(cur.title)}&artist=${encodeURIComponent(cur.artist)}`
              )
              if (res.ok) {
                const data = await res.json()
                const items: MusicItem[] = (data.items || []).filter(
                  (x: MusicItem) => !s.queue.some((q) => q.id === x.id)
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
        hiResArt: null,
        loadingTrackId: null,

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
            },
            onError: () => {
              if (!get().hifiActive) return
              toast.error('Stream failed — falling back to stable mode')
              set({ hifiActive: false })
              const cur = current()
              if (cur) {
                const pos = get().position
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

        clearQueue: () => {
          youtubeEngine.stop()
          hifiEngine.stop()
          set({ queue: [], index: -1, isPlaying: false, position: 0, duration: 0, hiResArt: null })
        },

        togglePlay: () => {
          const s = get()
          const cur = current()
          if (!cur) return
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
          if (get().hifiActive) hifiEngine.seek(seconds)
          else youtubeEngine.seek(seconds)
          set({ position: seconds })
          updateMediaPositionState(seconds, get().duration)
        },

        setVolume: (v) => {
          const vol = Math.max(0, Math.min(100, v))
          useSettings.getState().setVolume(vol)
          youtubeEngine.setVolume(vol)
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

        startRadio: async () => {
          const cur = current()
          if (!cur) {
            toast.error('Play something first')
            return
          }
          toast.loading('Starting radio…', { id: 'radio' })
          try {
            const res = await fetch(
              `/api/radio/${cur.id}?title=${encodeURIComponent(cur.title)}&artist=${encodeURIComponent(cur.artist)}`
            )
            const data = await res.json()
            const items: MusicItem[] = (data.items || []).filter(
              (x: MusicItem) => !get().queue.some((q) => q.id === x.id)
            )
            if (items.length === 0) {
              toast.error('No radio tracks found', { id: 'radio' })
              return
            }
            set((s) => ({ queue: [...s.queue, ...items.map(toQueued)] }))
            toast.success(`Radio: added ${items.length} tracks`, { id: 'radio' })
            if (!get().isPlaying) get().playQueueAt(get().index + 1)
          } catch {
            toast.error('Radio unavailable right now', { id: 'radio' })
          }
        },
      }

      function handleEnded() {
        const s = get()
        if (s.repeat === 'one') {
          get().playQueueAt(s.index)
          return
        }
        const nextIdx = s.index + 1
        if (nextIdx < s.queue.length) {
          get().playQueueAt(nextIdx)
        } else if (s.repeat === 'all' && s.queue.length > 0) {
          get().playQueueAt(0)
        } else {
          maybeRadioThenNext(true)
        }
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
