// Dhun — MediaSession bridge: lockscreen / notification / keyboard / car controls
// Q2.7+Q2.8 upgrade: correct artwork MIME + full size ladder (lockscreen wants
// several sizes), hi-res refresh, seekforward/seekbackward for steering-wheel
// and Bluetooth AVRCP scrobblers, per-handler guards, and a full clear.
import type { MusicItem } from '@/lib/types'

type Handlers = {
  onPlay: () => void
  onPause: () => void
  onPrev: () => void
  onNext: () => void
  onSeekTo: (seconds: number) => void
  /** Relative seek in seconds (+forward / −backward) — Bluetooth/car + iOS scrubber jumps */
  onSeekBy: (delta: number) => void
  onStop: () => void
}

/** Lockscreen/Android Auto show best results with a ladder of sizes. */
const ART_SIZES = ['96x96', '128x128', '192x192', '256x256', '384x384', '512x512']

function artType(url: string): string {
  if (/\.png(\?|$)/i.test(url)) return 'image/png'
  if (/\.webp(\?|$)/i.test(url)) return 'image/webp'
  return 'image/jpeg' // ytimg + iTunes artwork are JPEGs
}

function artworkEntries(art: string | null | undefined) {
  if (!art) return []
  const type = artType(art)
  return ART_SIZES.map((sizes) => ({ src: art, sizes, type }))
}

export function updateMediaMetadata(item: MusicItem | null, hiResArt?: string | null) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  if (!item) return
  try {
    const art = hiResArt || item.artwork
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: item.title,
      artist: item.artist,
      album: item.album || 'Dhun',
      artwork: artworkEntries(art),
    })
  } catch {}
}

function safeSetAction(name: MediaSessionAction, fn: (details?: any) => void) {
  try {
    navigator.mediaSession.setActionHandler(name, fn)
  } catch {
    /* unsupported action on this browser — skip honestly */
  }
}

export function setMediaActionHandlers(h: Handlers) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  safeSetAction('play', h.onPlay)
  safeSetAction('pause', h.onPause)
  safeSetAction('previoustrack', h.onPrev)
  safeSetAction('nexttrack', h.onNext)
  safeSetAction('seekto', (details: any) => {
    if (typeof details?.seekTime === 'number' && details.fastSeek !== true) h.onSeekTo(details.seekTime)
    else if (typeof details?.seekTime === 'number') h.onSeekTo(details.seekTime)
  })
  safeSetAction('seekforward', (details: any) => {
    const step = typeof details?.seekOffset === 'number' ? details.seekOffset : 10
    h.onSeekBy(Math.min(Math.max(step, 1), 60))
  })
  safeSetAction('seekbackward', (details: any) => {
    const step = typeof details?.seekOffset === 'number' ? details.seekOffset : 10
    h.onSeekBy(-Math.min(Math.max(step, 1), 60))
  })
  safeSetAction('stop', h.onStop)
}

/** Remove all handlers + metadata (full stop — nothing to control anymore). */
export function clearMediaSession() {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  try {
    for (const name of ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto', 'seekforward', 'seekbackward', 'stop'] as MediaSessionAction[]) {
      try {
        navigator.mediaSession.setActionHandler(name, null)
      } catch {}
    }
    navigator.mediaSession.metadata = null
    navigator.mediaSession.playbackState = 'none'
  } catch {}
}

export function updateMediaPositionState(current: number, duration: number, rate = 1) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  try {
    if (!Number.isFinite(duration) || duration <= 0) return
    navigator.mediaSession.setPositionState({
      duration,
      playbackRate: rate,
      position: Math.min(Math.max(0, current), duration),
    })
  } catch {}
}

export function setMediaPlaybackState(state: 'playing' | 'paused' | 'none') {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  try {
    navigator.mediaSession.playbackState = state
  } catch {}
}
