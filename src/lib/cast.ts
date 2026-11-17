'use client'
/* Dhun — Chromecast sender support via the official Cast Web SDK (loaded lazily).
 *
 * Usage:
 *   - Call useCast.getState().actions.init() ONCE from the app root (guards window;
 *     no-op when the SDK is unavailable, e.g. non-Chromium browsers).
 *   - castTrack(item, urlPath) loads a same-origin audio URL on the receiver —
 *     pass the offline-safe path (/api/audio/<id> or /api/audius/stream/<id>) so
 *     the receiver can stream straight from our origin.
 *   - The player store routes transport commands here when useCast.connected.
 *
 * The Cast SDK ships no TypeScript types and we cannot add dependencies, so the
 * globals below are typed minimally (`any`) and every touchpoint is guarded:
 * unavailable → available stays false and every action is a safe no-op.
 */
import { create } from 'zustand'

declare global {
  interface Window {
    __onGCastApiAvailable?: (available: boolean) => void
    chrome?: any // chrome.cast / chrome.cast.media namespaces from cast_sender.js
    cast?: any // cast.framework namespace from cast_sender.js
  }
}

export interface CastItem {
  id: string
  source?: string // 'yt' | 'au' (defaults to yt → audio/mp4)
  title: string
  artist: string
  artwork?: string | null
}

interface CastState {
  available: boolean // sender script loaded + receiver API supported
  connected: boolean // active receiver session
  trackId: string | null
  position: number // seconds
  duration: number // seconds
  paused: boolean
  muted: boolean
  volume: number // 0-100 (receiver volume)
  actions: {
    init: () => void
    castTrack: (item: CastItem, urlPath: string) => Promise<boolean>
    stopCast: () => void
    toggleRemote: () => void
    seekRemote: (sec: number) => void
    setVolumeRemote: (v: number) => void
    getPosition: () => number
  }
}

const SENDER_SCRIPT_ID = 'dhun-cast-sender'
const SENDER_SCRIPT_SRC =
  'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1'
// Fallback for chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID (same constant).
const DEFAULT_RECEIVER_APP_ID = 'CC1AD845'

let initStarted = false
let remotePlayer: any = null
let remoteController: any = null

function sdk(): { framework: any; chromeCast: any } | null {
  if (typeof window === 'undefined') return null
  const framework = window.cast?.framework
  const chromeCast = window.chrome?.cast
  if (!framework || !chromeCast) return null
  return { framework, chromeCast }
}

/** Wire cast context options + session/remote-player listeners. Runs post-SDK-load. */
function setupCast() {
  const s = sdk()
  if (!s) return
  const { framework, chromeCast } = s
  try {
    const castContext = framework.CastContext.getInstance()
    castContext.setOptions({
      receiverApplicationId: chromeCast.media?.DEFAULT_MEDIA_RECEIVER_APP_ID || DEFAULT_RECEIVER_APP_ID,
      autoJoinPolicy: chromeCast.AutoJoinPolicy.ANY_ORIGIN,
    })

    castContext.addEventListener(framework.CastContextEventType.SESSION_STATE_CHANGED, (event: any) => {
      const state = event?.sessionState
      const started =
        state === framework.SessionState.SESSION_STARTED ||
        state === framework.SessionState.SESSION_RESUMED
      const ended =
        state === framework.SessionState.SESSION_ENDED ||
        state === framework.SessionState.SESSION_END_FAILED ||
        state === framework.SessionState.SESSION_STOPPED
      if (started) {
        useCast.setState({ connected: true })
      } else if (ended) {
        useCast.setState({ connected: false, trackId: null, paused: true, position: 0, duration: 0 })
      }
    })

    remotePlayer = new framework.RemotePlayer()
    remoteController = new framework.RemotePlayerController(remotePlayer)
    remoteController.addEventListener(framework.RemotePlayerEventType.ANY_EVENT, () => {
      if (!remotePlayer) return
      useCast.setState({
        position: Number(remotePlayer.currentTime) || 0,
        duration: Number(remotePlayer.duration) || 0,
        paused: !!remotePlayer.isPaused,
        muted: !!remotePlayer.isMuted,
        volume: Math.round((Number(remotePlayer.volumeLevel) || 0) * 100),
      })
    })

    useCast.setState({ available: true })
  } catch {
    useCast.setState({ available: false })
  }
}

export const useCast = create<CastState>((set, get) => ({
  available: false,
  connected: false,
  trackId: null,
  position: 0,
  duration: 0,
  paused: true,
  muted: false,
  volume: 100,

  actions: {
    /** Call once from the app root. Injects cast_sender.js and wires listeners. */
    init: () => {
      if (initStarted || typeof window === 'undefined') return
      initStarted = true

      // SDK already present (double init / HMR re-run) — wire immediately.
      if (sdk()) {
        setupCast()
        return
      }

      // MUST exist before the sender script loads — the SDK calls it on readiness.
      const prev = window.__onGCastApiAvailable
      window.__onGCastApiAvailable = (available: boolean) => {
        try {
          prev?.(available)
        } catch {}
        if (available) setupCast()
        else useCast.setState({ available: false })
      }

      if (!document.getElementById(SENDER_SCRIPT_ID)) {
        const tag = document.createElement('script')
        tag.id = SENDER_SCRIPT_ID
        tag.src = SENDER_SCRIPT_SRC
        tag.async = true
        document.head.appendChild(tag)
      }
    },

    /**
     * Request a session (if none) and load a track on the receiver.
     * `urlPath` is resolved against window.location.origin (same-origin media URL).
     * Must be called from a user gesture — requestSession shows the device picker.
     */
    castTrack: async (item, urlPath) => {
      const s = sdk()
      if (!s) return false
      const { framework, chromeCast } = s
      try {
        const castContext = framework.CastContext.getInstance()
        let session = castContext.getCurrentSession()
        if (!session) {
          const errorCode = await castContext.requestSession()
          // Resolves with cast.framework.SessionRequestErrorCode (0 = SUCCESS).
          if (typeof errorCode === 'number' && errorCode !== 0) return false
          session = castContext.getCurrentSession()
        }
        if (!session) return false

        const mediaInfo = new chromeCast.media.MediaInfo(
          new URL(urlPath, window.location.origin).href,
          item.source === 'au' ? 'audio/mpeg' : 'audio/mp4'
        )
        const metadata = new chromeCast.media.MusicTrackMediaMetadata()
        metadata.title = item.title
        metadata.artist = item.artist
        if (item.artwork) metadata.images = [new chromeCast.Image(item.artwork)]
        mediaInfo.metadata = metadata

        await session.loadMedia(new chromeCast.media.LoadRequest(mediaInfo))
        set({ trackId: item.id, paused: false, position: 0, duration: 0 })
        return true
      } catch {
        return false
      }
    },

    /** End the receiver session and reset local cast state. */
    stopCast: () => {
      const s = sdk()
      if (s) {
        try {
          s.framework.CastContext.getInstance().getCurrentSession()?.endSession?.(true)
        } catch {}
      }
      set({ connected: false, trackId: null, paused: true, position: 0, duration: 0 })
    },

    /** Play/pause toggle on the receiver (RemotePlayerController.playOrStop semantics). */
    toggleRemote: () => {
      try {
        remoteController?.playOrStop?.()
      } catch {}
    },

    /** Seek the receiver. Sets remotePlayer.currentTime then issues the seek request. */
    seekRemote: (sec: number) => {
      const s = sdk()
      if (!s || !remotePlayer || !remoteController) return
      try {
        remotePlayer.currentTime = sec
        if (s.framework.SeekRequest) remoteController.seek(new s.framework.SeekRequest(sec))
        else remoteController.seek() // canonical CAF form: reads remotePlayer.currentTime
      } catch {}
    },

    /** Set receiver volume (0-100 → session.setVolume 0-1). */
    setVolumeRemote: (v: number) => {
      const s = sdk()
      if (!s) return
      try {
        const vol = Math.max(0, Math.min(100, v))
        const session = s.framework.CastContext.getInstance().getCurrentSession()
        if (!session?.setVolume) return
        set({ volume: vol })
        session.setVolume(vol / 100)
      } catch {}
    },

    /** Current receiver position (falls back to last synced store value). */
    getPosition: () => {
      if (remotePlayer && typeof remotePlayer.currentTime === 'number') return remotePlayer.currentTime
      return get().position
    },
  },
}))
