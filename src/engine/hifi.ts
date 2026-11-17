// Dhun — Hi-Fi direct-stream engine (experimental).
// Uses Piped best-effort stream URLs + Web Audio graph (EQ / analyser / gain).
// Falls back to IFrame engine when no stream URL is available (common in 2025
// because YouTube blocks anonymous server-side extraction).
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
  private ctx: AudioContext | null = null
  private source: MediaElementAudioSourceNode | null = null
  private eqNodes: BiquadFilterNode[] = []
  private gain: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private events: EngineEvents = {}
  private volume = 100
  public active = false // true when this engine currently drives playback

  setEvents(e: EngineEvents) {
    this.events = e
  }

  private ensureAudio() {
    if (!this.audio) {
      const a = new Audio()
      a.preload = 'auto'
      a.crossOrigin = 'anonymous'
      a.addEventListener('ended', () => this.events.onState?.('ended'))
      a.addEventListener('playing', () => this.events.onState?.('playing'))
      a.addEventListener('pause', () => this.events.onState?.('paused'))
      a.addEventListener('waiting', () => this.events.onState?.('buffering'))
      a.addEventListener('error', () => {
        this.active = false
        this.events.onError?.('audio-error')
      })
      this.audio = a
    }
    return this.audio
  }

  private ensureGraph() {
    const audio = this.ensureAudio()
    if (this.ctx || typeof window === 'undefined') return
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext
      this.ctx = new Ctx()
      this.source = this.ctx.createMediaElementSource(audio)
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
      let prev: AudioNode = this.source
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

  /** Attempt direct playback; returns false so caller can fallback to iframe. */
  async play(videoId: string, opts?: { maxBitrate?: number }): Promise<boolean> {
    const fetched = await fetchAudioStreams(videoId)
    if (!fetched.ok || !fetched.streams?.length) return false
    const stream = pickStream(fetched.streams, opts?.maxBitrate)
    if (!stream?.url) return false
    const audio = this.ensureAudio()
    this.ensureGraph()
    if (this.ctx?.state === 'suspended') {
      try {
        await this.ctx.resume()
      } catch {}
    }
    audio.src = stream.url
    audio.volume = 1
    this.active = true
    try {
      await audio.play()
      return true
    } catch {
      this.active = false
      return false
    }
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
