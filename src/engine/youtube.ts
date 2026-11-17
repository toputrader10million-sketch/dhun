// Dhun — YouTube IFrame playback engine (primary, ToS-compliant, reliable)
declare global {
  interface Window {
    YT?: any
    onYouTubeIframeAPIReady?: () => void
  }
}

export type EngineState = 'unstarted' | 'ended' | 'playing' | 'paused' | 'buffering' | 'cued'

export interface EngineEvents {
  onState?: (state: EngineState) => void
  onTime?: (current: number, duration: number) => void
  onReady?: () => void
  onError?: (code: number) => void
}

let apiLoadPromise: Promise<void> | null = null

function loadIframeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.YT && window.YT.Player) return Promise.resolve()
  if (apiLoadPromise) return apiLoadPromise
  apiLoadPromise = new Promise<void>((resolve) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      resolve()
    }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    tag.async = true
    document.head.appendChild(tag)
    // Safety: resolve anyway after 8s if API event missed (script cached edge cases)
    setTimeout(() => {
      if (window.YT && window.YT.Player) resolve()
    }, 8000)
  })
  return apiLoadPromise
}

function mapState(s: number): EngineState {
  switch (s) {
    case -1:
      return 'unstarted'
    case 0:
      return 'ended'
    case 1:
      return 'playing'
    case 2:
      return 'paused'
    case 3:
      return 'buffering'
    case 5:
      return 'cued'
    default:
      return 'unstarted'
  }
}

export class YouTubeEngine {
  private player: any = null
  private hostId = 'dhun-yt-host'
  private creating: Promise<void> | null = null
  private events: EngineEvents = {}
  private timer: ReturnType<typeof setInterval> | null = null
  public currentVideoId: string | null = null

  setEvents(e: EngineEvents) {
    this.events = e
  }

  /** Create the hidden iframe player once. */
  async ensure(): Promise<void> {
    if (typeof window === 'undefined') return
    if (this.player) return
    if (this.creating) return this.creating
    this.creating = (async () => {
      await loadIframeApi()
      await new Promise<void>((resolve) => {
        let host = document.getElementById(this.hostId)
        if (!host) {
          // Fallback: create host ourselves (defensive)
          const wrap = document.createElement('div')
          wrap.style.cssText =
            'position:fixed;right:6px;bottom:6px;width:80px;height:45px;opacity:0.01;pointer-events:none;z-index:-1;overflow:hidden'
          host = document.createElement('div')
          host.id = this.hostId
          wrap.appendChild(host)
          document.body.appendChild(wrap)
        }
        this.player = new window.YT.Player(this.hostId, {
          height: '90',
          width: '160',
          playerVars: {
            playsinline: 1,
            controls: 0,
            disablekb: 1,
            modestbranding: 1,
            rel: 0,
            fs: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              this.startPolling()
              this.events.onReady?.()
              resolve()
            },
            onStateChange: (e: any) => {
              this.events.onState?.(mapState(e.data))
            },
            onError: (e: any) => {
              this.events.onError?.(e.data)
            },
          },
        })
        // Safety resolve (in case onReady never fires)
        setTimeout(resolve, 6000)
      })
    })()
    return this.creating
  }

  async play(videoId: string, startSeconds = 0) {
    this.currentVideoId = videoId
    await this.ensure()
    if (!this.player?.loadVideoById) return
    this.player.loadVideoById({ videoId, startSeconds })
  }

  pause() {
    try {
      this.player?.pauseVideo?.()
    } catch {}
  }

  resume() {
    try {
      this.player?.playVideo?.()
    } catch {}
  }

  stop() {
    try {
      this.player?.stopVideo?.()
    } catch {}
    this.currentVideoId = null
  }

  seek(seconds: number) {
    try {
      this.player?.seekTo?.(seconds, true)
    } catch {}
  }

  setVolume(percent: number) {
    try {
      this.player?.setVolume?.(Math.round(Math.max(0, Math.min(100, percent))))
    } catch {}
  }

  getTime(): number {
    try {
      return this.player?.getCurrentTime?.() || 0
    } catch {
      return 0
    }
  }

  getDuration(): number {
    try {
      return this.player?.getDuration?.() || 0
    } catch {
      return 0
    }
  }

  getState(): EngineState {
    try {
      return mapState(this.player?.getPlayerState?.())
    } catch {
      return 'unstarted'
    }
  }

  private startPolling() {
    if (this.timer) return
    this.timer = setInterval(() => {
      if (!this.player?.getCurrentTime) return
      const cur = this.getTime()
      const dur = this.getDuration()
      if (dur > 0 || cur > 0) this.events.onTime?.(cur, dur)
    }, 500)
  }

  /** Embedding-disabled / removed video codes: 100, 101, 150 */
  static isUnplayable(code: number) {
    return code === 100 || code === 101 || code === 150
  }
}

export const youtubeEngine = new YouTubeEngine()
