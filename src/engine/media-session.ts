// Dhun — MediaSession bridge: lockscreen / notification / keyboard media controls
import type { MusicItem } from '@/lib/types'

type Handlers = {
  onPlay: () => void
  onPause: () => void
  onPrev: () => void
  onNext: () => void
  onSeekTo: (seconds: number) => void
  onStop: () => void
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
      artwork: art
        ? [
            { src: art, sizes: '512x512', type: 'image/png' },
            { src: art, sizes: '256x256', type: 'image/png' },
          ]
        : [],
    })
  } catch {}
}

export function setMediaActionHandlers(h: Handlers) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  const ms = navigator.mediaSession
  try {
    ms.setActionHandler('play', h.onPlay)
    ms.setActionHandler('pause', h.onPause)
    ms.setActionHandler('previoustrack', h.onPrev)
    ms.setActionHandler('nexttrack', h.onNext)
    ms.setActionHandler('seekto', (details: any) => {
      if (typeof details.seekTime === 'number') h.onSeekTo(details.seekTime)
    })
    ms.setActionHandler('stop', h.onStop)
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
