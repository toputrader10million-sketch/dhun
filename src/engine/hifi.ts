// Dhun — Hi-Fi direct-stream engine (experimental).
// Uses Piped best-effort stream URLs + Web Audio graph (EQ / analyser / gain).
// Falls back to IFrame engine when no stream URL is available (common in 2025
// because YouTube blocks anonymous server-side extraction).
//
// GAPLESS PLAYBACK: a second ("standby") audio element is pre-buffered while the
// active one plays. At track end the standby is promoted instantly — no stream
// re-resolution, no buffering gap. Both elements feed the SAME Web Audio chain
// (mixing is safe because only one is audible at a time).
import type { AudioStream } from '@/lib/types'

export type EngineState = 'unstarted' | 'ended' | 'playing' | 'paused' | 'buffering' | 'cued'

export interface EngineEvents {
  onState?: (state: EngineState) => void
  onTime?: (current: number, duration: number) => void
  onError?: (message: string) => void
}

export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

export interface StreamFetchResult {
  ok: boolean
  streams?: AudioStream[]
  title?: string
  duration?: number
  error?: string
}

/** Ask our backend for best-effort audio streams for a video. */
export async function fetchAudioStreams(videoId: string, timeoutMs = 9000): Promise<StreamFetchResult> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`/api/streams/${videoId}`, { signal: ctrl.signal })
    clearTimeout(t)
    if (res.status === 200) {
      const data = await res.json()
      return { ok: true, streams: data.audioStreams || [], title: data.title, duration: data.duration }
    }
    return { ok: false, error: 'no-streams' }
  } catch {
    clearTimeout(t)
    return { ok: false, error: 'timeout' }
  }
}

function pickStream(streams: AudioStream[], maxBitrate?: number): AudioStream | null {
  const usable = streams
    .filter((s) => s.url && /audio|mp4a|opus|webm/i.test(s.mimeType || s.quality || 'audio'))
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))
  if (usable.length === 0) return null
  if (maxBitrate && maxBitrate > 0) {
    const capped = usable.find((s) => (s.bitrate || 0) <= maxBitrate)
    return capped || usable[usable.length - 1]
  }
  return usable[0]
}

class HifiEngine {
  private audio: HTMLAudioElement | null = null
  private standby: HTMLAudioElement | null = null
  private standbySrc: string | null = null
  // One MediaElementAudioSourceNode per element (createMediaElementSource is
  // single-use per element) — all feed the shared EQ → gain → analyser chain.
  private sources = new Map<HTMLAudioElement, MediaElementAudioSourceNode>()
  private ctx: AudioContext | null = null
  private eqNodes: BiquadFilterNode[] = []
  private gain: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private events: EngineEvents = {}
  private volume = 100
  private srcToken = 0 // guards stale loadedmetadata one-shots across src swaps
  public active = false // true when this engine currently drives playback

  setEvents(e: EngineEvents) {
    this.events = e
  }

  private bindElement(a: HTMLAudioElement) {
    const isActive = () => a === this.audio
    a.addEventListener('ended', () => {
      if (isActive()) this.events.onState?.('ended')
    })
    a.addEventListener('playing', () => {
      if (isActive()) this.events.onState?.('playing')
    })
    // Chrome fires 'pause' right before 'ended' — don't flash a paused state.
    a.addEventListener('pause', () => {
      if (isActive() && !a.ended) this.events.onState?.('paused')
    })
    a.addEventListener('waiting', () => {
      if (isActive()) this.events.onState?.('buffering')
    })
    a.addEventListener('timeupdate', () => {
      if (isActive() && Number.isFinite(a.duration)) this.events.onTime?.(a.currentTime, a.duration || 0)
    })
    a.addEventListener('error', () => {
      if (isActive()) {
        this.active = false
        this.events.onError?.('audio-error')
      } else {
        // Standby failed to buffer — drop it silently; preload will be retried.
        this.clearStandby()
      }
    })
  }

  private makeElement(): HTMLAudioElement {
    const a = new Audio()
    a.preload = 'auto'
    a.crossOrigin = 'anonymous'
    this.bindElement(a)
    return a
  }

  private ensureAudio(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = this.makeElement()
      if (typeof window !== 'undefined') {
        ;(window as unknown as { __dhunEngineAudio?: HTMLAudioElement }).__dhunEngineAudio = this.audio
      }
    }
    return this.audio
  }

  private ensureGraph() {
    const audio = this.ensureAudio()
    if (this.ctx || typeof window === 'undefined') return
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext
      this.ctx = new Ctx()
      this.eqNodes = EQ_FREQUENCIES.map((freq, i) => {
        const node = this.ctx!.createBiquadFilter()
        node.type = i === 0 ? 'lowshelf' : i === EQ_FREQUENCIES.length - 1 ? 'highshelf' : 'peaking'
        node.frequency.value = freq
        node.Q.value = 1
        node.gain.value = 0
        return node
      })
      this.gain = this.ctx.createGain()
      this.gain.gain.value = this.volume / 100
      this.analyser = this.ctx.createAnalyser()
      this.analyser.fftSize = 128
      let prev: AudioNode = this.connectElement(audio)
      for (const node of this.eqNodes) {
        prev.connect(node)
        prev = node
      }
      prev.connect(this.gain)
      this.gain.connect(this.analyser)
      this.analyser.connect(this.ctx.destination)
    } catch {
      // If graph creation fails, audio still plays directly.
      this.ctx = null
    }
  }

  /** Create (once) + connect an element's source node into the EQ chain head. */
  private connectElement(el: HTMLAudioElement): MediaElementAudioSourceNode {
    const existing = this.sources.get(el)
    if (existing) return existing
    const node = this.ctx!.createMediaElementSource(el)
    this.sources.set(el, node)
    return node
  }

  private disposeElement(el: HTMLAudioElement | null) {
    if (!el) return
    try {
      el.pause()
      el.removeAttribute('src')
      el.load()
    } catch {}
    try {
      this.sources.get(el)?.disconnect()
    } catch {}
    this.sources.delete(el)
    if (el === this.audio) this.audio = null
    if (el === this.standby) this.standby = null
  }

  private clearStandby() {
    const el = this.standby
    this.standbySrc = null
    this.disposeElement(el)
  }

  /** Attempt direct playback; returns false so caller can fallback to iframe. */
  async play(videoId: string, opts?: { maxBitrate?: number }): Promise<boolean> {
    const fetched = await fetchAudioStreams(videoId)
    if (!fetched.ok || !fetched.streams?.length) return false
    const stream = pickStream(fetched.streams, opts?.maxBitrate)
    if (!stream?.url) return false
    return this.playUrl(stream.url)
  }

  /**
   * Play a concrete audio URL — same pipeline as play() minus stream resolution.
   * Used for offline-cached tracks (/api/audio/<id>) and any direct stream URL.
   *
   * If `url` matches the pre-buffered standby track, it is promoted instantly
   * (zero-gap manual skip).
   */
  async playUrl(url: string, startSeconds = 0): Promise<boolean> {
    // Promotion fast-path: the requested track is already buffered in standby.
    if (this.standbySrc === url && this.standby) {
      const ok = await this.swapToPreloaded(startSeconds)
      if (ok) return true
      // swap failed → fall through to the normal path.
    } else if (this.standbySrc && this.standbySrc !== url) {
      this.clearStandby() // stale preload for a track we're no longer heading to
    }

    const audio = this.ensureAudio()
    this.ensureGraph()
    if (this.ctx?.state === 'suspended') {
      try {
        await this.ctx.resume()
      } catch {}
    }
    const token = ++this.srcToken
    audio.src = url
    audio.volume = 1
    this.active = true
    if (startSeconds > 0) {
      // currentTime is only seekable once metadata for the new src is loaded.
      audio.addEventListener(
        'loadedmetadata',
        () => {
          if (token !== this.srcToken) return // a newer playUrl superseded this one
          try {
            audio.currentTime = startSeconds
          } catch {}
        },
        { once: true }
      )
    }
    try {
      await audio.play()
      return true
    } catch {
      this.active = false
      return false
    }
  }

  /**
   * Pre-buffer `url` into the standby element (does NOT start playback).
   * Idempotent: re-preloading the same URL is a no-op.
   */
  preload(url: string) {
    if (typeof window === 'undefined') return
    if (this.standbySrc === url && this.standby) return
    try {
      const el = this.standby ?? this.makeElement()
      if (el !== this.standby) {
        this.standby = el
        // Elements added to the graph AFTER ctx exists need their own source node.
        if (this.ctx) {
          try {
            this.connectElement(el)
          } catch {}
        }
      }
      el.preload = 'auto'
      el.src = url
      el.volume = 1
      this.standbySrc = url
      try {
        el.load()
      } catch {}
    } catch {
      this.clearStandby()
    }
  }

  /** URL of the track currently pre-buffered in standby (null when none). */
  getPreloadedUrl(): string | null {
    return this.standbySrc && this.standby ? this.standbySrc : null
  }

  /**
   * Promote the pre-buffered standby element to active and start playing it.
   * Returns false when nothing is preloaded or the browser refuses to start.
   */
  async swapToPreloaded(startSeconds = 0): Promise<boolean> {
    if (!this.standby || !this.standbySrc) return false
    const next = this.standby
    const prev = this.audio
    this.audio = next
    this.standby = null
    const nextSrc = this.standbySrc
    this.standbySrc = null
    if (this.ctx?.state === 'suspended') {
      try {
        await this.ctx.resume()
      } catch {}
    }
    this.active = true
    const token = ++this.srcToken
    if (startSeconds > 0) {
      const applySeek = () => {
        if (token !== this.srcToken) return
        try {
          next.currentTime = startSeconds
        } catch {}
      }
      if (next.readyState >= 1) applySeek()
      else next.addEventListener('loadedmetadata', applySeek, { once: true })
    }
    try {
      await next.play()
    } catch {
      // Promotion failed — restore previous element as active for fallback logic.
      this.disposeElement(next)
      this.audio = prev
      if (this.audio) this.active = true
      return false
    }
    // Success: recycle the previous element (it has already ended).
    this.disposeElement(prev)
    return true
  }

  pause() {
    this.audio?.pause()
    this.active = false
  }

  resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {})
    this.audio?.play().catch(() => this.events.onError?.('audio-error'))
    this.active = true
  }

  seek(seconds: number) {
    if (this.audio) this.audio.currentTime = seconds
  }

  setVolume(percent: number) {
    this.volume = percent
    if (this.gain && this.ctx) this.gain.gain.value = percent / 100
    if (this.audio) this.audio.volume = 1 // route via gain node
    if (this.standby) this.standby.volume = 1
  }

  getTime() {
    return this.audio?.currentTime || 0
  }

  getDuration() {
    return Number.isFinite(this.audio?.duration) ? this.audio?.duration || 0 : 0
  }

  stop() {
    if (this.audio) {
      this.audio.pause()
      this.audio.removeAttribute('src')
      this.audio.load()
    }
    this.clearStandby() // free the network buffer of any preloaded track
    this.active = false
  }

  setEqGains(gains: number[]) {
    this.eqNodes.forEach((node, i) => {
      if (gains[i] !== undefined) node.gain.value = Math.max(-12, Math.min(12, gains[i]))
    })
  }

  /** FFT data for visualizer (null when graph unavailable) */
  getLevels(): Uint8Array | null {
    if (!this.analyser) return null
    const arr = new Uint8Array(this.analyser.frequencyBinCount)
    this.analyser.getByteFrequencyData(arr)
    return arr
  }
}

export const hifiEngine = new HifiEngine()
